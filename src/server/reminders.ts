import { and, eq, inArray, sql } from "drizzle-orm"
import type { Db } from "./db"
import { campaigns, companies, memberships, responses, sectors, users } from "./db/schema"
import { today } from "./auth"
import { sendEmail } from "./email"
import { campaignReminderEmail } from "./email/templates"
import { formatDate } from "@/lib/utils"

const DAY = 86_400_000

function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY)
}

/** Envia o lembrete de uma campanha para donos e admins da empresa. Retorna quantos e-mails saíram. */
export async function sendCampaignReminder(db: Db, campaignId: string, baseUrl: string) {
  const campaign = await db.query.campaigns.findFirst({ where: eq(campaigns.id, campaignId) })
  if (!campaign) return 0
  const company = await db.query.companies.findFirst({ where: eq(companies.id, campaign.companyId) })
  const team = await db
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.companyId, campaign.companyId), inArray(memberships.role, ["owner", "admin"])))
  if (!team.length || !company) return 0

  const [{ total }] = (await db
    .select({ total: sql<number>`coalesce(sum(${sectors.headcount}), 0)::int` })
    .from(sectors)
    .where(eq(sectors.companyId, campaign.companyId))) as [{ total: number }]
  const [{ n }] = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(responses)
    .where(eq(responses.campaignId, campaign.id))) as [{ n: number }]

  const email = campaignReminderEmail({
    company: company.name,
    campaign: campaign.name,
    endsAt: formatDate(campaign.endsAt),
    daysLeft: Math.max(0, daysBetween(today(), campaign.endsAt)),
    rate: total ? Math.round((n / total) * 100) : 0,
    responses: n,
    kitLink: `${baseUrl}/app/campanhas/${campaign.id}/kit`,
  })
  let sent = 0
  for (const m of team) if (await sendEmail({ to: m.email, ...email })) sent++
  await db.update(campaigns).set({ lastReminderAt: new Date() }).where(eq(campaigns.id, campaign.id))
  return sent
}

/**
 * Rotina diária (cron): campanhas ativas que terminam em até 3 dias e não receberam
 * lembrete nas últimas 48 h.
 */
export async function runDailyReminders(db: Db, baseUrl: string) {
  const now = today()
  const active = await db.select().from(campaigns).where(eq(campaigns.status, "active"))
  const due = active.filter((c) => {
    const left = daysBetween(now, c.endsAt)
    const recent = c.lastReminderAt && Date.now() - c.lastReminderAt.getTime() < 2 * DAY
    return left >= 0 && left <= 3 && c.startsAt <= now && !recent
  })
  let emails = 0
  for (const c of due) emails += await sendCampaignReminder(db, c.id, baseUrl)
  return { campaigns: due.length, emails }
}
