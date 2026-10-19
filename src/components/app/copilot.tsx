"use client"

import { useQuery } from "@tanstack/react-query"
import { client } from "@/lib/client"
import { cn } from "@/lib/utils"

/** Disponibilidade e cota dos copilotos (some da tela quando não há credencial ou o plano não inclui). */
export function useCopilot() {
  return useQuery({ queryKey: ["agents-usage"], queryFn: async () => (await client.agents.usage.$get()).json(), staleTime: 60_000 })
}

export function CopilotIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M5.6 18.4l2.2-2.2M16.2 7.8l2.2-2.2" />
    </svg>
  )
}

/** Moldura visual comum dos copilotos: título, aviso de responsabilidade e cota. */
export function CopilotShell({ title, children, className, footer }: { title: string; children: React.ReactNode; className?: string; footer?: React.ReactNode }) {
  const usage = useCopilot()
  return (
    <section className={cn("flex flex-col gap-3 rounded-2xl border border-brand/25 bg-gradient-to-b from-brand/[0.07] to-brand/[0.02] p-4", className)}>
      <header className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-brand-fg">
          <CopilotIcon /> {title}
        </span>
        {usage.data && Number.isFinite(usage.data.limit) && (
          <span className="font-mono text-[11px] text-subtle">
            {usage.data.used}/{usage.data.limit} no mês
          </span>
        )}
      </header>
      {children}
      <footer className="text-[11px] leading-snug text-subtle">{footer ?? "Sugestões de IA: confira antes de usar. Cada interação fica registrada na auditoria."}</footer>
    </section>
  )
}

export function CopilotMessage({ children, from = "ai" }: { children: React.ReactNode; from?: "ai" | "me" }) {
  return (
    <div className={cn("rounded-xl px-3 py-2.5 text-sm leading-relaxed", from === "me" ? "self-end bg-tint/[0.07]" : "border border-line bg-surface/80")}>{children}</div>
  )
}
