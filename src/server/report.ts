import { and, desc, eq, ne } from "drizzle-orm"
import type { Db } from "./db"
import { actions, campaigns, companies, observations, questionnaireVersions, questionnaires, reportSummaries, responses, sectors } from "./db/schema"
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
  // Resumo executivo: o aprovado mais recente desta campanha (ou o rascunho, para revisão na tela).
  const summaries = id ? await db.select().from(reportSummaries).where(and(eq(reportSummaries.companyId, companyId), eq(reportSummaries.campaignId, id))).orderBy(desc(reportSummaries.createdAt)) : []
  const approved = summaries.find((s) => s.status === "approved") ?? null
  const draft = summaries[0] && summaries[0].status === "draft" ? summaries[0] : null
  const obs = await db.select().from(observations).where(eq(observations.companyId, companyId)).orderBy(desc(observations.day))
  // Outras pesquisas (pulso, clima) aplicadas: entram como anexo informativo, fora do score NR-1.
  const others = await db
    .select({ id: campaigns.id, name: campaigns.name, startsAt: campaigns.startsAt, kind: questionnaires.kind, questionnaire: questionnaires.name, anonymous: questionnaires.anonymous })
    .from(campaigns)
    .innerJoin(questionnaireVersions, eq(questionnaireVersions.id, campaigns.questionnaireVersionId))
    .innerJoin(questionnaires, eq(questionnaires.id, questionnaireVersions.questionnaireId))
    .where(and(eq(campaigns.companyId, companyId), ne(questionnaires.kind, "nr1")))
    .orderBy(desc(campaigns.startsAt))
  const otherCampaigns = await Promise.all(
    others.map(async (o) => ({ ...o, responses: (await db.select({ id: responses.id }).from(responses).where(eq(responses.campaignId, o.id))).length }))
  )
  return { company: company!, insights, plan, sectors: sectorList, history, custom, summary: approved, summaryDraft: draft, observations: obs, otherCampaigns }
}

export type Report = Awaited<ReturnType<typeof buildReport>>
