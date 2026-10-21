import { and, eq } from "drizzle-orm"
import { cookies } from "next/headers"
import { SESSION_COOKIE, readSessionToken } from "@/server/auth"
import { getDb } from "@/server/db"
import { memberships } from "@/server/db/schema"
import { appUrl } from "@/server/email"
import { googleAuthUrl, googleFormsEnabled, signState } from "@/server/google"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Início da conexão com o Google Forms (somente leitura), para importar um formulário. */
export async function GET(req: Request) {
  if (!googleFormsEnabled()) return new Response("Integração com o Google Forms não configurada.", { status: 404 })
  const session = readSessionToken((await cookies()).get(SESSION_COOKIE)?.value)
  if (!session) return Response.redirect(`${appUrl(req.url)}/entrar`, 302)
  const db = await getDb()
  const member = await db.query.memberships.findFirst({ where: and(eq(memberships.userId, session.userId), eq(memberships.companyId, session.companyId)) })
  if (!member || member.role === "viewer") return new Response("Seu perfil não pode importar formulários.", { status: 403 })
  const url = googleAuthUrl(signState(session.companyId, session.userId), `${appUrl(req.url)}/api/google/callback`)
  return Response.redirect(url, 302)
}
