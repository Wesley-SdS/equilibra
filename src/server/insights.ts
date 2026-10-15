import { and, eq, inArray } from "drizzle-orm"
import type { Db } from "./db"
import { answers, campaigns, responses, sectors } from "./db/schema"
import { DIMENSIONS, K_ANONYMITY, riskLevel, scoreDimensions, type DimensionId } from "@/lib/methodology"

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
