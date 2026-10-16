import { and, desc, eq, isNull, ne } from "drizzle-orm"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { auditLog, companies, invites, memberships, ROLES, users } from "../db/schema"
import { publicToken } from "../auth"
import { audit } from "../audit"
import { j, ownerProcedure, privateProcedure } from "../jstack"
import { appUrl, sendEmail } from "../email"
import { inviteEmail } from "../email/templates"

const ROLE_LABEL = { owner: "Dono", admin: "Admin", viewer: "Leitor" } as const

export const teamRouter = j.router({
  list: privateProcedure.query(async ({ c, ctx }) => {
    const members = await ctx.db
      .select({ id: users.id, name: users.name, email: users.email, role: memberships.role, since: memberships.createdAt })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.companyId, ctx.session.companyId))
      .orderBy(memberships.createdAt)
    const pending = await ctx.db
      .select({ id: invites.id, email: invites.email, role: invites.role, token: invites.token, createdAt: invites.createdAt })
      .from(invites)
      .where(and(eq(invites.companyId, ctx.session.companyId), isNull(invites.acceptedAt)))
      .orderBy(desc(invites.createdAt))
    return c.superjson({ members, pending, me: ctx.session.userId })
  }),

  invite: ownerProcedure
    .input(z.object({ email: z.string().trim().toLowerCase().email("E-mail inválido"), role: z.enum(ROLES).exclude(["owner"]) }))
    .mutation(async ({ c, ctx, input }) => {
      const already = await ctx.db
        .select({ id: users.id })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.companyId, ctx.session.companyId), eq(users.email, input.email)))
      if (already.length) throw new HTTPException(409, { message: "Esta pessoa já faz parte da equipe" })
      const [invite] = await ctx.db
        .insert(invites)
        .values({ companyId: ctx.session.companyId, email: input.email, role: input.role, token: publicToken(), invitedBy: ctx.session.userId })
        .returning()
      await audit(ctx.db, ctx.session, { action: "invite", entity: "equipe", entityId: invite!.id, summary: `Convite enviado para ${input.email} (${ROLE_LABEL[input.role]})` })
      const [inviter, company] = await Promise.all([
        ctx.db.query.users.findFirst({ where: eq(users.id, ctx.session.userId) }),
        ctx.db.query.companies.findFirst({ where: eq(companies.id, ctx.session.companyId) }),
      ])
      const emailSent = await sendEmail({
        to: input.email,
        ...inviteEmail({
          inviter: inviter?.name ?? "Alguém da equipe",
          company: company?.name ?? "",
          role: ROLE_LABEL[input.role],
          link: `${appUrl(c.req.url)}/convite/${invite!.token}`,
        }),
      })
      return c.superjson({ token: invite!.token, emailSent })
    }),

  revokeInvite: ownerProcedure.input(z.object({ id: z.string() })).mutation(async ({ c, ctx, input }) => {
    await ctx.db.delete(invites).where(and(eq(invites.id, input.id), eq(invites.companyId, ctx.session.companyId)))
    await audit(ctx.db, ctx.session, { action: "delete", entity: "equipe", entityId: input.id, summary: "Convite cancelado" })
    return c.superjson({ ok: true })
  }),

  setRole: ownerProcedure
    .input(z.object({ userId: z.string(), role: z.enum(ROLES) }))
    .mutation(async ({ c, ctx, input }) => {
      if (input.userId === ctx.session.userId && input.role !== "owner") {
        const owners = await ctx.db
          .select({ id: memberships.userId })
          .from(memberships)
          .where(and(eq(memberships.companyId, ctx.session.companyId), eq(memberships.role, "owner"), ne(memberships.userId, ctx.session.userId)))
        if (!owners.length) throw new HTTPException(400, { message: "A empresa precisa de ao menos um dono" })
      }
      await ctx.db
        .update(memberships)
        .set({ role: input.role })
        .where(and(eq(memberships.companyId, ctx.session.companyId), eq(memberships.userId, input.userId)))
      const u = await ctx.db.query.users.findFirst({ where: eq(users.id, input.userId) })
      await audit(ctx.db, ctx.session, { action: "update", entity: "equipe", entityId: input.userId, summary: `${u?.name ?? "Usuário"} agora é ${ROLE_LABEL[input.role]}` })
      return c.superjson({ ok: true })
    }),

  remove: ownerProcedure.input(z.object({ userId: z.string() })).mutation(async ({ c, ctx, input }) => {
    if (input.userId === ctx.session.userId) throw new HTTPException(400, { message: "Você não pode remover a si mesmo" })
    const u = await ctx.db.query.users.findFirst({ where: eq(users.id, input.userId) })
    await ctx.db.delete(memberships).where(and(eq(memberships.companyId, ctx.session.companyId), eq(memberships.userId, input.userId)))
    await audit(ctx.db, ctx.session, { action: "delete", entity: "equipe", entityId: input.userId, summary: `${u?.name ?? "Usuário"} removido da equipe` })
    return c.superjson({ ok: true })
  }),
})

export const companyRouter = j.router({
  update: ownerProcedure
    .input(
      z.object({
        name: z.string().trim().min(2, "Informe o nome da empresa").max(120),
        cnpj: z
          .string()
          .transform((v) => v.replace(/\D/g, ""))
          .refine((v) => v.length === 14, "CNPJ deve ter 14 dígitos"),
        employees: z.coerce.number().int().min(1).max(100000),
      })
    )
    .mutation(async ({ c, ctx, input }) => {
      await ctx.db.update(companies).set(input).where(eq(companies.id, ctx.session.companyId))
      await audit(ctx.db, ctx.session, { action: "update", entity: "empresa", entityId: ctx.session.companyId, summary: "Dados da empresa atualizados" })
      return c.superjson({ ok: true })
    }),

  auditLog: privateProcedure.query(async ({ c, ctx }) => {
    const rows = await ctx.db
      .select({ id: auditLog.id, action: auditLog.action, entity: auditLog.entity, summary: auditLog.summary, at: auditLog.at, user: users.name })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(eq(auditLog.companyId, ctx.session.companyId))
      .orderBy(desc(auditLog.at))
      .limit(300)
    return c.superjson(rows)
  }),
})
