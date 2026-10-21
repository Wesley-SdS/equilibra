import { and, eq, gte, isNull, ne, sql } from "drizzle-orm"
import { HTTPException } from "hono/http-exception"
import type { Db } from "../db"
import { agentRuns, campaigns, companies, customQuestions, invites, memberships, sectors } from "../db/schema"
import { TRIAL_DAYS, TRIAL_PLAN, formatLimit, planById, type Limits, type PlanId } from "@/lib/plans"

type Company = typeof companies.$inferSelect
const DAY = 86_400_000

/** Situação comercial da empresa e os limites que valem agora. */
export function entitlements(company: Company, now = new Date()) {
  const trialEnds = company.trialEndsAt
  const inTrial = company.subscriptionStatus === "trialing" && !!trialEnds && trialEnds > now
  const trialExpired = company.subscriptionStatus === "trialing" && (!trialEnds || trialEnds <= now)
  // Inadimplente mantém acesso por 7 dias após o fim do período (carência), depois fica só leitura.
  const graceEnds = company.currentPeriodEnd ? new Date(company.currentPeriodEnd.getTime() + 7 * DAY) : null
  const pastDueBlocked = company.subscriptionStatus === "past_due" && (!graceEnds || graceEnds <= now)
  const readOnly = trialExpired || pastDueBlocked || company.subscriptionStatus === "canceled"
  const plan = planById(inTrial ? TRIAL_PLAN : company.plan)
  return {
    plan,
    status: company.subscriptionStatus,
    inTrial,
    trialDaysLeft: inTrial ? Math.max(0, Math.ceil((trialEnds!.getTime() - now.getTime()) / DAY)) : 0,
    readOnly,
    limits: plan.limits,
  }
}

export type Entitlements = ReturnType<typeof entitlements>

/** Uso atual de cada recurso limitado. */
export async function usage(db: Db, companyId: string) {
  const yearAgo = new Date(Date.now() - 365 * DAY)
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const [[emp], [camp], [cq], [mem], [inv], [runs]] = (await Promise.all([
    db.select({ n: sql<number>`coalesce(sum(${sectors.headcount}), 0)::int` }).from(sectors).where(eq(sectors.companyId, companyId)),
    db.select({ n: sql<number>`count(*)::int` }).from(campaigns).where(and(eq(campaigns.companyId, companyId), eq(campaigns.imported, false), gte(campaigns.createdAt, yearAgo))),
    db.select({ n: sql<number>`count(*)::int` }).from(customQuestions).where(and(eq(customQuestions.companyId, companyId), eq(customQuestions.active, true))),
    db.select({ n: sql<number>`count(*)::int` }).from(memberships).where(eq(memberships.companyId, companyId)),
    db.select({ n: sql<number>`count(*)::int` }).from(invites).where(and(eq(invites.companyId, companyId), isNull(invites.acceptedAt))),
    db.select({ n: sql<number>`count(*)::int` }).from(agentRuns).where(and(eq(agentRuns.companyId, companyId), gte(agentRuns.createdAt, monthStart), ne(agentRuns.status, "error"), ne(agentRuns.agent, "listening"))),
  ])) as { n: number }[][]
  return { employees: emp!.n, campaignsPerYear: camp!.n, customQuestions: cq!.n, seats: mem!.n + inv!.n, agentRuns: runs!.n }
}

export type Usage = Awaited<ReturnType<typeof usage>>

const LABEL: Record<keyof Omit<Limits, "channel" | "evolution">, string> = {
  employees: "funcionários",
  campaignsPerYear: "campanhas por ano",
  customQuestions: "perguntas da empresa",
  seats: "pessoas na equipe",
  agentRuns: "interações com os copilotos neste mês",
}

/** Erro 402 padronizado: a UI mostra a mensagem com um link para a tela de assinatura. */
function paymentRequired(message: string): never {
  throw new HTTPException(402, { message })
}

async function loadCompany(db: Db, companyId: string) {
  const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) })
  if (!company) throw new HTTPException(404, { message: "Empresa não encontrada" })
  return company
}

/** Bloqueia alterações quando o teste acabou ou a assinatura está suspensa. */
export async function assertWritable(db: Db, companyId: string) {
  const ent = entitlements(await loadCompany(db, companyId))
  if (ent.readOnly) {
    paymentRequired(
      ent.status === "trialing"
        ? "Seu teste grátis terminou. Escolha um plano para continuar criando e editando."
        : "A assinatura está suspensa. Regularize o pagamento para continuar editando."
    )
  }
  return ent
}

/**
 * Garante que adicionar `extra` unidades do recurso cabe no plano.
 * Ex.: `assertLimit(db, id, "campaignsPerYear", 1)` antes de criar uma campanha.
 */
export async function assertLimit(db: Db, companyId: string, key: keyof typeof LABEL, extra = 1) {
  const ent = await assertWritable(db, companyId)
  const used = (await usage(db, companyId))[key]
  const max = ent.limits[key]
  if (used + extra > max) {
    paymentRequired(`O plano ${ent.plan.name} permite até ${formatLimit(max)} ${LABEL[key]} (uso atual: ${used}). Faça upgrade para continuar.`)
  }
}

export async function assertFeature(db: Db, companyId: string, feature: "channel" | "evolution") {
  const ent = entitlements(await loadCompany(db, companyId))
  if (!ent.limits[feature]) {
    const name = feature === "channel" ? "O canal de relato" : "A evolução entre campanhas"
    paymentRequired(`${name} não está disponível no plano ${ent.plan.name}.`)
  }
}

/** Valores iniciais para uma empresa nova: teste grátis do Profissional. */
export function trialDefaults(now = new Date()) {
  return {
    plan: TRIAL_PLAN,
    subscriptionStatus: "trialing" as const,
    trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * DAY),
  }
}

// ---------------------------------------------------------------- eventos do provedor

/** Evento normalizado, independente do provedor (Stripe, Asaas, Pagar.me…). */
export type BillingEvent =
  | { type: "subscription.active"; companyId: string; plan: PlanId; interval: "monthly" | "yearly"; currentPeriodEnd: Date; customerId?: string; subscriptionId?: string }
  | { type: "subscription.past_due"; companyId: string }
  | { type: "subscription.canceled"; companyId: string }

export async function applyBillingEvent(db: Db, event: BillingEvent, provider: string) {
  if (event.type === "subscription.active") {
    await db
      .update(companies)
      .set({
        plan: event.plan,
        billingInterval: event.interval,
        subscriptionStatus: "active",
        currentPeriodEnd: event.currentPeriodEnd,
        billingProvider: provider,
        providerCustomerId: event.customerId ?? null,
        providerSubscriptionId: event.subscriptionId ?? null,
      })
      .where(eq(companies.id, event.companyId))
  } else if (event.type === "subscription.past_due") {
    await db.update(companies).set({ subscriptionStatus: "past_due" }).where(eq(companies.id, event.companyId))
  } else {
    await db.update(companies).set({ subscriptionStatus: "canceled" }).where(eq(companies.id, event.companyId))
  }
}
