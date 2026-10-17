import { createHash, randomBytes } from "node:crypto"
import { and, asc, eq, gt, isNull } from "drizzle-orm"
import type { Context } from "hono"
import { deleteCookie, setCookie } from "hono/cookie"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import type { Db } from "../db"
import { companies, invites, memberships, passwordResets, users } from "../db/schema"
import { SESSION_COOKIE, createSessionToken, hashPassword, verifyPassword } from "../auth"
import { audit } from "../audit"
import { j, privateProcedure, publicProcedure } from "../jstack"
import { appUrl, sendEmail } from "../email"
import { passwordResetEmail, welcomeEmail } from "../email/templates"
import { clientIp, rateLimit } from "../rate-limit"
import { jevEnabled } from "../jev"
import { trialDefaults } from "../billing"
import { LEGAL_VERSION } from "@/lib/legal"

const RESET_MINUTES = 30
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex")
import { slugify } from "@/lib/utils"

const cookieOpts = {
  httpOnly: true,
  sameSite: "Lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
}

function startSession(c: Context, userId: string, companyId: string) {
  setCookie(c, SESSION_COOKIE, createSessionToken(userId, companyId), cookieOpts)
}

export const companyInput = z.object({
  companyName: z.string().trim().min(2, "Informe o nome da empresa").max(120),
  cnpj: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 14, "CNPJ deve ter 14 dígitos"),
  employees: z.coerce.number().int().min(1, "Informe o número de funcionários").max(100000),
})

const password = z.string().min(8, "A senha precisa ter ao menos 8 caracteres").max(200)

const acceptTerms = z.literal(true, { error: "É preciso aceitar os Termos de Uso e a Política de Privacidade" })

export const signupInput = companyInput.extend({
  name: z.string().trim().min(2, "Informe seu nome").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password,
  acceptTerms,
})

async function createCompany(db: Db, data: z.infer<typeof companyInput>, ownerId: string) {
  const slug = `${slugify(data.companyName)}-${crypto.randomUUID().slice(0, 6)}`
  const [company] = await db
    .insert(companies)
    .values({ name: data.companyName, cnpj: data.cnpj, employees: data.employees, slug, ...trialDefaults() })
    .returning()
  await db.insert(memberships).values({ userId: ownerId, companyId: company!.id, role: "owner" })
  return company!
}

export const authRouter = j.router({
  me: privateProcedure.query(async ({ c, ctx }) => {
    const user = await ctx.db.query.users.findFirst({ where: eq(users.id, ctx.session.userId) })
    const company = await ctx.db.query.companies.findFirst({ where: eq(companies.id, ctx.session.companyId) })
    if (!user || !company) throw new HTTPException(401, { message: "Sessão inválida" })
    const all = await ctx.db
      .select({ id: companies.id, name: companies.name, role: memberships.role })
      .from(memberships)
      .innerJoin(companies, eq(companies.id, memberships.companyId))
      .where(eq(memberships.userId, user.id))
      .orderBy(asc(companies.name))
    return c.superjson({
      user: { id: user.id, name: user.name, email: user.email },
      termsOutdated: user.termsVersion !== LEGAL_VERSION,
      role: ctx.session.role,
      company,
      companies: all,
      jev: jevEnabled(),
    })
  }),

  signup: publicProcedure.input(signupInput).mutation(async ({ c, ctx, input }) => {
    const exists = await ctx.db.query.users.findFirst({ where: eq(users.email, input.email) })
    if (exists) throw new HTTPException(409, { message: "Já existe uma conta com este e-mail" })
    const [user] = await ctx.db
      .insert(users)
      .values({ name: input.name, email: input.email, passwordHash: hashPassword(input.password), termsAcceptedAt: new Date(), termsVersion: LEGAL_VERSION })
      .returning()
    const company = await createCompany(ctx.db, input, user!.id)
    await audit(ctx.db, { userId: user!.id, companyId: company.id }, { action: "create", entity: "empresa", entityId: company.id, summary: `Conta criada para ${company.name}` })
    startSession(c, user!.id, company.id)
    await sendEmail({ to: user!.email, ...welcomeEmail({ name: user!.name, company: company.name, link: `${appUrl(c.req.url)}/app` }) })
    return c.superjson({ ok: true })
  }),

  /** Sempre responde igual, exista ou não a conta (não revela quais e-mails estão cadastrados). */
  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().trim().toLowerCase().email("E-mail inválido") }))
    .mutation(async ({ c, ctx, input }) => {
      await rateLimit(`reset:${input.email}`, 5, 15 * 60_000)
      const user = await ctx.db.query.users.findFirst({ where: eq(users.email, input.email) })
      if (user) {
        const token = randomBytes(32).toString("base64url")
        await ctx.db.insert(passwordResets).values({
          userId: user.id,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000),
        })
        await sendEmail({
          to: user.email,
          ...passwordResetEmail({ name: user.name, minutes: RESET_MINUTES, link: `${appUrl(c.req.url)}/redefinir-senha/${token}` }),
        })
      }
      return c.superjson({ ok: true })
    }),

  checkResetToken: publicProcedure.input(z.object({ token: z.string().min(20) })).query(async ({ c, ctx, input }) => {
    const row = await ctx.db.query.passwordResets.findFirst({
      where: and(eq(passwordResets.tokenHash, sha256(input.token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())),
    })
    return c.superjson({ valid: !!row })
  }),

  resetPassword: publicProcedure
    .input(z.object({ token: z.string().min(20), password }))
    .mutation(async ({ c, ctx, input }) => {
      await rateLimit(`reset-token:${input.token.slice(0, 12)}`, 10, 15 * 60_000)
      const row = await ctx.db.query.passwordResets.findFirst({
        where: and(eq(passwordResets.tokenHash, sha256(input.token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())),
      })
      if (!row) throw new HTTPException(400, { message: "Link inválido ou expirado. Peça um novo." })
      await ctx.db.update(users).set({ passwordHash: hashPassword(input.password) }).where(eq(users.id, row.userId))
      // Invalida este e qualquer outro link pendente do mesmo usuário.
      await ctx.db.update(passwordResets).set({ usedAt: new Date() }).where(and(eq(passwordResets.userId, row.userId), isNull(passwordResets.usedAt)))
      const first = await ctx.db.query.memberships.findFirst({ where: eq(memberships.userId, row.userId), orderBy: asc(memberships.createdAt) })
      if (first) {
        await audit(ctx.db, { userId: row.userId, companyId: first.companyId }, { action: "update", entity: "usuário", entityId: row.userId, summary: "Senha redefinida por e-mail" })
        startSession(c, row.userId, first.companyId)
      }
      return c.superjson({ ok: true })
    }),

  login: publicProcedure
    .input(z.object({ email: z.string().trim().toLowerCase().email("E-mail inválido"), password: z.string().min(1, "Informe a senha") }))
    .mutation(async ({ c, ctx, input }) => {
      // Força bruta: 10 tentativas por e-mail e 30 por IP a cada 15 minutos.
      await rateLimit(`login:email:${input.email}`, 10, 15 * 60_000)
      await rateLimit(`login:ip:${clientIp(c.req.raw.headers)}`, 30, 15 * 60_000)
      const user = await ctx.db.query.users.findFirst({ where: eq(users.email, input.email) })
      if (!user || !verifyPassword(input.password, user.passwordHash)) {
        throw new HTTPException(401, { message: "E-mail ou senha incorretos" })
      }
      const first = await ctx.db.query.memberships.findFirst({
        where: eq(memberships.userId, user.id),
        orderBy: asc(memberships.createdAt),
      })
      if (!first) throw new HTTPException(403, { message: "Sua conta não está vinculada a nenhuma empresa" })
      startSession(c, user.id, first.companyId)
      return c.superjson({ ok: true })
    }),

  logout: publicProcedure.mutation(async ({ c }) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" })
    return c.superjson({ ok: true })
  }),

  /** Troca a empresa ativa (carteira de contadores/SST). */
  switchCompany: privateProcedure.input(z.object({ companyId: z.string() })).mutation(async ({ c, ctx, input }) => {
    const m = await ctx.db.query.memberships.findFirst({
      where: and(eq(memberships.userId, ctx.session.userId), eq(memberships.companyId, input.companyId)),
    })
    if (!m) throw new HTTPException(403, { message: "Você não tem acesso a esta empresa" })
    startSession(c, ctx.session.userId, input.companyId)
    return c.superjson({ ok: true })
  }),

  /** Adiciona uma nova empresa à carteira do usuário e já entra nela. */
  createCompany: privateProcedure.input(companyInput).mutation(async ({ c, ctx, input }) => {
    const company = await createCompany(ctx.db, input, ctx.session.userId)
    await audit(ctx.db, { userId: ctx.session.userId, companyId: company.id }, { action: "create", entity: "empresa", entityId: company.id, summary: `Empresa ${company.name} adicionada à carteira` })
    startSession(c, ctx.session.userId, company.id)
    return c.superjson({ id: company.id })
  }),

  /** Registra o aceite da versão vigente dos Termos e da Política (para quem aceitou uma versão anterior). */
  acceptTerms: privateProcedure.mutation(async ({ c, ctx }) => {
    await ctx.db.update(users).set({ termsAcceptedAt: new Date(), termsVersion: LEGAL_VERSION }).where(eq(users.id, ctx.session.userId))
    await audit(ctx.db, ctx.session, { action: "update", entity: "usuário", entityId: ctx.session.userId, summary: `Termos e Política aceitos (versão ${LEGAL_VERSION})` })
    return c.superjson({ ok: true })
  }),

  changePassword: privateProcedure
    .input(z.object({ current: z.string().min(1, "Informe a senha atual"), next: password }))
    .mutation(async ({ c, ctx, input }) => {
      const user = await ctx.db.query.users.findFirst({ where: eq(users.id, ctx.session.userId) })
      if (!user || !verifyPassword(input.current, user.passwordHash)) {
        throw new HTTPException(400, { message: "A senha atual está incorreta" })
      }
      await ctx.db.update(users).set({ passwordHash: hashPassword(input.next) }).where(eq(users.id, user.id))
      await audit(ctx.db, ctx.session, { action: "update", entity: "usuário", entityId: user.id, summary: "Senha alterada" })
      return c.superjson({ ok: true })
    }),

  inviteInfo: publicProcedure.input(z.object({ token: z.string().min(10) })).query(async ({ c, ctx, input }) => {
    const invite = await ctx.db.query.invites.findFirst({ where: and(eq(invites.token, input.token), isNull(invites.acceptedAt)) })
    if (!invite) throw new HTTPException(404, { message: "Convite inválido ou já utilizado" })
    const company = await ctx.db.query.companies.findFirst({ where: eq(companies.id, invite.companyId) })
    const existing = await ctx.db.query.users.findFirst({ where: eq(users.email, invite.email) })
    return c.superjson({ companyName: company?.name ?? "", email: invite.email, role: invite.role, hasAccount: !!existing })
  }),

  /** Aceita um convite: cria a conta (nome + senha) ou vincula uma conta existente (senha). */
  acceptInvite: publicProcedure
    .input(z.object({ token: z.string().min(10), name: z.string().trim().max(120).optional(), password, acceptTerms }))
    .mutation(async ({ c, ctx, input }) => {
      const invite = await ctx.db.query.invites.findFirst({ where: and(eq(invites.token, input.token), isNull(invites.acceptedAt)) })
      if (!invite) throw new HTTPException(404, { message: "Convite inválido ou já utilizado" })

      let user = await ctx.db.query.users.findFirst({ where: eq(users.email, invite.email) })
      if (user) {
        if (!verifyPassword(input.password, user.passwordHash)) throw new HTTPException(401, { message: "Senha incorreta" })
        await ctx.db.update(users).set({ termsAcceptedAt: new Date(), termsVersion: LEGAL_VERSION }).where(eq(users.id, user.id))
      } else {
        if (!input.name || input.name.length < 2) throw new HTTPException(422, { message: "Informe seu nome" })
        ;[user] = await ctx.db
          .insert(users)
          .values({ name: input.name, email: invite.email, passwordHash: hashPassword(input.password), termsAcceptedAt: new Date(), termsVersion: LEGAL_VERSION })
          .returning()
      }
      await ctx.db
        .insert(memberships)
        .values({ userId: user!.id, companyId: invite.companyId, role: invite.role })
        .onConflictDoNothing()
      await ctx.db.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id))
      await audit(ctx.db, { userId: user!.id, companyId: invite.companyId }, { action: "access", entity: "equipe", entityId: user!.id, summary: `${user!.name} entrou na equipe` })
      startSession(c, user!.id, invite.companyId)
      return c.superjson({ ok: true })
    }),
})
