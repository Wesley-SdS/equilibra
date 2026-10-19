// Questionários como entidade: a empresa pode ter vários (o NR-1 padrão, importados, criados),
// cada um com versões. A campanha aponta para UMA versão, então editar um questionário nunca
// altera campanhas já lançadas. O cálculo de risco continua em methodology.ts: só os itens
// com dimensão entram no score.

import { DIMENSIONS, QUESTIONS, type DimensionId, type Question } from "./methodology"

export const QUESTIONNAIRE_KINDS = [
  { id: "nr1", label: "NR-1", description: "Alimenta o inventário de riscos, a evolução e o relatório PGR." },
  { id: "clima", label: "Clima", description: "Pesquisa de clima organizacional, com resultado próprio." },
  { id: "pulso", label: "Pulso", description: "Pesquisa curta e frequente para acompanhar uma equipe ou uma ação." },
  { id: "livre", label: "Livre", description: "Qualquer outro levantamento." },
] as const
export type QuestionnaireKind = (typeof QUESTIONNAIRE_KINDS)[number]["id"]

export type QuestionnaireStatus = "draft" | "active" | "archived"
export type QuestionnaireOrigin = "system" | "manual" | "imported" | "copilot"

/** Item de uma versão. Na fase 1 todos usam a escala Nunca → Sempre; `dimension` nula = fora do score. */
export type QuestionnaireItem = {
  id: string
  text: string
  type: "likert5"
  dimension: DimensionId | null
  /** true = descreve um fator de risco (mais frequente = pior); false = fator de proteção. */
  risk: boolean
}

export const MAX_ITEMS = 40
export const MIN_ITEMS = 1

/** Identificadores fixos do questionário de sistema, criados pela migration 0008. */
export const NR1_STANDARD_ID = "nr1-padrao"
export const NR1_STANDARD_VERSION_ID = "nr1-padrao-v1"
export const NR1_STANDARD_NAME = "Equilibra NR-1 padrão"

export const NR1_STANDARD_ITEMS: QuestionnaireItem[] = QUESTIONS.map((q) => ({ id: q.id, text: q.text, type: "likert5", dimension: q.dimension, risk: q.risk }))

/** Itens que entram no score, no formato que o motor de cálculo espera. */
export function scoredQuestions(items: QuestionnaireItem[]): Question[] {
  return items.flatMap((i) => (i.type === "likert5" && i.dimension ? [{ id: i.id, dimension: i.dimension, text: i.text, risk: i.risk }] : []))
}

/** Dimensões medidas por um conjunto de itens, na ordem da metodologia. */
export function measuredDimensions(items: QuestionnaireItem[]) {
  const present = new Set(items.map((i) => i.dimension))
  return DIMENSIONS.filter((d) => present.has(d.id))
}

export function kindLabel(kind: string) {
  return QUESTIONNAIRE_KINDS.find((k) => k.id === kind)?.label ?? kind
}

/** Tempo estimado de resposta (cerca de 4,5 itens por minuto, mínimo de 2). */
export function estimatedMinutes(itemCount: number) {
  return Math.max(2, Math.round(itemCount / 4.5))
}

export function newItemId() {
  return `i_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`
}
