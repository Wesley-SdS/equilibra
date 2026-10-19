import { and, desc, eq } from "drizzle-orm"
import type { Db } from "./db"
import { actions, campaigns, companies, questionnaireVersions, questionnaires, sectors } from "./db/schema"
import { computeCustomResults, computeHistory, computeInsights } from "./insights"

/** Tudo o que o relatório PGR mostra — usado pela tela e pelo PDF gerado no servidor. */
export async function buildReport(db: Db, companyId: string, campaignId?: string) {
  const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) })
  // Sem campanha indicada, o relatório usa a campanha NR-1 mais recente (pulsos e clima não geram PGR).
  const id =
    campaignId ??
    (
      await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .innerJoin(questionnaireVersions, eq(questionnaireVersions.id, campaigns.questionnaireVersionId))
        .innerJoin(questionnaires, eq(questionnaires.id, questionnaireVersions.questionnaireId))
        .where(and(eq(campaigns.companyId, companyId), eq(questionnaires.kind, "nr1")))
        .orderBy(desc(campaigns.createdAt))
        .limit(1)
    )[0]?.id
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
