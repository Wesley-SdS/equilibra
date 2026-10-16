"use client"

import { useQuery } from "@tanstack/react-query"
import { motion } from "motion/react"
import Link from "next/link"
import { client } from "@/lib/client"
import { K_ANONYMITY } from "@/lib/methodology"
import { cn } from "@/lib/utils"

/** Checklist do caminho até o relatório PGR; some quando tudo estiver feito. */
export function OnboardingChecklist({ responses, hasCampaign }: { responses: number; hasCampaign: boolean }) {
  const sectors = useQuery({ queryKey: ["sectors"], queryFn: async () => (await client.sectors.list.$get()).json() })
  const actions = useQuery({ queryKey: ["actions"], queryFn: async () => (await client.actions.list.$get()).json() })
  const team = useQuery({ queryKey: ["team"], queryFn: async () => (await client.team.list.$get()).json() })
  if (!sectors.data || !actions.data || !team.data) return null

  const steps = [
    { done: sectors.data.length > 0, label: "Cadastrar setores", href: "/app/setores" },
    { done: hasCampaign, label: "Lançar a primeira campanha", href: "/app/campanhas?nova=1" },
    { done: responses >= K_ANONYMITY, label: `Receber ${K_ANONYMITY}+ respostas`, href: "/app/campanhas" },
    { done: actions.data.length > 0, label: "Montar o plano de ação", href: "/app/plano" },
    { done: team.data.members.length + team.data.pending.length > 1, label: "Convidar alguém da equipe", href: "/app/configuracoes?aba=equipe" },
  ]
  const done = steps.filter((s) => s.done).length
  if (done === steps.length) return null

  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      aria-label="Primeiros passos"
      className="mb-6 rounded-2xl border border-brand/20 bg-[radial-gradient(120%_160%_at_0%_0%,rgba(198,245,111,0.10),transparent_55%)] p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Primeiros passos até o relatório PGR</h2>
          <p className="text-sm text-muted">
            {done} de {steps.length} concluídos
          </p>
        </div>
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-tint/[0.08]">
          <motion.div className="h-full rounded-full bg-brand" initial={{ width: 0 }} animate={{ width: `${(done / steps.length) * 100}%` }} transition={{ duration: 0.8 }} />
        </div>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.label}>
            <Link
              href={s.href}
              className={cn(
                "flex h-full items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors",
                s.done ? "border-transparent bg-tint/[0.03] text-subtle line-through" : "border-line-strong hover:border-brand/50 hover:text-fg"
              )}
            >
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold", s.done ? "bg-brand text-brand-ink" : "bg-tint/[0.06] text-muted")}>
                {s.done ? "✓" : i + 1}
              </span>
              {s.label}
            </Link>
          </li>
        ))}
      </ol>
    </motion.section>
  )
}
