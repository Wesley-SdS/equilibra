"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { client } from "@/lib/client"
import { cn } from "@/lib/utils"

/** Faixa no topo do painel: dias de teste restantes, teste encerrado ou pagamento pendente. */
export function BillingBanner() {
  const pathname = usePathname()
  const status = useQuery({ queryKey: ["billing"], queryFn: async () => (await client.billing.status.$get()).json(), staleTime: 60_000 })
  const s = status.data
  if (!s || pathname.startsWith("/app/assinatura")) return null

  let text: string | null = null
  let tone: "info" | "warn" | "danger" = "info"
  if (s.readOnly) {
    text = s.status === "trialing" ? "Seu teste grátis terminou: o painel está em modo leitura." : "Assinatura suspensa: o painel está em modo leitura."
    tone = "danger"
  } else if (s.status === "past_due") {
    text = "Não conseguimos processar o último pagamento. Regularize para não perder o acesso."
    tone = "warn"
  } else if (s.inTrial) {
    text = `Teste grátis: ${s.trialDaysLeft} dia(s) restante(s) com todos os recursos do Profissional.`
    tone = s.trialDaysLeft <= 3 ? "warn" : "info"
  }
  if (!text) return null

  return (
    <div
      className={cn(
        "no-print flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b px-4 py-2 text-center text-sm",
        tone === "danger" && "border-risk-crit/30 bg-risk-crit/10 text-risk-crit-fg",
        tone === "warn" && "border-risk-high/30 bg-risk-high/10 text-risk-high-fg",
        tone === "info" && "border-line bg-brand/[0.06] text-fg"
      )}
    >
      <span>{text}</span>
      <Link href="/app/assinatura" className="font-semibold underline-offset-4 hover:underline">
        {s.readOnly ? "Escolher um plano" : "Ver planos"} →
      </Link>
    </div>
  )
}
