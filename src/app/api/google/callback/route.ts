import { cookies } from "next/headers"
import { SESSION_COOKIE, readSessionToken } from "@/server/auth"
import { appUrl } from "@/server/email"
import { GOOGLE_TOKEN_COOKIE, exchangeCode, googleFormsEnabled, verifyState } from "@/server/google"
import { log } from "@/server/log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Retorno do Google: confere o estado assinado (mesma empresa e usuário que iniciaram), troca o código
 * por um token de acesso de curta duração e guarda só num cookie httpOnly. Nada vai para o banco.
 */
export async function GET(req: Request) {
  const base = appUrl(req.url)
  const back = (status: string) => Response.redirect(`${base}/app/questionario/importar?google=${status}`, 302)
  if (!googleFormsEnabled()) return back("indisponivel")
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = verifyState(url.searchParams.get("state") ?? "")
  const jar = await cookies()
  const session = readSessionToken(jar.get(SESSION_COOKIE)?.value)
  if (!code || !state || !session || state.companyId !== session.companyId || state.userId !== session.userId) return back("negado")
  try {
    const { token, expiresIn } = await exchangeCode(code, `${base}/api/google/callback`)
    jar.set(GOOGLE_TOKEN_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: base.startsWith("https://"), path: "/", maxAge: expiresIn })
    return back("conectado")
  } catch (err) {
    log.error("google.oauth_falhou", { err })
    return back("erro")
  }
}
