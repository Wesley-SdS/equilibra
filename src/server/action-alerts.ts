import { and, eq, inArray, ne } from "drizzle-orm"
import type { Db } from "./db"
import { actions, companies, memberships, users } from "./db/schema"
import { today } from "./auth"
import { sendEmail } from "./email"
import { actionDeadlinesEmail, type DeadlineItem } from "./email/templates"
import { daysUntil, stageOf } from "@/lib/deadline"
import { formatDate } from "@/lib/utils"

const DAY = 86_400_000
const REPEAT_DAYS = 7

/**
 * Cron diário: um e-mail-resumo por empresa (donos e admins) com as ações que entraram na janela de prazo
 * ou continuam atrasadas há mais de uma semana. Cada ação só é avisada de novo quando muda de estágio.
 */
export async function runActionAlerts(db: Db, baseUrl: string) {
  const rows = await db.select().from(actions).where(ne(actions.status, "done"))
  const now = today()
  const byCompany = new Map<string, { overdue: DeadlineItem[]; soon: DeadlineItem[]; ids: string[] }>()
  for (const a of rows) {
    const stage = stageOf(a, now)
    if (!stage) continue
    const stale = stage === "overdue" && a.notifiedAt && Date.now() - a.notifiedAt.getTime() >= REPEAT_DAYS * DAY
    if (a.notifiedStage === stage && !stale) continue
    const group = byCompany.get(a.companyId) ?? { overdue: [], soon: [], ids: [] }
    group[stage].push({ what: a.what, who: a.who, due: formatDate(a.due), daysLeft: daysUntil(a.due, now) })
    group.ids.push(a.id)
    byCompany.set(a.companyId, group)
  }

  let emails = 0
  for (const [companyId, g] of byCompany) {
    const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) })
    const team = await db
      .select({ email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.companyId, companyId), inArray(memberships.role, ["owner", "admin"])))
    if (!company || !team.length) continue
    g.overdue.sort((a, b) => a.daysLeft - b.daysLeft)
    g.soon.sort((a, b) => a.daysLeft - b.daysLeft)
    const mail = actionDeadlinesEmail({ company: company.name, overdue: g.overdue, soon: g.soon, link: `${baseUrl}/app/plano` })
    for (const m of team) if (await sendEmail({ to: m.email, ...mail })) emails++
    // Marca como avisadas mesmo sem provedor de e-mail configurado (o aviso aparece no painel).
    for (const id of g.ids) {
      const a = rows.find((r) => r.id === id)!
      await db.update(actions).set({ notifiedStage: stageOf(a, now)!, notifiedAt: new Date() }).where(eq(actions.id, id))
    }
  }
  return { companies: byCompany.size, actions: [...byCompany.values()].reduce((n, g) => n + g.ids.length, 0), emails }
}
