import type { BillingEvent } from "./index"
import type { PlanId } from "@/lib/plans"

/**
 * Contrato que um provedor de pagamento precisa cumprir. Para plugar Stripe, Asaas ou
 * Pagar.me, implemente esta interface e registre em `getBillingProvider()`.
 */
export interface BillingProvider {
  id: string
  /** Cria a sessão de pagamento e devolve a URL para redirecionar a pessoa. */
  createCheckout(input: {
    companyId: string
    companyName: string
    email: string
    plan: PlanId
    interval: "monthly" | "yearly"
    successUrl: string
    cancelUrl: string
  }): Promise<{ url: string }>
  /** Portal do cliente (trocar cartão, ver faturas, cancelar). */
  createPortal(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>
  /** Valida a assinatura do webhook e converte para um evento normalizado (ou null se for irrelevante). */
  parseWebhook(request: Request): Promise<BillingEvent | null>
}

/**
 * Provedor ativo. Nenhum está configurado ainda (decisão pendente: Stripe ou Asaas);
 * enquanto isso o checkout informa que o pagamento online não está disponível.
 */
export function getBillingProvider(): BillingProvider | null {
  switch (process.env.BILLING_PROVIDER) {
    // case "stripe": return stripeProvider()
    // case "asaas": return asaasProvider()
    default:
      return null
  }
}
