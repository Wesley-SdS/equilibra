import { cn } from "@/lib/utils"

type Decision = { engine: "jev" | "regras" | "copiloto"; model?: string; confidence?: number } | null | undefined

/** Selo que mostra qual motor tomou uma decisão automática e com que confiança. */
export function JevBadge({ decision, label, className }: { decision: Decision; label?: string; className?: string }) {
  if (!decision) return null
  const isJev = decision.engine === "jev"
  const pct = decision.confidence !== undefined ? Math.round(decision.confidence * (decision.confidence <= 1 ? 100 : 1)) : null
  return (
    <span
      title={isJev ? `Decidido pelo Jev (TypeSafe)${decision.model ? ` · ${decision.model}` : ""}` : "Decidido pelas regras locais (Jev não configurado)"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        isJev ? "bg-brand/15 text-brand-fg" : "bg-tint/[0.06] text-muted",
        className
      )}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {isJev ? <path d="M13 2 4 14h7l-1 8 9-12h-7z" /> : <path d="M4 6h16M4 12h10M4 18h6" />}
      </svg>
      {label ?? (isJev ? "Jev" : "Regras")}
      {pct !== null && isJev && <span className="font-mono opacity-80">{pct}%</span>}
    </span>
  )
}
