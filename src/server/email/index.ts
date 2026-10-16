import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

export type Email = { to: string | string[]; subject: string; html: string; text: string }

/** Caixa de saída em memória (usada pelos testes para inspecionar o que foi enviado). */
export const outbox: Email[] = []

const FROM = process.env.EMAIL_FROM ?? "Equilibra <onboarding@resend.dev>"

/**
 * Envia um e-mail transacional.
 * - Com RESEND_API_KEY: envia de verdade pelo Resend.
 * - Sem a chave (desenvolvimento): salva o HTML em .data/emails/ e loga o caminho.
 * Falhas de envio não derrubam a ação do usuário: são logadas e retornam false.
 */
export async function sendEmail(email: Email): Promise<boolean> {
  outbox.push(email)
  const key = process.env.RESEND_API_KEY
  if (!key) {
    if (process.env.NODE_ENV === "test" || process.env.VITEST) return true
    try {
      const dir = path.join(process.cwd(), ".data", "emails")
      mkdirSync(dir, { recursive: true })
      const file = path.join(dir, `${Date.now()}-${email.subject.replace(/[^\w]+/g, "-").slice(0, 40)}.html`)
      writeFileSync(file, email.html)
      console.info(`[email] (dev, sem RESEND_API_KEY) “${email.subject}” → ${[email.to].flat().join(", ")}\n        ${file}`)
    } catch (err) {
      console.error("[email] falha ao salvar e-mail de desenvolvimento", err)
    }
    return true
  }
  try {
    const { Resend } = await import("resend")
    const resend = new Resend(key)
    const { error } = await resend.emails.send({ from: FROM, to: email.to, subject: email.subject, html: email.html, text: email.text })
    if (error) {
      console.error("[email] Resend recusou o envio", error)
      return false
    }
    return true
  } catch (err) {
    console.error("[email] falha no envio", err)
    return false
  }
}

/** URL pública da aplicação para montar links nos e-mails. */
export function appUrl(requestUrl?: string) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "")
  if (requestUrl) return new URL(requestUrl).origin
  return "http://localhost:3000"
}
