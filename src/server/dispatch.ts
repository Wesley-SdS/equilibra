import { and, desc, eq, inArray, lt, lte, or, sql } from "drizzle-orm"
import type { Db } from "./db"
import { campaignContacts, campaignDispatches, campaigns, companies } from "./db/schema"
import { today } from "./auth"
import { sendEmail } from "./email"
import { respondentEmail } from "./email/templates"
import { log } from "./log"
import { normalizePhone, sendWhatsApp } from "./whatsapp"
import { formatDate } from "@/lib/utils"
import { QUESTIONS } from "@/lib/methodology"

const DAY = 86_400_000
export const MAX_CONTACTS = 1000

export type Parsed = { whatsapp: string[]; email: string[]; invalid: number }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Lê uma lista colada (um contato por linha, ou separados por vírgula/ponto e vírgula). */
export function parseContacts(text: string): Parsed {
  const out: Parsed = { whatsapp: [], email: [], invalid: 0 }
  const seen = new Set<string>()
  for (const raw of text.split(/[\n;,]+/).map((t) => t.trim()).filter(Boolean)) {
    if (raw.includes("@")) {
      const e = raw.toLowerCase()
      if (!EMAIL.test(e)) {
        out.invalid++
      } else if (!seen.has(e)) {
        seen.add(e)
        out.email.push(e)
      }
    } else {
      const p = normalizePhone(raw)
      if (!p) {
        out.invalid++
      } else if (!seen.has(p)) {
        seen.add(p)
        out.whatsapp.push(p)
      }
    }
  }
  return out
}

/** Máscara para conferência na tela (nunca devolvemos a lista completa). */
export function maskContact(channel: "whatsapp" | "email", address: string) {
  if (channel === "email") {
    const [u, d] = address.split("@")
    return `${u!.slice(0, 2)}***@${d}`
  }
  return `+${address.slice(0, 2)} ${address.slice(2, 4)} *****-${address.slice(-4)}`
}

/** Executa `fn` sobre os itens com no máximo `n` chamadas simultâneas. */
async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<boolean>) {
  let ok = 0
  let failed = 0
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const item = items[i++]!
        if (await fn(item)) ok++
        else failed++
      }
    })
  )
  return { ok, failed }
}

/**
 * Envia o link anônimo da campanha a toda a lista de distribuição (WhatsApp e e-mail).
 * Registra só as contagens. O mesmo link vai para todos: não há como ligar contato a resposta.
 */
export async function sendCampaignDispatch(db: Db, campaignId: string, kind: "invite" | "reminder", trigger: "manual" | "auto", baseUrl: string) {
  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) })
  if (!campaign || campaign.status !== "active") return null
  const company = await db.query.companies.findFirst({ where: eq(companies.id, campaign.companyId) })
  const contacts = await db.select().from(campaignContacts).where(eq(campaignContacts.campaignId, campaignId))
  if (!company || !contacts.length) return { whatsappSent: 0, emailSent: 0, failed: 0 }

  const link = `${baseUrl}/r/${campaign.token}`
  const endsAt = formatDate(campaign.endsAt)
  const minutes = Math.max(6, Math.round((QUESTIONS.length + campaign.customQuestions.length) / 4.5))

  const wa = await pool(contacts.filter((c) => c.channel === "whatsapp"), 5, (c) =>
    sendWhatsApp({ to: c.address, template: kind, params: [company.name, campaign.name, link, endsAt] })
  )
  const mail = respondentEmail({ company: company.name, campaign: campaign.name, endsAt, link, reminder: kind === "reminder", minutes })
  const em = await pool(contacts.filter((c) => c.channel === "email"), 5, (c) => sendEmail({ to: c.address, ...mail }))

  const result = { whatsappSent: wa.ok, emailSent: em.ok, failed: wa.failed + em.failed }
  await db.insert(campaignDispatches).values({ campaignId, kind, trigger, ...result })
  log.info("dispatch.enviado", { campaignId, kind, trigger, ...result })
  return result
}

/**
 * Rotina diária: lembrete automático à lista de distribuição das campanhas que terminam em até
 * 2 dias, no máximo um a cada 48 h.
 */
export async function runContactReminders(db: Db, baseUrl: string) {
  const now = today()
  const active = await db.select().from(campaigns).where(and(eq(campaigns.status, "active"), lte(campaigns.startsAt, now)))
  let sent = 0
  let count = 0
  for (const c of active) {
    const left = Math.round((Date.parse(`${c.endsAt}T00:00:00Z`) - Date.parse(`${now}T00:00:00Z`)) / DAY)
    if (left < 0 || left > 2) continue
    const [hasContacts] = await db.select({ n: sql<number>`count(*)::int` }).from(campaignContacts).where(eq(campaignContacts.campaignId, c.id))
    if (!hasContacts!.n) continue
    const [last] = await db
      .select({ at: campaignDispatches.at })
      .from(campaignDispatches)
      .where(and(eq(campaignDispatches.campaignId, c.id), eq(campaignDispatches.kind, "reminder")))
      .orderBy(desc(campaignDispatches.at))
      .limit(1)
    if (last && Date.now() - last.at.getTime() < 2 * DAY) continue
    const r = await sendCampaignDispatch(db, c.id, "reminder", "auto", baseUrl)
    if (r) {
      count++
      sent += r.whatsappSent + r.emailSent
    }
  }
  return { campaigns: count, messages: sent }
}

/** Apaga a lista de distribuição de campanhas encerradas ou já vencidas (LGPD: minimização). */
export async function purgeFinishedContacts(db: Db, companyId?: string) {
  const finished = db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(and(or(eq(campaigns.status, "closed"), lt(campaigns.endsAt, today())), companyId ? eq(campaigns.companyId, companyId) : undefined))
  const rows = await db.delete(campaignContacts).where(inArray(campaignContacts.campaignId, finished)).returning({ id: campaignContacts.id })
  return rows.length
}

