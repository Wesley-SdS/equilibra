// Evolução entre campanhas NR-1: responde "o que melhorou, o que piorou, onde, e o que foi feito no
// meio". Tudo determinístico (sem IA): a frase de leitura é montada por regras a partir dos agregados.

import { and, eq } from "drizzle-orm"
import type { Db } from "./db"
import { actions, sectors } from "./db/schema"
import { computeHistory, computeInsights } from "./insights"
import { DIMENSIONS, type DimensionId } from "@/lib/methodology"

export type EvolutionCell = { sectorKey: string; sectorLabel: string; dimension: DimensionId; before: number; after: number; delta: number }

const STABLE = 2 // variação de até 2 pontos é tratada como estável

const fmtMonth = (d: string) => {
  const [y, m] = d.split("-")
  return `${["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(m) - 1]}/${y}`
}

function joinPt(list: string[]) {
  if (list.length <= 1) return list.join("")
  return `${list.slice(0, -1).join(", ")} e ${list.at(-1)}`
}

/**
 * Compara duas campanhas NR-1 (padrão: as duas mais recentes). Setores só entram na matriz quando
 * aparecem isolados (k-anonimato) nas duas campanhas; "Outros setores" nunca é comparado.
 */
export async function computeEvolution(db: Db, companyId: string, opts: { fromId?: string; toId?: string; sectorKey?: string } = {}) {
  const points = await computeHistory(db, companyId)
  if (points.length < 2) return { points, enough: false as const }
  const to = points.find((p) => p.id === opts.toId) ?? points.at(-1)!
  const fromCandidates = points.filter((p) => p.startsAt < to.startsAt)
  const from = fromCandidates.find((p) => p.id === opts.fromId) ?? fromCandidates.at(-1) ?? points.at(-2)!

  const [a, b] = await Promise.all([computeInsights(db, companyId, from.id), computeInsights(db, companyId, to.id)])
  const cells: EvolutionCell[] = []
  for (const row of b!.heatmap) {
    if (row.grouped) continue
    const prev = a!.heatmap.find((r) => r.key === row.key && !r.grouped)
    if (!prev) continue
    for (const d of DIMENSIONS) {
      const before = prev.scores[d.id]
      const after = row.scores[d.id]
      if (before === null || after === null || before === undefined || after === undefined) continue
      cells.push({ sectorKey: row.key, sectorLabel: row.label, dimension: d.id, before, after, delta: after - before })
    }
  }

  // Dimensões no geral (ou filtradas por setor).
  const scoped = opts.sectorKey ? cells.filter((c) => c.sectorKey === opts.sectorKey) : null
  const dims = DIMENSIONS.flatMap((d) => {
    const before = scoped ? scoped.find((c) => c.dimension === d.id)?.before : from.scores[d.id]
    const after = scoped ? scoped.find((c) => c.dimension === d.id)?.after : to.scores[d.id]
    if (before === undefined || after === undefined) return []
    return [{ id: d.id, name: d.name, short: d.short, before, after, delta: after - before }]
  })
  const improved = dims.filter((d) => d.delta < -STABLE)
  const worsened = dims.filter((d) => d.delta > STABLE)

  // Ações concluídas entre o início da campanha anterior e o início da atual.
  const sectorList = await db.select({ id: sectors.id, name: sectors.name }).from(sectors).where(eq(sectors.companyId, companyId))
  const sectorName = (id: string | null) => sectorList.find((s) => s.id === id)?.name ?? "Toda a empresa"
  const allActions = await db.select().from(actions).where(and(eq(actions.companyId, companyId)))
  const fromDay = from.startsAt
  const toDay = to.startsAt
  const done = allActions
    .filter((x) => x.status === "done" && x.completedAt)
    .map((x) => ({ id: x.id, what: x.what, dimension: x.dimension as DimensionId, sector: sectorName(x.sectorId), sectorId: x.sectorId, completedOn: x.completedAt!.toISOString().slice(0, 10) }))
    .sort((p, q) => p.completedOn.localeCompare(q.completedOn))
  const doneBetween = done.filter((x) => x.completedOn >= fromDay && x.completedOn <= toDay)
  const open = allActions.filter((x) => x.status !== "done")
  const late = open.filter((x) => x.due && x.due < new Date().toISOString().slice(0, 10)).length

  // "Onde agir agora": as 3 células que mais pioraram, com a situação do plano para aquele setor e dimensão.
  const hotspots = [...cells]
    .filter((c) => c.delta > STABLE)
    .sort((p, q) => q.delta - p.delta || q.after - p.after)
    .slice(0, 3)
    .map((c) => {
      const related = allActions.filter((x) => x.dimension === c.dimension && (x.sectorId === c.sectorKey || x.sectorId === null))
      const openRelated = related.filter((x) => x.status !== "done")
      return {
        ...c,
        dimensionName: DIMENSIONS.find((d) => d.id === c.dimension)!.name,
        responses: b!.heatmap.find((r) => r.key === c.sectorKey)?.responses ?? 0,
        openActions: openRelated.length,
        lateActions: openRelated.filter((x) => x.due && x.due < new Date().toISOString().slice(0, 10)).length,
      }
    })

  // Frase de leitura (regras, sem IA).
  const delta = to.index - from.index
  const trend = Math.abs(delta) <= STABLE ? `ficou estável (${from.index} → ${to.index})` : delta < 0 ? `caiu ${-delta} pontos (${from.index} → ${to.index})` : `subiu ${delta} pontos (${from.index} → ${to.index})`
  const bestDim = [...improved].sort((p, q) => p.delta - q.delta)[0]
  const worstDim = [...worsened].sort((p, q) => q.delta - p.delta)[0]
  const sectorsWhere = (dim: DimensionId, better: boolean) =>
    cells
      .filter((c) => c.dimension === dim && (better ? c.delta < -STABLE : c.delta > STABLE))
      .sort((p, q) => (better ? p.delta - q.delta : q.delta - p.delta))
      .slice(0, 2)
      .map((c) => c.sectorLabel)
  const parts = [`Entre ${fmtMonth(from.startsAt)} e ${fmtMonth(to.startsAt)} o risco geral ${trend}.`]
  if (bestDim) {
    const where = sectorsWhere(bestDim.id, true)
    parts.push(`${bestDim.name} foi o que mais melhorou (${-bestDim.delta} pontos a menos de risco)${where.length ? `, principalmente em ${joinPt(where)}` : ""}.`)
  }
  if (worstDim) {
    const where = sectorsWhere(worstDim.id, false)
    parts.push(`${worstDim.name} piorou ${worstDim.delta} pontos${where.length ? `, sobretudo em ${joinPt(where)}` : ""}.`)
  } else if (!bestDim) {
    parts.push("Nenhuma dimensão mudou mais de 2 pontos.")
  }
  const relatedDone = bestDim ? doneBetween.filter((x) => x.dimension === bestDim.id).length : 0
  parts.push(
    doneBetween.length
      ? `${doneBetween.length} ${doneBetween.length === 1 ? "ação foi concluída" : "ações foram concluídas"} no período${relatedDone ? `; ${relatedDone} ${relatedDone === 1 ? "delas é" : "delas são"} de ${bestDim!.name}` : ""}.`
      : "Nenhuma ação do plano foi concluída no período."
  )

  return {
    enough: true as const,
    points,
    from: { id: from.id, name: from.name, startsAt: from.startsAt, index: from.index, responses: from.responses },
    to: { id: to.id, name: to.name, startsAt: to.startsAt, index: to.index, responses: to.responses },
    lead: parts.join(" "),
    kpis: { index: to.index, delta, improved: improved.length, worsened: worsened.length, stable: dims.length - improved.length - worsened.length, dimensions: dims.length, done: allActions.filter((x) => x.status === "done").length, total: allActions.length, late },
    dimensions: dims,
    cells,
    sectors: [...new Map(cells.map((c) => [c.sectorKey, c.sectorLabel])).entries()].map(([key, label]) => ({ key, label })),
    hotspots,
    actionsDone: done,
  }
}
