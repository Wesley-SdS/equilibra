import { eq } from "drizzle-orm"
import { deleteCookie, setCookie } from "hono/cookie"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { companies, users } from "../db/schema"
import { SESSION_COOKIE, createSessionToken, hashPassword, verifyPassword } from "../auth"
import { j, privateProcedure, publicProcedure } from "../jstack"
import { slugify } from "@/lib/utils"

const cookieOpts = {
  httpOnly: true,
  sameSite: "Lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
}

export const signupInput = z.object({
  companyName: z.string().trim().min(2, "Informe o nome da empresa"),
  cnpj: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 14, "CNPJ deve ter 14 dígitos"),
  employees: z.coerce.number().int().min(1).max(100000),
  name: z.string().trim().min(2, "Informe seu nome"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres"),
})

export const authRouter = j.router({
  me: privateProcedure.query(async ({ c, ctx }) => {
    const user = await ctx.db.query.users.findFirst({ where: eq(users.id, ctx.session.userId) })
    const company = await ctx.db.query.companies.findFirst({
      where: eq(companies.id, ctx.session.companyId),
    })
    if (!user || !company) throw new HTTPException(401, { message: "Sessão inválida" })
    return c.superjson({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      company,
    })
  }),

  signup: publicProcedure.input(signupInput).mutation(async ({ c, ctx, input }) => {
    const exists = await ctx.db.query.users.findFirst({ where: eq(users.email, input.email) })
    if (exists) throw new HTTPException(409, { message: "Já existe uma conta com este e-mail" })

    const slug = `${slugify(input.companyName)}-${crypto.randomUUID().slice(0, 6)}`
    const [company] = await ctx.db
      .insert(companies)
      .values({ name: input.companyName, cnpj: input.cnpj, employees: input.employees, slug })
      .returning()
    const [user] = await ctx.db
      .insert(users)
      .values({
        companyId: company!.id,
        name: input.name,
        email: input.email,
        passwordHash: hashPassword(input.password),
      })
      .returning()

    setCookie(c, SESSION_COOKIE, createSessionToken(user!.id, company!.id), cookieOpts)
    return c.superjson({ ok: true })
  }),

  login: publicProcedure
    .input(z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }))
    .mutation(async ({ c, ctx, input }) => {
      const user = await ctx.db.query.users.findFirst({ where: eq(users.email, input.email) })
      if (!user || !verifyPassword(input.password, user.passwordHash)) {
        throw new HTTPException(401, { message: "E-mail ou senha incorretos" })
      }
      setCookie(c, SESSION_COOKIE, createSessionToken(user.id, user.companyId), cookieOpts)
      return c.superjson({ ok: true })
    }),

  logout: publicProcedure.mutation(async ({ c }) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" })
    return c.superjson({ ok: true })
  }),
})
