import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { log } from "./log"

// WhatsApp Business Cloud API (Meta). Fora da janela de 24h, a Meta só aceita mensagens de
// TEMPLATE pré-aprovado. Os templates esperados (categoria "utility", idioma pt_BR) têm 4 variáveis:
//   {{1}} empresa · {{2}} campanha · {{3}} link do questionário · {{4}} data de encerramento
// Sem credenciais, roda em simulação: grava a mensagem em .data/whatsapp/ (dev) ou na caixa de
// saída em memória (testes).

export type WhatsAppMessage = { to: string; template: "invite" | "reminder"; params: [string, string, string, string] }

export const whatsappOutbox: WhatsAppMessage[] = []

const TOKEN = process.env.WHATSAPP_TOKEN
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
const VERSION = process.env.WHATSAPP_API_VERSION ?? "v21.0"
const TEMPLATES = {
  invite: process.env.WHATSAPP_TEMPLATE_INVITE ?? "equilibra_convite_avaliacao",
  reminder: process.env.WHATSAPP_TEMPLATE_REMINDER ?? "equilibra_lembrete_avaliacao",
}

export const whatsappMode = TOKEN && PHONE_ID ? "meta" : "simulacao"

/** Normaliza telefone brasileiro para E.164 sem "+" (ex.: 5511987654321). Retorna null se inválido. */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "")
  if (d.startsWith("00")) d = d.slice(2)
  if (d.length === 10 || d.length === 11) d = `55${d}`
  if (!/^55\d{10,11}$/.test(d)) return null
  // Celular brasileiro: 9 dígitos começando com 9 após o DDD
  const local = d.slice(4)
  if (local.length === 9 && !local.startsWith("9")) return null
  return d
}

export async function sendWhatsApp(msg: WhatsAppMessage): Promise<boolean> {
  whatsappOutbox.push(msg)
  if (whatsappMode === "simulacao") {
    if (process.env.VITEST) return true
    try {
      const dir = path.join(process.cwd(), ".data", "whatsapp")
      mkdirSync(dir, { recursive: true })
      writeFileSync(path.join(dir, `${Date.now()}-${msg.template}.json`), JSON.stringify(msg, null, 2))
    } catch (err) {
      log.warn("whatsapp.simulacao_falha_ao_salvar", { err })
    }
    return true
  }
  try {
    const res = await fetch(`https://graph.facebook.com/${VERSION}/${PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: msg.to,
        type: "template",
        template: {
          name: TEMPLATES[msg.template],
          language: { code: "pt_BR" },
          components: [{ type: "body", parameters: msg.params.map((text) => ({ type: "text", text })) }],
        },
      }),
    })
    if (!res.ok) {
      // Não registra o telefone: só o status e o código de erro da Meta.
      const body = (await res.json().catch(() => ({}))) as { error?: { code?: number; message?: string } }
      log.error("whatsapp.meta_recusou", { status: res.status, code: body.error?.code, message: body.error?.message })
      return false
    }
    return true
  } catch (err) {
    log.error("whatsapp.falha_envio", { err })
    return false
  }
}
