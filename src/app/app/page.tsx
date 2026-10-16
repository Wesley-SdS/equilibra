"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { motion } from "motion/react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Heatmap, Legend, RiskBars, Ring } from "@/components/app/charts"
import { PageHeader } from "@/components/app/page-header"
import { Button, ButtonLink, Card, EmptyState, RiskBadge, Select, Spinner } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { OnboardingChecklist } from "@/components/app/onboarding"
import { client } from "@/lib/client"
import { useCan } from "@/lib/hooks"
import { K_ANONYMITY, RISK_LEVELS } from "@/lib/methodology"
import { formatDate } from "@/lib/utils"

export default function OverviewPage() {
  const router = useRouter()
  const toast = useToast()
  const qc = useQueryClient()
  const can = useCan()
  const [campaignId, setCampaignId] = useState<string | undefined>()

  const campaigns = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => (await client.campaigns.list.$get()).json(),
  })
  const insights = useQuery({
    queryKey: ["insights", campaignId],
    queryFn: async () => (await client.insights.overview.$get({ campaignId })).json(),
    // Campanha ativa: atualiza a cada 10 s para acompanhar as respostas chegando.
    refetchInterval: (q) => (q.state.data?.campaign.status === "active" ? 10_000 : false),
  })
  const suggest = useMutation({
    mutationFn: async (id: string) => (await client.actions.suggest.$post({ campaignId: id })).json(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["actions"] })
      toast(r.created ? `${r.created} ações sugeridas adicionadas ao plano` : "O plano já cobre as dimensões em alerta")
      router.push("/app/plano")
    },
  })

  if (insights.isLoading || campaigns.isLoading) {
    return (
      <div className="grid h-80 place-items-center text-muted">
        <Spinner className="size-6" />
      </div>
    )
  }

  const data = insights.data
  if (!data) {
    return (
      <>
        <PageHeader title="Visão geral" description="Os indicadores aparecem aqui assim que a primeira campanha receber respostas." />
        <OnboardingChecklist responses={0} hasCampaign={false} />
        <EmptyState
          title="Nenhuma campanha ainda"
          text="Cadastre os setores da empresa e lance a primeira avaliação psicossocial."
          action={<ButtonLink href="/app/campanhas">Criar campanha</ButtonLink>}
        />
      </>
    )
  }

  const { totals } = data
  const link = typeof window !== "undefined" ? `${window.location.origin}/r/${data.campaign.token}` : ""

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-2">
            {data.campaign.status === "active" && (
              <span className="flex items-center gap-1.5 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand-fg">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-75" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-brand" />
                </span>
                Ao vivo
              </span>
            )}
            {formatDate(data.campaign.startsAt)} – {formatDate(data.campaign.endsAt)}
          </span>
        }
        title={data.campaign.name}
        actions={
          <>
            {(campaigns.data?.length ?? 0) > 1 && (
              <Select
                aria-label="Selecionar campanha"
                className="h-11 w-56"
                value={data.campaign.id}
                onChange={(e) => setCampaignId(e.target.value)}
              >
                {campaigns.data!.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(link)
                toast("Link anônimo copiado")
              }}
            >
              Copiar link
            </Button>
            <ButtonLink href={`/app/campanhas/${data.campaign.id}/kit`} variant="secondary">
              Kit de divulgação
            </ButtonLink>
            <ButtonLink href="/app/relatorio">Gerar relatório</ButtonLink>
          </>
        }
      />

      <OnboardingChecklist responses={totals.responses} hasCampaign />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi i={0} label="Taxa de resposta">
          <div className="flex items-center gap-4">
            <Ring value={totals.rate} size={76} />
            <p className="text-sm text-muted">
              {totals.responses} de {totals.headcount} pessoas
            </p>
          </div>
        </Kpi>
        <Kpi i={1} label="Índice geral de risco">
          <p className="text-4xl font-semibold tracking-tight">{totals.index}</p>
          <RiskBadge score={totals.index} className="self-start" />
        </Kpi>
        <Kpi i={2} label="Dimensões em alerta">
          <p className="text-4xl font-semibold tracking-tight">{totals.alerts}</p>
          <p className={totals.critical ? "text-sm text-risk-crit-fg" : "text-sm text-muted"}>
            {totals.critical ? `${totals.critical} crítica(s)` : "Nenhuma crítica"}
          </p>
        </Kpi>
        <Kpi i={3} label="Maior risco">
          <p className="text-xl font-semibold tracking-tight">{data.ranking[0]?.name ?? "—"}</p>
          <p className="text-sm text-muted">
            {data.ranking[0]?.score ?? 0}/100 · {RISK_LEVELS[data.ranking[0]?.level ?? "baixo"].label}
          </p>
        </Kpi>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr] [&>*]:min-w-0">
        <Card>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Mapa de calor · setor × dimensão</h2>
            <Legend />
          </div>
          {data.heatmap.length ? (
            <Heatmap rows={data.heatmap} />
          ) : (
            <p className="py-10 text-center text-sm text-muted">
              Aguardando ao menos {K_ANONYMITY} respostas por setor para exibir os resultados.
            </p>
          )}
          <p className="mt-4 flex items-start gap-2 text-[13px] text-subtle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            Setores com menos de {K_ANONYMITY} respostas são agrupados em “Outros setores” para proteger o anonimato.
            {totals.hiddenResponses > 0 && ` ${totals.hiddenResponses} resposta(s) entram só no índice geral.`}
          </p>
        </Card>
        <Card>
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Ranking de riscos</h2>
          </div>
          <RiskBars items={data.ranking} linkTo={(id) => `/app/dimensao/${id}`} />
          {totals.alerts > 0 && can.edit && (
            <div className="mt-6 rounded-2xl border border-brand/25 bg-brand/[0.06] p-4">
              <p className="text-sm text-fg">
                {totals.alerts} dimensão(ões) com risco alto ou crítico precisam de ação registrada no PGR.
              </p>
              <Button className="mt-3 w-full" loading={suggest.isPending} onClick={() => suggest.mutate(data.campaign.id)}>
                Gerar plano de ação sugerido
              </Button>
            </div>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-4 text-lg font-semibold">Participação por setor</h2>
        <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {data.participation.map((p, i) => {
            const pct = p.headcount ? Math.min(100, Math.round((p.responses / p.headcount) * 100)) : 0
            return (
              <li key={p.id} className="flex flex-col gap-2">
                <div className="flex justify-between text-sm">
                  <span>{p.name}</span>
                  <span className="font-mono text-muted">
                    {p.responses}/{p.headcount} · {pct}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-tint/[0.06]">
                  <motion.div
                    className="h-full rounded-full bg-brand/80"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, delay: i * 0.05 }}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </Card>
    </>
  )
}

function Kpi({ label, children, i }: { label: string; children: React.ReactNode; i: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.06, duration: 0.5 }}
      className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5"
    >
      <span className="text-sm text-subtle">{label}</span>
      {children}
    </motion.div>
  )
}
