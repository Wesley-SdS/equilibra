import { desc, eq } from "drizzle-orm"
import type { Db } from "./db"
import { actions, campaigns, companies, sectors } from "./db/schema"
import { computeCustomResults, computeHistory, computeInsights } from "./insights"

/** Tudo o que o relatório PGR mostra — usado pela tela e pelo PDF gerado no servidor. */
export async function buildReport(db: Db, companyId: string, campaignId?: string) {
  const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) })
  const id =
    campaignId ??
    (await db.query.campaigns.findFirst({ where: eq(campaigns.companyId, companyId), orderBy: desc(campaigns.createdAt) }))?.id
  const [insights, plan, sectorList, history, custom] = await Promise.all([
    id ? computeInsights(db, companyId, id) : Promise.resolve(null),
    db.select().from(actions).where(eq(actions.companyId, companyId)),
    db.select().from(sectors).where(eq(sectors.companyId, companyId)),
    computeHistory(db, companyId),
    id ? computeCustomResults(db, companyId, id) : Promise.resolve(null),
  ])
  return { company: company!, insights, plan, sectors: sectorList, history, custom }
}

export type Report = Awaited<ReturnType<typeof buildReport>>
