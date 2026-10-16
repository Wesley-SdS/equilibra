import { eq } from "drizzle-orm"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { companies, users } from "../db/schema"
import { audit } from "../audit"
import { appUrl } from "../email"
import { applyBillingEvent, entitlements, usage } from "../billing"
import { getBillingProvider } from "../billing/provider"
import { j, ownerProcedure, privateProcedure } from "../jstack"
import { PLANS, planById } from "@/lib/plans"

const planEnum = z.enum(["essencial", "profissional", "empresa"])
const intervalEnum = z.enum(["monthly", "yearly"])

export const billingRouter = j.router({
  /** Plano, situação, uso atual e se há pagamento online configurado. */
  status: privateProcedure.query(async ({ c, ctx }) => {
    const company = await ctx.db.query.companies.findFirst({ where: eq(companies.id, ctx.session.companyId) })
    if (!company) throw new HTTPException(404, { message: "Empresa não encontrada" })
    const ent = entitlements(company)
    const used = await usage(ctx.db, company.id)
    // Infinity não sobrevive ao JSON: limites ilimitados viram null.
    const limits = Object.fromEntries(Object.entries(ent.limits).map(([k, v]) => [k, typeof v === "number" && !Number.isFinite(v) ? null : v]))
    return c.superjson({
      plan: { id: ent.plan.id, name: ent.plan.name },
      contractedPlan: company.plan,
      status: ent.status,
      interval: company.billingInterval,
      inTrial: ent.inTrial,
      trialDaysLeft: ent.trialDaysLeft,
      trialEndsAt: company.trialEndsAt,
      currentPeriodEnd: company.currentPeriodEnd,
      readOnly: ent.readOnly,
      limits,
      usage: used,
      onlinePayment: !!getBillingProvider(),
      canSimulate: process.env.NODE_ENV !== "production" || process.env.BILLING_SIMULATION === "1",
      hasPortal: !!company.providerCustomerId,
    })
  }),

  checkout: ownerProcedure.input(z.object({ plan: planEnum, interval: intervalEnum })).mutation(async ({ c, ctx, input }) => {
    const provider = getBillingProvider()
    if (!provider) {
      throw new HTTPException(503, { message: "O pagamento online ainda não está disponível. Fale com a gente para ativar seu plano." })
    }
    const company = await ctx.db.query.companies.findFirst({ where: eq(companies.id, ctx.session.companyId) })
    const user = await ctx.db.query.users.findFirst({ where: eq(users.id, ctx.session.userId) })
    const base = appUrl(c.req.url)
    const { url } = await provider.createCheckout({
      companyId: company!.id,
      companyName: company!.name,
      email: user!.email,
      plan: input.plan,
      interval: input.interval,
      successUrl: `${base}/app/assinatura?status=sucesso`,
      cancelUrl: `${base}/app/assinatura?status=cancelado`,
    })
    return c.superjson({ url })
  }),

  portal: ownerProcedure.mutation(async ({ c, ctx }) => {
    const provider = getBillingProvider()
    const company = await ctx.db.query.companies.findFirst({ where: eq(companies.id, ctx.session.companyId) })
    if (!provider || !company?.providerCustomerId) throw new HTTPException(400, { message: "Nenhuma assinatura online para gerenciar." })
    const { url } = await provider.createPortal({ customerId: company.providerCustomerId, returnUrl: `${appUrl(c.req.url)}/app/assinatura` })
    return c.superjson({ url })
  }),

  /** Ativa um plano sem pagamento — só em desenvolvimento (ou com BILLING_SIMULATION=1), para testar o fluxo. */
  simulate: ownerProcedure
    .input(z.object({ plan: planEnum, interval: intervalEnum, event: z.enum(["active", "past_due", "canceled", "trial_expired"]).default("active") }))
    .mutation(async ({ c, ctx, input }) => {
      if (process.env.NODE_ENV === "production" && process.env.BILLING_SIMULATION !== "1") {
        throw new HTTPException(403, { message: "Simulação desativada em produção." })
      }
      const companyId = ctx.session.companyId
      if (input.event === "trial_expired") {
        await ctx.db.update(companies).set({ subscriptionStatus: "trialing", trialEndsAt: new Date(Date.now() - 1000) }).where(eq(companies.id, companyId))
      } else if (input.event === "active") {
        const days = input.interval === "yearly" ? 365 : 30
        await applyBillingEvent(ctx.db, { type: "subscription.active", companyId, plan: input.plan, interval: input.interval, currentPeriodEnd: new Date(Date.now() + days * 86_400_000) }, "simulacao")
      } else {
        await applyBillingEvent(ctx.db, { type: input.event === "past_due" ? "subscription.past_due" : "subscription.canceled", companyId }, "simulacao")
      }
      await audit(ctx.db, ctx.session, { action: "update", entity: "assinatura", entityId: companyId, summary: `Assinatura simulada: ${input.event} (${planById(input.plan).name})` })
      return c.superjson({ ok: true })
    }),

  plans: privateProcedure.query(async ({ c }) => {
    return c.superjson(PLANS.map((p) => ({ ...p, limits: Object.fromEntries(Object.entries(p.limits).map(([k, v]) => [k, typeof v === "number" && !Number.isFinite(v) ? null : v])) })))
  }),
})
