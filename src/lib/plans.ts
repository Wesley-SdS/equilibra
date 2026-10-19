// Fonte única dos planos: preços (landing, tela de assinatura) e limites (aplicados no servidor).
// Valores do PRD 01, seção 9.

export type PlanId = "essencial" | "profissional" | "empresa"

export type Limits = {
  /** Total de pessoas somando os setores */
  employees: number
  /** Campanhas criadas nos últimos 12 meses */
  campaignsPerYear: number
  customQuestions: number
  /** Pessoas com acesso ao painel (dono + admins + leitores + convites pendentes) */
  seats: number
  channel: boolean
  evolution: boolean
  /** Interações com os copilotos (IA) por mês */
  agentRuns: number
}

export type Plan = {
  id: PlanId
  name: string
  audience: string
  monthly: number
  /** Preço mensal equivalente no plano anual (2 meses grátis) */
  yearlyMonthly: number
  featured?: boolean
  limits: Limits
  highlights: string[]
}

const UNLIMITED = Number.POSITIVE_INFINITY

export const PLANS: Plan[] = [
  {
    id: "essencial",
    name: "Essencial",
    audience: "até 50 funcionários",
    monthly: 249,
    yearlyMonthly: Math.round((249 * 10) / 12),
    limits: { employees: 50, campaignsPerYear: 2, customQuestions: 3, seats: 2, channel: false, evolution: true, agentRuns: 0 },
    highlights: ["2 campanhas por ano", "Mapa de risco por setor", "Plano de ação 5W2H", "Relatório PGR em PDF", "3 perguntas da empresa"],
  },
  {
    id: "profissional",
    name: "Profissional",
    audience: "até 200 funcionários",
    monthly: 590,
    yearlyMonthly: Math.round((590 * 10) / 12),
    featured: true,
    limits: { employees: 200, campaignsPerYear: UNLIMITED, customQuestions: 10, seats: 5, channel: true, evolution: true, agentRuns: 200 },
    highlights: ["Campanhas ilimitadas", "Canal de relato com triagem", "Evolução entre campanhas", "Copilotos de IA (200/mês)", "5 pessoas na equipe"],
  },
  {
    id: "empresa",
    name: "Empresa",
    audience: "200 a 500 funcionários",
    monthly: 1290,
    yearlyMonthly: Math.round((1290 * 10) / 12),
    limits: { employees: 500, campaignsPerYear: UNLIMITED, customQuestions: 10, seats: UNLIMITED, channel: true, evolution: true, agentRuns: 1000 },
    highlights: ["Tudo do Profissional", "Equipe ilimitada", "Copilotos de IA (1.000/mês)", "Gerente de sucesso", "Integrações de SST"],
  },
]

export const TRIAL_DAYS = 14
/** O teste grátis libera os recursos do Profissional. */
export const TRIAL_PLAN: PlanId = "profissional"

export function planById(id: string | null | undefined): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS.find((p) => p.id === TRIAL_PLAN)!
}

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })

export const formatLimit = (n: number) => (Number.isFinite(n) ? String(n) : "Ilimitado")
