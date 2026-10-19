"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { motion } from "motion/react"
import { useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import { PageHeader } from "@/components/app/page-header"
import { Button, Card, Spinner } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { client } from "@/lib/client"
import { useCan } from "@/lib/hooks"
import { PLANS, brl, formatLimit, type PlanId } from "@/lib/plans"
import { cn, formatDate } from "@/lib/utils"

const STATUS_LABEL = { trialing: "Teste grátis", active: "Ativa", past_due: "Pagamento pendente", canceled: "Cancelada" } as const

const USAGE_ROWS = [
  { key: "employees", label: "Funcionários nos setores" },
  { key: "campaignsPerYear", label: "Campanhas nos últimos 12 meses" },
  { key: "customQuestions", label: "Perguntas da empresa ativas" },
  { key: "seats", label: "Pessoas na equipe (com convites)" },
  { key: "agentRuns", label: "Interações com os copilotos (mês)" },
] as const

function BillingContent() {
  const can = useCan()
  const qc = useQueryClient()
  const toast = useToast()
  const params = useSearchParams()
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly")
  const status = useQuery({ queryKey: ["billing"], queryFn: async () => (await client.billing.status.$get()).json() })

  useEffect(() => {
    if (params.get("status") === "sucesso") toast("Pagamento confirmado. Obrigado!")
    if (params.get("status") === "cancelado") toast("Pagamento cancelado. Nada foi cobrado.", "error")
  }, [params, toast])

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["billing"] })
    qc.invalidateQueries({ queryKey: ["me"] })
  }
  const checkout = useMutation({
    mutationFn: async (plan: PlanId) => (await client.billing.checkout.$post({ plan, interval })).json(),
    onSuccess: (r) => (window.location.href = r.url),
    onError: (e) => toast(e.message, "error"),
  })
  const portal = useMutation({
    mutationFn: async () => (await client.billing.portal.$post()).json(),
    onSuccess: (r) => (window.location.href = r.url),
    onError: (e) => toast(e.message, "error"),
  })
  const simulate = useMutation({
    mutationFn: async (v: { plan: PlanId; event: "active" | "past_due" | "canceled" | "trial_expired" }) =>
      (await client.billing.simulate.$post({ ...v, interval })).json(),
    onSuccess: () => {
      refresh()
      toast("Assinatura simulada atualizada")
    },
  })

  if (status.isLoading || !status.data) {
    return (
      <div className="grid h-80 place-items-center text-muted">
        <Spinner className="size-6" />
      </div>
    )
  }
  const s = status.data
  const activePlanId = s.status === "active" || s.status === "past_due" ? s.contractedPlan : null

  return (
    <>
      <PageHeader title="Assinatura" description="Seu plano, o uso atual e as opções para crescer." />

      {s.readOnly && (
        <div className="mb-4 rounded-2xl border border-risk-crit/40 bg-risk-crit/10 p-4 text-sm text-risk-crit-fg">
          {s.status === "trialing"
            ? "Seu teste grátis terminou. Os dados continuam visíveis, mas para criar e editar é preciso escolher um plano."
            : "A assinatura está suspensa. Os dados continuam visíveis; regularize para voltar a editar."}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr] [&>*]:min-w-0">
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-subtle">Plano atual</span>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                s.status === "active" ? "bg-brand/15 text-brand-fg" : s.status === "trialing" ? "bg-tint/[0.08] text-fg" : "bg-risk-crit/15 text-risk-crit-fg"
              )}
            >
              {STATUS_LABEL[s.status]}
            </span>
          </div>
          <p className="text-3xl font-semibold tracking-tight">{s.plan.name}</p>
          <p className="text-sm text-muted">
            {s.inTrial
              ? `Teste grátis com recursos do Profissional · ${s.trialDaysLeft} dia(s) restante(s), até ${formatDate(new Date(s.trialEndsAt!).toISOString())}`
              : s.currentPeriodEnd
                ? `${s.interval === "yearly" ? "Anual" : "Mensal"} · renova em ${formatDate(new Date(s.currentPeriodEnd).toISOString())}`
                : "Sem período ativo"}
          </p>
          {s.hasPortal && can.manage && (
            <Button variant="secondary" loading={portal.isPending} onClick={() => portal.mutate()} className="self-start">
              Gerenciar pagamento e faturas
            </Button>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold">Uso do plano</h2>
          <ul className="flex flex-col gap-4">
            {USAGE_ROWS.map((row, i) => {
              const used = s.usage[row.key]
              const max = s.limits[row.key] as number | null
              const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0
              return (
                <li key={row.key} className="flex flex-col gap-2">
                  <div className="flex justify-between text-sm">
                    <span>{row.label}</span>
                    <span className="font-mono text-muted">
                      {used} / {max === null ? "ilimitado" : max}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-tint/[0.06]">
                    <motion.div
                      className={cn("h-full rounded-full", pct >= 100 ? "bg-risk-crit" : pct >= 80 ? "bg-risk-high" : "bg-brand")}
                      initial={{ width: 0 }}
                      animate={{ width: max === null ? "6%" : `${pct}%` }}
                      transition={{ duration: 0.7, delay: i * 0.05 }}
                    />
                  </div>
                </li>
              )
            })}
            <li className="flex justify-between text-sm">
              <span>Canal de relato</span>
              <span className={s.limits.channel ? "text-brand-fg" : "text-subtle"}>{s.limits.channel ? "Incluído" : "Não incluído"}</span>
            </li>
          </ul>
        </Card>
      </div>

      <div className="mb-4 mt-10 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">Planos</h2>
        <div className="flex gap-1 rounded-xl border border-line p-1 text-sm" role="radiogroup" aria-label="Periodicidade">
          {(["monthly", "yearly"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={interval === v}
              onClick={() => setInterval(v)}
              className={cn("relative rounded-lg px-3 py-1.5", interval === v ? "text-fg" : "text-muted")}
            >
              {interval === v && <motion.span layoutId="interval-pill" className="absolute inset-0 rounded-lg bg-tint/[0.08]" />}
              <span className="relative">{v === "monthly" ? "Mensal" : "Anual · 2 meses grátis"}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((p, i) => {
          const current = activePlanId === p.id
          const price = interval === "yearly" ? p.yearlyMonthly : p.monthly
          return (
            <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
              <div className={cn("relative flex h-full flex-col gap-5 rounded-3xl border p-6", p.featured ? "border-brand/40 bg-brand/[0.05]" : "border-line bg-surface")}>
                {p.featured && <span className="absolute -top-3 left-6 rounded-full bg-brand px-3 py-1 text-xs font-medium text-brand-ink">Mais escolhido</span>}
                <div>
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <p className="text-sm text-subtle">{p.audience}</p>
                </div>
                <p className="text-4xl font-semibold tracking-tight">
                  {brl(price)}
                  <span className="text-base font-normal text-subtle">/mês</span>
                </p>
                {interval === "yearly" && <p className="-mt-3 text-xs text-subtle">{brl(price * 12)} cobrados por ano</p>}
                <ul className="flex flex-1 flex-col gap-2 text-sm text-muted">
                  {p.highlights.map((h) => (
                    <li key={h} className="flex gap-2">
                      <span className="text-brand-fg">✓</span> {h}
                    </li>
                  ))}
                  <li className="flex gap-2 text-subtle">
                    <span>·</span> Até {formatLimit(p.limits.employees)} funcionários
                  </li>
                </ul>
                {current ? (
                  <span className="rounded-xl border border-line py-2.5 text-center text-sm text-muted">Plano atual</span>
                ) : can.manage ? (
                  <Button variant={p.featured ? "primary" : "secondary"} loading={checkout.isPending && checkout.variables === p.id} onClick={() => checkout.mutate(p.id)}>
                    {activePlanId ? "Mudar para este plano" : "Assinar"}
                  </Button>
                ) : (
                  <span className="text-center text-xs text-subtle">Apenas o dono da conta pode assinar.</span>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>

      {!s.onlinePayment && (
        <p className="mt-4 text-sm text-subtle">
          O pagamento online será ativado em breve. Enquanto isso, a ativação do plano é feita pela nossa equipe.
        </p>
      )}

      {s.canSimulate && can.manage && (
        <Card className="mt-8 border-dashed">
          <h2 className="text-sm font-semibold">Simulação (somente desenvolvimento)</h2>
          <p className="mt-1 text-xs text-subtle">Testa o fluxo sem provedor de pagamento. Não aparece em produção.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PLANS.map((p) => (
              <Button key={p.id} size="sm" variant="secondary" onClick={() => simulate.mutate({ plan: p.id, event: "active" })}>
                Ativar {p.name}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => simulate.mutate({ plan: "profissional", event: "past_due" })}>
              Pagamento pendente
            </Button>
            <Button size="sm" variant="ghost" onClick={() => simulate.mutate({ plan: "profissional", event: "trial_expired" })}>
              Expirar teste
            </Button>
          </div>
        </Card>
      )}
    </>
  )
}

export default function BillingPage() {
  return (
    <Suspense>
      <BillingContent />
    </Suspense>
  )
}
