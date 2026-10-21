// Contexto de risco do plano de ação: para cada ação, o score da dimensão (no setor da ação, ou na
// empresa) na campanha que a motivou e na campanha NR-1 seguinte. É o "72 → 58" do card.

import { desc, eq } from "drizzle-orm"
import type { Db } from "./db"
import { actions, employees } from "./db/schema"
import { computeHistory, computeInsights, type Insights } from "./insights"
import type { DimensionId } from "@/lib/methodology"

export async function listActionsWithContext(db: Db, companyId: string) {
  const [rows, points, people] = await Promise.all([
    db.select().from(actions).where(eq(actions.companyId, companyId)).orderBy(desc(actions.createdAt)),
    computeHistory(db, companyId),
    db.select({ id: employees.id, name: employees.name }).from(employees).where(eq(employees.companyId, companyId)),
  ])
  const insightsCache = new Map<string, Insights | null>()
  const insightsOf = async (campaignId: string) => {
    if (!insightsCache.has(campaignId)) insightsCache.set(campaignId, await computeInsights(db, companyId, campaignId))
    return insightsCache.get(campaignId)!
  }
  const scoreIn = async (campaignId: string, dimension: DimensionId, sectorId: string | null) => {
    const data = await insightsOf(campaignId)
    if (!data) return null
    const row = sectorId ? data.heatmap.find((h) => h.key === sectorId && !h.grouped) : null
    return row?.scores[dimension] ?? data.ranking.find((r) => r.id === dimension)?.score ?? null
  }

  const out = []
  for (const a of rows) {
    const dim = a.dimension as DimensionId
    // Data de referência: a criação ou a conclusão, o que vier antes. A campanha de base é a que
    // motivou a ação (se for anterior a essa data) ou a última campanha NR-1 antes dela.
    const created = a.createdAt.toISOString().slice(0, 10)
    const ref = a.completedAt && a.completedAt.toISOString().slice(0, 10) < created ? a.completedAt.toISOString().slice(0, 10) : created
    const linked = points.find((p) => p.id === a.campaignId && p.startsAt <= ref)
    const base = linked ?? [...points].reverse().find((p) => p.startsAt <= ref) ?? points.find((p) => p.id === a.campaignId) ?? null
    const after = base ? points.find((p) => p.startsAt > base.startsAt && (!a.completedAt || p.startsAt >= a.completedAt.toISOString().slice(0, 10))) ?? null : null
    out.push({
      ...a,
      riskBefore: base ? await scoreIn(base.id, dim, a.sectorId) : null,
      riskAfter: after ? await scoreIn(after.id, dim, a.sectorId) : null,
      baseCampaign: base?.name ?? null,
      afterCampaign: after?.name ?? null,
      people: a.employeeIds.map((id) => people.find((p) => p.id === id)?.name).filter(Boolean) as string[],
    })
  }
  return out
}
