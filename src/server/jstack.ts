import { and, eq } from "drizzle-orm"
import { getCookie } from "hono/cookie"
import { HTTPException } from "hono/http-exception"
import { jstack } from "jstack"
import { getDb, type Db } from "./db"
import { memberships, type Role } from "./db/schema"
import { SESSION_COOKIE, readSessionToken } from "./auth"

export const j = jstack.init()

const databaseMiddleware = j.middleware(async ({ next }) => {
  const db = await getDb()
  return await next({ db })
})

/**
 * Valida o cookie e confirma no banco que o usuário ainda pertence à empresa ativa.
 * Assim, remover alguém da equipe corta o acesso na hora, mesmo com cookie válido.
 */
const authMiddleware = j.middleware(async ({ c, ctx, next }) => {
  const session = readSessionToken(getCookie(c, SESSION_COOKIE))
  if (!session) throw new HTTPException(401, { message: "Sessão expirada. Entre novamente." })
  const { db } = ctx as { db: Db }
  const membership = await db.query.memberships.findFirst({
    where: and(eq(memberships.userId, session.userId), eq(memberships.companyId, session.companyId)),
  })
  if (!membership) throw new HTTPException(401, { message: "Você não tem mais acesso a esta empresa." })
  return await next({ session: { ...session, role: membership.role as Role } })
})

const editorMiddleware = j.middleware(async ({ ctx, next }) => {
  const { session } = ctx as { session: { role: Role } }
  if (session.role === "viewer") {
    throw new HTTPException(403, { message: "Seu perfil é somente leitura." })
  }
  return await next()
})

const ownerMiddleware = j.middleware(async ({ ctx, next }) => {
  const { session } = ctx as { session: { role: Role } }
  if (session.role !== "owner") {
    throw new HTTPException(403, { message: "Apenas o dono da conta pode fazer isso." })
  }
  return await next()
})

/** Endpoints públicos (questionário, canal de relato, login). */
export const publicProcedure = j.procedure.use(databaseMiddleware)

/** Leitura no painel: exige sessão e isola tudo por `session.companyId`. */
export const privateProcedure = publicProcedure.use(authMiddleware)

/** Alterações no painel: dono e admin. */
export const editorProcedure = privateProcedure.use(editorMiddleware)

/** Equipe e dados sensíveis da conta: só o dono. */
export const ownerProcedure = privateProcedure.use(ownerMiddleware)
