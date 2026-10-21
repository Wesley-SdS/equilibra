// Instrumentos de mercado importáveis. O Equilibra não distribui o texto dos itens: a empresa ou a
// consultoria importa o arquivo oficial (gratuito) e o Equilibra reconhece e pontua pela chave oficial.
//
// HSE Management Standards Indicator Tool (Health and Safety Executive, Reino Unido): 35 itens em 7
//   escalas. Chave de itens por escala conforme Edwards, Webster, Van Laar & Easton (2008), "Psychometric
//   analysis of the UK HSE Management Standards work-related stress Indicator Tool", Work & Stress 22(2).
//   Demandas e Relacionamentos são redigidas no sentido do risco; as demais, no sentido da proteção.
//
// COPSOQ III (Copenhagen Psychosocial Questionnaire): reconhecido pelos códigos de escala da rede
//   COPSOQ (ex.: QD1, WP2, IN3). Uso conforme as diretrizes da COPSOQ International Network
//   (CC BY-NC-ND 4.0): sem modificações, sem cobrança pelo questionário em si.

import type { DimensionId } from "./methodology"

export type InstrumentId = "hse" | "copsoq3"

export const INSTRUMENTS: Record<InstrumentId, { name: string; source: string; attribution: string }> = {
  hse: {
    name: "HSE Management Standards Indicator Tool",
    source: "Health and Safety Executive (Reino Unido) · 35 itens em 7 escalas",
    attribution: "Contém informação do setor público licenciada sob a Open Government Licence v3.0 (HSE Management Standards Indicator Tool, Health and Safety Executive).",
  },
  copsoq3: {
    name: "COPSOQ III",
    source: "Copenhagen Psychosocial Questionnaire, 3ª versão · COPSOQ International Network",
    attribution: "COPSOQ III, COPSOQ International Network, licença CC BY-NC-ND 4.0, aplicado sem modificações conforme as diretrizes da rede; o questionário não é cobrado.",
  },
}

/** Chave do HSE: número do item (1–35) → dimensão do Equilibra e sentido. */
const HSE_SCALES: { items: number[]; dimension: DimensionId; risk: boolean; scale: string }[] = [
  { items: [3, 6, 9, 12, 16, 18, 20, 22], dimension: "demandas", risk: true, scale: "Demands" },
  { items: [2, 10, 15, 19, 25, 30], dimension: "controle", risk: false, scale: "Control" },
  { items: [8, 23, 29, 33, 35], dimension: "lideranca", risk: false, scale: "Manager support" },
  { items: [7, 24, 27, 31], dimension: "colegas", risk: false, scale: "Peer support" },
  { items: [5, 14, 21, 34], dimension: "relacoes", risk: true, scale: "Relationships" },
  { items: [1, 4, 11, 13, 17], dimension: "papel", risk: false, scale: "Role" },
  { items: [26, 28, 32], dimension: "reconhecimento", risk: false, scale: "Change" },
]

export function hseKey(itemNumber: number) {
  const s = HSE_SCALES.find((x) => x.items.includes(itemNumber))
  return s ? { dimension: s.dimension, risk: s.risk, scale: s.scale } : null
}

/**
 * Escalas do COPSOQ III pelo código (prefixo de duas letras do item) → dimensão do Equilibra.
 * Indicadores de saúde e de resultado (saúde geral, burnout, estresse, satisfação) ficam fora do score:
 * a NR-1 avalia as condições de trabalho, não a saúde das pessoas.
 */
const COPSOQ_SCALES: Record<string, { dimension: DimensionId | null; risk: boolean; scale: string }> = {
  QD: { dimension: "demandas", risk: true, scale: "Exigências quantitativas" },
  WP: { dimension: "demandas", risk: true, scale: "Ritmo de trabalho" },
  CD: { dimension: "demandas", risk: true, scale: "Exigências cognitivas" },
  ED: { dimension: "demandas", risk: true, scale: "Exigências emocionais" },
  EM: { dimension: "demandas", risk: true, scale: "Exigências emocionais" },
  HE: { dimension: "demandas", risk: true, scale: "Esconder emoções" },
  WF: { dimension: "demandas", risk: true, scale: "Conflito trabalho-família" },
  IN: { dimension: "controle", risk: false, scale: "Influência no trabalho" },
  PD: { dimension: "controle", risk: false, scale: "Possibilidades de desenvolvimento" },
  CT: { dimension: "controle", risk: false, scale: "Controle sobre o tempo de trabalho" },
  QL: { dimension: "lideranca", risk: false, scale: "Qualidade da liderança" },
  SS: { dimension: "lideranca", risk: false, scale: "Apoio social do superior" },
  TM: { dimension: "lideranca", risk: false, scale: "Confiança na gestão" },
  JU: { dimension: "lideranca", risk: false, scale: "Justiça e respeito" },
  SC: { dimension: "colegas", risk: false, scale: "Apoio social dos colegas" },
  SW: { dimension: "colegas", risk: false, scale: "Comunidade social no trabalho" },
  TE: { dimension: "colegas", risk: false, scale: "Confiança entre colegas" },
  SH: { dimension: "relacoes", risk: true, scale: "Assédio sexual" },
  TV: { dimension: "relacoes", risk: true, scale: "Ameaças de violência" },
  PV: { dimension: "relacoes", risk: true, scale: "Violência física" },
  BU: { dimension: "relacoes", risk: true, scale: "Bullying" },
  UT: { dimension: "relacoes", risk: true, scale: "Provocações desagradáveis" },
  CL: { dimension: "papel", risk: false, scale: "Clareza de papel" },
  CO: { dimension: "papel", risk: true, scale: "Conflito de papel" },
  IT: { dimension: "papel", risk: true, scale: "Tarefas ilegítimas" },
  PR: { dimension: "reconhecimento", risk: false, scale: "Previsibilidade" },
  RE: { dimension: "reconhecimento", risk: false, scale: "Recompensas e reconhecimento" },
  JI: { dimension: "reconhecimento", risk: true, scale: "Insegurança no emprego" },
  IW: { dimension: "reconhecimento", risk: true, scale: "Insegurança nas condições de trabalho" },
  MW: { dimension: null, risk: false, scale: "Significado do trabalho" },
  CW: { dimension: null, risk: false, scale: "Compromisso com o local de trabalho" },
  JS: { dimension: null, risk: false, scale: "Satisfação no trabalho" },
  GH: { dimension: null, risk: false, scale: "Saúde geral (indicador de saúde)" },
  BO: { dimension: null, risk: true, scale: "Burnout (indicador de saúde)" },
  ST: { dimension: null, risk: true, scale: "Estresse (indicador de saúde)" },
  SL: { dimension: null, risk: true, scale: "Problemas de sono (indicador de saúde)" },
  DS: { dimension: null, risk: true, scale: "Sintomas depressivos (indicador de saúde)" },
  SE: { dimension: null, risk: false, scale: "Autoeficácia" },
}

/** Código COPSOQ no início do cabeçalho: "QD1", "QD1 -", "WP 2." etc. */
export function copsoqKey(header: string) {
  const code = header.trim().match(/^([A-Z]{2})\s?\d{1,2}[a-z]?\b/)?.[1]
  return code && COPSOQ_SCALES[code] ? { code, ...COPSOQ_SCALES[code]! } : null
}
