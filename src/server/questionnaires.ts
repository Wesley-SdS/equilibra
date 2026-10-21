import { and, desc, eq, isNull, or, sql } from "drizzle-orm"
import { HTTPException } from "hono/http-exception"
import type { Db } from "./db"
import { campaigns, questionnaireVersions, questionnaires } from "./db/schema"
import { NR1_STANDARD_ID, scoredQuestions, type QuestionnaireItem } from "@/lib/questionnaire"

/** Questionário visível para a empresa: os dela ou os de sistema (companyId nulo). */
export function visibleTo(companyId: string) {
  return or(eq(questionnaires.companyId, companyId), isNull(questionnaires.companyId))
}

/** Versão mais recente de um questionário (a que uma campanha nova deve usar). */
export async function latestVersion(db: Db, questionnaireId: string) {
  return db.query.questionnaireVersions.findFirst({
    where: eq(questionnaireVersions.questionnaireId, questionnaireId),
    orderBy: desc(questionnaireVersions.version),
  })
}

/**
 * Resolve o questionário que uma campanha nova vai aplicar: o escolhido (se visível e ativo)
 * ou o NR-1 padrão. Devolve a versão mais recente.
 */
export async function resolveVersionForCampaign(db: Db, companyId: string, questionnaireId?: string | null) {
  const id = questionnaireId ?? NR1_STANDARD_ID
  const q = await db.query.questionnaires.findFirst({ where: and(eq(questionnaires.id, id), visibleTo(companyId)) })
  if (!q) throw new HTTPException(404, { message: "Questionário não encontrado" })
  if (q.status === "archived") throw new HTTPException(400, { message: "Este questionário está arquivado. Restaure-o para lançar uma campanha." })
  const version = await latestVersion(db, q.id)
  if (!version) throw new HTTPException(400, { message: "Este questionário ainda não tem itens." })
  return { questionnaire: q, version }
}

export type CampaignQuestionnaire = {
  id: string
  name: string
  kind: string
  anonymous: boolean
  version: number
  versionId: string
  items: QuestionnaireItem[]
}

/** Versão aplicada por uma campanha, com os itens. */
export async function loadCampaignQuestionnaire(db: Db, versionId: string): Promise<CampaignQuestionnaire> {
  const [row] = await db
    .select({
      id: questionnaires.id,
      name: questionnaires.name,
      kind: questionnaires.kind,
      anonymous: questionnaires.anonymous,
      version: questionnaireVersions.version,
      versionId: questionnaireVersions.id,
      items: questionnaireVersions.items,
    })
    .from(questionnaireVersions)
    .innerJoin(questionnaires, eq(questionnaires.id, questionnaireVersions.questionnaireId))
    .where(eq(questionnaireVersions.id, versionId))
  if (!row) throw new HTTPException(500, { message: "Versão do questionário não encontrada" })
  return row
}

/** Itens pontuáveis da campanha, no formato do motor de cálculo. */
export async function campaignQuestions(db: Db, versionId: string) {
  const q = await loadCampaignQuestionnaire(db, versionId)
  return { questionnaire: q, questions: scoredQuestions(q.items) }
}

/** Resumo por questionário para a biblioteca: versão atual, quantidade de itens e uso em campanhas. */
export async function listQuestionnaires(db: Db, companyId: string) {
  const rows = await db
    .select({
      id: questionnaires.id,
      companyId: questionnaires.companyId,
      name: questionnaires.name,
      purpose: questionnaires.purpose,
      kind: questionnaires.kind,
      anonymous: questionnaires.anonymous,
      status: questionnaires.status,
      origin: questionnaires.origin,
      instrument: questionnaires.instrument,
      createdAt: questionnaires.createdAt,
      updatedAt: questionnaires.updatedAt,
      version: sql<number>`(select max(v.version) from ${questionnaireVersions} v where v.questionnaire_id = questionnaires.id)::int`,
      itemCount: sql<number>`(select jsonb_array_length(v.items) from ${questionnaireVersions} v where v.questionnaire_id = questionnaires.id order by v.version desc limit 1)::int`,
      campaignCount: sql<number>`(select count(*) from ${campaigns} c join ${questionnaireVersions} v on v.id = c.questionnaire_version_id where v.questionnaire_id = questionnaires.id and c.company_id = ${companyId})::int`,
      lastCampaignName: sql<string | null>`(select c.name from ${campaigns} c join ${questionnaireVersions} v on v.id = c.questionnaire_version_id where v.questionnaire_id = questionnaires.id and c.company_id = ${companyId} order by c.starts_at desc limit 1)`,
      lastCampaignStartsAt: sql<string | null>`(select c.starts_at from ${campaigns} c join ${questionnaireVersions} v on v.id = c.questionnaire_version_id where v.questionnaire_id = questionnaires.id and c.company_id = ${companyId} order by c.starts_at desc limit 1)`,
    })
    .from(questionnaires)
    .where(visibleTo(companyId))
  // (As subconsultas citam questionnaires.id por extenso: em select de uma tabela só o Drizzle omite o prefixo.)
  // Sistema primeiro, depois os da empresa, ativos antes dos arquivados, mais recentes primeiro.
  return rows.sort(
    (a, b) =>
      Number(a.companyId !== null) - Number(b.companyId !== null) ||
      Number(a.status === "archived") - Number(b.status === "archived") ||
      b.updatedAt.getTime() - a.updatedAt.getTime()
  )
}
