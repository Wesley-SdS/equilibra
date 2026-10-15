import { and, desc, eq, inArray, ne, sql } from "drizzle-orm"
import type { Db } from "./db"
import { actions, answers, campaigns, companies, memberships, responses, sectors } from "./db/schema"
import { DIMENSIONS, K_ANONYMITY, QUESTIONS, itemRisk, riskLevel, scoreDimensions, type DimensionId } from "@/lib/methodology"

export type HeatmapRow = {
  key: string
  label: string
  responses: number
  grouped: boolean
  scores: Record<DimensionId, number | null>
}

/**
 * Calcula os indicadores de uma campanha respeitando o k-anonimato:
 * setores com menos de K respostas são somados num grupo "Outros setores";
 * se esse grupo também ficar abaixo de K, ele não aparece (só entra no total).
 */
export async function computeInsights(db: Db, companyId: string, campaignId: string) {
  const campaign = await db.query.campaigns.findFirst({
    where: and(eq(campaigns.id, campaignId), eq(campaigns.companyId, companyId)),
  })
  if (!campaign) return null

  const companySectors = await db.select().from(sectors).where(eq(sectors.companyId, companyId))
  const resp = await db.select().from(responses).where(eq(responses.campaignId, campaignId))
  const ans = resp.length
    ? await db
        .select()
        .from(answers)
        .where(
          inArray(
            answers.responseId,
            resp.map((r) => r.id)
          )
        )
    : []

  const sectorOfResponse = new Map(resp.map((r) => [r.id, r.sectorId]))
  const answersBySector = new Map<string, { questionId: string; value: number }[]>()
  for (const a of ans) {
    const s = sectorOfResponse.get(a.responseId)!
    const list = answersBySector.get(s) ?? []
    list.push(a)
    answersBySector.set(s, list)
  }
  const countBySector = new Map<string, number>()
  for (const r of resp) countBySector.set(r.sectorId, (countBySector.get(r.sectorId) ?? 0) + 1)

  const headcount = companySectors.reduce((s, x) => s + x.headcount, 0)
  const overall = scoreDimensions(ans)

  const rows: HeatmapRow[] = []
  const small: { answers: { questionId: string; value: number }[]; n: number } = { answers: [], n: 0 }
  for (const s of companySectors) {
    const n = countBySector.get(s.id) ?? 0
    if (n === 0) continue
    const list = answersBySector.get(s.id) ?? []
    if (n >= K_ANONYMITY) {
      rows.push({ key: s.id, label: s.name, responses: n, grouped: false, scores: scoreDimensions(list) })
    } else {
      small.answers.push(...list)
      small.n += n
    }
  }
  if (small.n >= K_ANONYMITY) {
    rows.push({
      key: "outros",
      label: "Outros setores",
      responses: small.n,
      grouped: true,
      scores: scoreDimensions(small.answers),
    })
  }

  const ranking = DIMENSIONS.map((d) => {
    const score = overall[d.id] ?? 0
    return { id: d.id, name: d.name, short: d.short, severity: d.severity, score, level: riskLevel(score) }
  }).sort((a, b) => b.score - a.score)

  const index = resp.length ? Math.round(ranking.reduce((s, r) => s + r.score, 0) / ranking.length) : 0

  const participation = companySectors.map((s) => ({
    id: s.id,
    name: s.name,
    headcount: s.headcount,
    responses: countBySector.get(s.id) ?? 0,
  }))

  return {
    campaign,
    totals: {
      responses: resp.length,
      headcount,
      rate: headcount ? Math.round((resp.length / headcount) * 100) : 0,
      index,
      level: riskLevel(index),
      alerts: ranking.filter((r) => r.score >= 50).length,
      critical: ranking.filter((r) => r.score >= 75).length,
      hiddenResponses: small.n >= K_ANONYMITY ? 0 : small.n,
    },
    heatmap: rows,
    ranking,
    participation,
  }
}

export type Insights = NonNullable<Awaited<ReturnType<typeof computeInsights>>>

/** Evolução do índice e de cada dimensão ao longo das campanhas (mais antiga primeiro). */
export async function computeHistory(db: Db, companyId: string) {
  const list = await db.select().from(campaigns).where(eq(campaigns.companyId, companyId)).orderBy(campaigns.startsAt)
  const points = []
  for (const c of list) {
    const data = await computeInsights(db, companyId, c.id)
    if (!data || data.totals.responses < K_ANONYMITY) continue
    points.push({
      id: c.id,
      name: c.name,
      startsAt: c.startsAt,
      responses: data.totals.responses,
      rate: data.totals.rate,
      index: data.totals.index,
      scores: Object.fromEntries(data.ranking.map((r) => [r.id, r.score])) as Record<DimensionId, number>,
    })
  }
  return points
}

/**
 * Detalhe de uma dimensão: score por item e distribuição das respostas.
 * Só é exibido com pelo menos K respostas no total, para não expor ninguém.
 */
export async function computeDimension(db: Db, companyId: string, campaignId: string, dimension: DimensionId) {
  const base = await computeInsights(db, companyId, campaignId)
  if (!base) return null
  const qs = QUESTIONS.filter((q) => q.dimension === dimension)
  const resp = await db.select({ id: responses.id }).from(responses).where(eq(responses.campaignId, campaignId))
  if (resp.length < K_ANONYMITY) {
    return { campaign: base.campaign, enough: false as const, items: [], sectors: [], score: 0 }
  }
  const ans = await db
    .select()
    .from(answers)
    .where(
      and(
        inArray(
          answers.responseId,
          resp.map((r) => r.id)
        ),
        inArray(
          answers.questionId,
          qs.map((q) => q.id)
        )
      )
    )
  const items = qs.map((q) => {
    const values = ans.filter((a) => a.questionId === q.id)
    const distribution = [1, 2, 3, 4, 5].map((v) => values.filter((a) => a.value === v).length)
    const risk = values.length ? Math.round((values.reduce((s, a) => s + itemRisk(q, a.value), 0) / values.length) * 25) : 0
    return { id: q.id, text: q.text, protective: !q.risk, risk, level: riskLevel(risk), distribution, n: values.length }
  })
  const sectorScores = base.heatmap
    .map((h) => ({ key: h.key, label: h.label, responses: h.responses, score: h.scores[dimension] ?? 0 }))
    .sort((a, b) => b.score - a.score)
  const score = base.ranking.find((r) => r.id === dimension)?.score ?? 0
  return { campaign: base.campaign, enough: true as const, items: items.sort((a, b) => b.risk - a.risk), sectors: sectorScores, score }
}

/** Resumo de todas as empresas do usuário, para a carteira de contadores e SST. */
export async function computePortfolio(db: Db, userId: string) {
  const list = await db
    .select({ id: companies.id, name: companies.name, employees: companies.employees, role: memberships.role })
    .from(memberships)
    .innerJoin(companies, eq(companies.id, memberships.companyId))
    .where(eq(memberships.userId, userId))
    .orderBy(companies.name)
  const out = []
  for (const co of list) {
    const latest = await db.query.campaigns.findFirst({
      where: eq(campaigns.companyId, co.id),
      orderBy: desc(campaigns.createdAt),
    })
    const data = latest ? await computeInsights(db, co.id, latest.id) : null
    const [{ open }] = (await db
      .select({ open: sql<number>`count(*)::int` })
      .from(actions)
      .where(and(eq(actions.companyId, co.id), ne(actions.status, "done")))) as [{ open: number }]
    out.push({
      ...co,
      campaign: latest ? { name: latest.name, status: latest.status, endsAt: latest.endsAt } : null,
      responses: data?.totals.responses ?? 0,
      rate: data?.totals.rate ?? 0,
      index: data && data.totals.responses ? data.totals.index : null,
      alerts: data?.totals.alerts ?? 0,
      openActions: open,
    })
  }
  return out
}
