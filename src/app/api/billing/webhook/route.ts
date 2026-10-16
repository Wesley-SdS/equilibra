import { getDb } from "@/server/db"
import { applyBillingEvent } from "@/server/billing"
import { getBillingProvider } from "@/server/billing/provider"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Webhook do provedor de pagamento: o provedor valida a assinatura e normaliza o evento. */
export async function POST(req: Request) {
  const provider = getBillingProvider()
  if (!provider) return new Response("Nenhum provedor de pagamento configurado", { status: 501 })
  let event
  try {
    event = await provider.parseWebhook(req)
  } catch (err) {
    console.error("[billing] webhook inválido", err)
    return new Response("Assinatura do webhook inválida", { status: 400 })
  }
  if (event) await applyBillingEvent(await getDb(), event, provider.id)
  return Response.json({ received: true })
}
