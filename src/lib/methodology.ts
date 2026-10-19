// Metodologia de avaliação psicossocial do Equilibra.
// 7 dimensões × 4 itens, escala Likert de frequência (1 = Nunca … 5 = Sempre).
// `risk: true` → o item descreve um fator de risco (mais frequente = pior).
// `risk: false` → o item descreve um fator de proteção (mais frequente = melhor).

export const K_ANONYMITY = 5

export const SCALE = ["Nunca", "Raramente", "Às vezes", "Frequentemente", "Sempre"] as const

export const DIMENSIONS = [
  { id: "demandas", name: "Demandas do trabalho", short: "Demandas", severity: 4 },
  { id: "controle", name: "Controle e autonomia", short: "Controle", severity: 3 },
  { id: "lideranca", name: "Apoio da liderança", short: "Liderança", severity: 3 },
  { id: "colegas", name: "Apoio dos colegas", short: "Colegas", severity: 2 },
  { id: "relacoes", name: "Relacionamentos e assédio", short: "Assédio", severity: 5 },
  { id: "papel", name: "Clareza de papel", short: "Papel", severity: 2 },
  { id: "reconhecimento", name: "Reconhecimento e mudanças", short: "Reconhecimento", severity: 3 },
] as const

export type DimensionId = (typeof DIMENSIONS)[number]["id"]

export type Question = { id: string; dimension: DimensionId; text: string; risk: boolean }

export const QUESTIONS: Question[] = [
  { id: "d1", dimension: "demandas", risk: true, text: "Preciso trabalhar muito rápido para dar conta das tarefas." },
  { id: "d2", dimension: "demandas", risk: true, text: "Tenho prazos ou metas que não consigo cumprir na jornada normal." },
  { id: "d3", dimension: "demandas", risk: true, text: "Levo trabalho para fora do horário ou faço horas extras para não atrasar." },
  { id: "d4", dimension: "demandas", risk: false, text: "Consigo fazer pausas durante o dia quando preciso." },

  { id: "c1", dimension: "controle", risk: false, text: "Posso decidir como organizar o meu próprio trabalho." },
  { id: "c2", dimension: "controle", risk: false, text: "Tenho voz nas decisões que afetam a minha rotina." },
  { id: "c3", dimension: "controle", risk: false, text: "Consigo definir o ritmo em que trabalho." },
  { id: "c4", dimension: "controle", risk: false, text: "Uso as minhas habilidades e conhecimentos no dia a dia." },

  { id: "l1", dimension: "lideranca", risk: false, text: "Minha liderança me ajuda quando o trabalho fica difícil." },
  { id: "l2", dimension: "lideranca", risk: false, text: "Recebo retorno claro e respeitoso sobre o meu trabalho." },
  { id: "l3", dimension: "lideranca", risk: false, text: "Posso falar com a minha liderança sobre algo que me preocupa." },
  { id: "l4", dimension: "lideranca", risk: true, text: "Sou cobrado(a) de forma agressiva ou humilhante." },

  { id: "p1", dimension: "colegas", risk: false, text: "Meus colegas me ajudam quando preciso." },
  { id: "p2", dimension: "colegas", risk: false, text: "Existe espírito de cooperação na minha equipe." },
  { id: "p3", dimension: "colegas", risk: false, text: "Me sinto parte da equipe." },
  { id: "p4", dimension: "colegas", risk: true, text: "Há disputas ou competição prejudicial entre colegas." },

  { id: "r1", dimension: "relacoes", risk: true, text: "Presencio ou sofro gritos, ofensas ou ameaças no trabalho." },
  { id: "r2", dimension: "relacoes", risk: true, text: "Sou isolado(a), ignorado(a) ou excluído(a) de propósito." },
  { id: "r3", dimension: "relacoes", risk: true, text: "Recebo comentários ou investidas de cunho sexual indesejados." },
  { id: "r4", dimension: "relacoes", risk: true, text: "Sinto medo de represália se eu relatar um problema." },

  { id: "a1", dimension: "papel", risk: false, text: "Sei exatamente o que se espera de mim no trabalho." },
  { id: "a2", dimension: "papel", risk: false, text: "Minhas responsabilidades estão bem definidas." },
  { id: "a3", dimension: "papel", risk: true, text: "Recebo pedidos contraditórios de pessoas diferentes." },
  { id: "a4", dimension: "papel", risk: false, text: "Entendo como o meu trabalho contribui para a empresa." },

  { id: "e1", dimension: "reconhecimento", risk: false, text: "Meu esforço é reconhecido." },
  { id: "e2", dimension: "reconhecimento", risk: false, text: "Sou informado(a) com antecedência sobre mudanças que me afetam." },
  { id: "e3", dimension: "reconhecimento", risk: false, text: "Considero a minha remuneração justa pelo trabalho que faço." },
  { id: "e4", dimension: "reconhecimento", risk: true, text: "Me sinto inseguro(a) sobre o meu futuro na empresa." },
]

export type RiskLevel = "baixo" | "moderado" | "alto" | "critico"

export const RISK_LEVELS: Record<RiskLevel, { label: string; min: number }> = {
  baixo: { label: "Baixo", min: 0 },
  moderado: { label: "Moderado", min: 25 },
  alto: { label: "Alto", min: 50 },
  critico: { label: "Crítico", min: 75 },
}

export function riskLevel(score: number): RiskLevel {
  if (score >= 75) return "critico"
  if (score >= 50) return "alto"
  if (score >= 25) return "moderado"
  return "baixo"
}

/** Converte a resposta (1..5) em risco (0..4). */
export function itemRisk(q: Question, value: number): number {
  return q.risk ? value - 1 : 5 - value
}

const QUESTION_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]))

/**
 * Score de 0 (sem risco) a 100 (risco máximo) por dimensão.
 * `questions` = itens pontuáveis da versão do questionário aplicada (padrão: os 28 da metodologia).
 */
export function scoreDimensions(
  answers: { questionId: string; value: number }[],
  questions: Question[] = QUESTIONS
): Record<DimensionId, number | null> {
  const byId = questions === QUESTIONS ? QUESTION_BY_ID : new Map(questions.map((q) => [q.id, q]))
  const acc = new Map<DimensionId, { sum: number; n: number }>()
  for (const a of answers) {
    const q = byId.get(a.questionId)
    if (!q) continue
    const cur = acc.get(q.dimension) ?? { sum: 0, n: 0 }
    cur.sum += itemRisk(q, a.value)
    cur.n += 1
    acc.set(q.dimension, cur)
  }
  const out = {} as Record<DimensionId, number | null>
  for (const d of DIMENSIONS) {
    const v = acc.get(d.id)
    out[d.id] = v && v.n > 0 ? Math.round((v.sum / v.n) * 25) : null
  }
  return out
}

/** Probabilidade (1–5) × severidade (1–5) para o inventário de riscos. */
export function inventoryRating(score: number, severity: number) {
  const probability = Math.min(5, Math.max(1, Math.ceil(score / 20)))
  return { probability, severity, rating: probability * severity }
}

export const ACTION_LIBRARY: Record<DimensionId, { what: string; how: string }[]> = {
  demandas: [
    { what: "Revisar a distribuição de metas e prazos com a liderança do setor", how: "Workshop de 2h com levantamento de tarefas, tempo real gasto e redistribuição." },
    { what: "Instituir pausas programadas nos horários de pico", how: "Escala de pausas de 10 min a cada 2h, registrada no ponto." },
    { what: "Monitorar horas extras e banco de horas por setor", how: "Relatório mensal ao RH com alerta acima de 10h extras/mês por pessoa." },
  ],
  controle: [
    { what: "Envolver a equipe no planejamento da rotina semanal", how: "Reunião semanal de 15 min para a equipe priorizar tarefas." },
    { what: "Mapear tarefas em que a pessoa pode decidir o método", how: "Matriz de autonomia por função, revisada com a liderança." },
  ],
  lideranca: [
    { what: "Capacitar lideranças em feedback e comunicação não violenta", how: "Trilha de 4 encontros de 1h30 com consultoria ou conteúdo interno." },
    { what: "Implantar conversas individuais (1:1) mensais", how: "Roteiro padrão de 20 min por liderado, registrado de forma simples." },
    { what: "Definir política contra cobrança abusiva", how: "Código de conduta assinado pelas lideranças e divulgado à equipe." },
  ],
  colegas: [
    { what: "Promover rituais de integração da equipe", how: "Encontro mensal e reconhecimento entre pares." },
    { what: "Revisar metas individuais que geram competição prejudicial", how: "Migrar parte da meta para indicadores coletivos." },
  ],
  relacoes: [
    { what: "Divulgar o canal de relato anônimo e o fluxo de apuração", how: "Cartazes, QR code e comunicado da direção garantindo a não retaliação." },
    { what: "Treinar todas as pessoas em prevenção de assédio moral e sexual", how: "Treinamento obrigatório anual com registro de presença (Lei 14.457/2022)." },
    { what: "Criar comitê de apuração com prazos definidos", how: "Comitê de 3 pessoas, prazo de 30 dias e sigilo garantido." },
  ],
  papel: [
    { what: "Atualizar as descrições de cargo e responsabilidades", how: "Documento por função validado com a equipe." },
    { what: "Definir um único ponto de priorização por equipe", how: "Liderança direta como responsável por priorizar as demandas." },
  ],
  reconhecimento: [
    { what: "Comunicar mudanças com antecedência mínima", how: "Comunicado com pelo menos 15 dias e espaço para dúvidas." },
    { what: "Criar programa simples de reconhecimento", how: "Destaques mensais e devolutiva pública das melhorias." },
    { what: "Revisar a política de cargos e salários", how: "Comparação com o mercado e trilha de progressão transparente." },
  ],
}

export function dimensionMeta(id: string) {
  return DIMENSIONS.find((d) => d.id === id)
}
