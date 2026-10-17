const DAY = 86_400_000
/** Avisa com esta antecedência (dias) do prazo de uma ação do plano. */
export const SOON_DAYS = 3

const todayIso = () => new Date().toISOString().slice(0, 10)

export function daysUntil(due: string, now = todayIso()) {
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${now}T00:00:00Z`)) / DAY)
}

export type DeadlineStage = "overdue" | "soon" | null

/** Estágio de uma ação pelo prazo; ações concluídas ou sem prazo válido não têm aviso. */
export function stageOf(a: { status: string; due: string }, now = todayIso()): DeadlineStage {
  if (a.status === "done" || !/^\d{4}-\d{2}-\d{2}$/.test(a.due)) return null
  const left = daysUntil(a.due, now)
  return left < 0 ? "overdue" : left <= SOON_DAYS ? "soon" : null
}
