import { getCookie } from "hono/cookie"
import { HTTPException } from "hono/http-exception"
import { jstack } from "jstack"
import { getDb } from "./db"
import { SESSION_COOKIE, readSessionToken } from "./auth"

export const j = jstack.init()

const databaseMiddleware = j.middleware(async ({ next }) => {
  const db = await getDb()
  return await next({ db })
})

const authMiddleware = j.middleware(async ({ c, next }) => {
  const session = readSessionToken(getCookie(c, SESSION_COOKIE))
  if (!session) throw new HTTPException(401, { message: "Sessão expirada. Entre novamente." })
  return await next({ session })
})

/** Endpoints públicos (questionário, canal de relato, login). */
export const publicProcedure = j.procedure.use(databaseMiddleware)

/** Endpoints do painel: exigem sessão e isolam tudo por `session.companyId`. */
export const privateProcedure = publicProcedure.use(authMiddleware)
