"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import { useCopilot } from "@/components/app/copilot"
import { PageHeader } from "@/components/app/page-header"
import { IndexTrend } from "@/components/app/trend"
import { Button, ButtonLink, Card, EmptyState, Field, Input, Select, Spinner, Textarea, buttonClass, cellStyle } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { client } from "@/lib/client"
import { stageOf } from "@/lib/deadline"
import { useCan } from "@/lib/hooks"
import { methodologyById } from "@/lib/methodologies"
import { DIMENSIONS, K_ANONYMITY, RISK_LEVELS, dimensionMeta, inventoryRating, riskLevel } from "@/lib/methodology"
import { cn, formatCnpj, formatDate } from "@/lib/utils"

const STATUS = { todo: "A fazer", doing: "Em andamento", done: "Concluída" } as const
const STATUS_CLS = { todo: "bg-tint/[0.06] text-muted", doing: "bg-risk-mod/50 text-risk-mod-fg", done: "bg-risk-low/60 text-risk-low-fg" } as const
const METHOD = { observacao: "Observação da atividade", conversa: "Conversa com trabalhadores", grupo: "Grupo de discussão", entrevista: "Entrevista" } as const
const LEVEL_TEXT = { baixo: "text-risk-low-fg", moderado: "text-risk-mod-fg", alto: "text-risk-high-fg", critico: "text-risk-crit-fg" } as const

function Section({ n, title, children, className }: { n: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <h3 className="text-lg font-semibold">
        <span className="mr-2 font-mono text-brand-fg">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  )
}

function SummaryPanel({ campaignId, approved, draft }: { campaignId: string; approved: { text: string; approvedByName: string | null; approvedAt: Date | string | null } | null; draft: { id: string; text: string; engine: string } | null }) {
  const can = useCan()
  const qc = useQueryClient()
  const toast = useToast()
  const copilot = useCopilot()
  const [text, setText] = useState(draft?.text ?? "")
  useEffect(() => setText(draft?.text ?? ""), [draft?.text])
  const refresh = () => qc.invalidateQueries({ queryKey: ["report"] })
  const generate = useMutation({
    mutationFn: async () => (await client.report.generateSummary.$post({ campaignId })).json(),
    onSuccess: (r) => {
      refresh()
      toast(r.engine === "copiloto" ? "Rascunho escrito pelo copiloto. Revise e aprove." : "Rascunho montado a partir dos dados. Revise e aprove.")
    },
    onError: (e) => toast(e.message, "error"),
  })
  const save = useMutation({
    mutationFn: async () => (await client.report.saveSummary.$post({ id: draft!.id, text })).json(),
    onSuccess: refresh,
    onError: (e) => toast(e.message, "error"),
  })
  const approve = useMutation({
    mutationFn: async () => {
      if (text !== draft!.text) await client.report.saveSummary.$post({ id: draft!.id, text })
      return (await client.report.approveSummary.$post({ id: draft!.id })).json()
    },
    onSuccess: () => {
      refresh()
      toast("Resumo aprovado: ele já aparece no relatório e no PDF")
    },
    onError: (e) => toast(e.message, "error"),
  })
  if (!can.edit && !approved) return null

  return (
    <Card className={cn("no-print mb-4 flex flex-col gap-3", draft ? "border-risk-mod/50" : approved ? "border-brand/30" : "")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Resumo executivo</h2>
        {draft ? (
          <span className="rounded-full bg-risk-mod/50 px-2.5 py-0.5 text-xs text-risk-mod-fg">Rascunho aguardando aprovação</span>
        ) : approved ? (
          <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs text-brand-fg">
            Aprovado{approved.approvedByName ? ` por ${approved.approvedByName}` : ""}
            {approved.approvedAt ? ` em ${new Date(approved.approvedAt).toLocaleDateString("pt-BR")}` : ""}
          </span>
        ) : (
          <span className="rounded-full bg-tint/[0.06] px-2.5 py-0.5 text-xs text-muted">Sem resumo</span>
        )}
      </div>
      {draft ? (
        <>
          <p className="text-sm text-muted">
            {draft.engine === "copiloto" ? "Escrito pelo copiloto a partir dos agregados." : draft.engine === "regras" ? "Montado por regras a partir dos dados (sem IA)." : "Editado manualmente."} Ele só entra no relatório depois de aprovado; o
            relatório registra quem aprovou e quando.
          </p>
          <Textarea aria-label="Texto do resumo executivo" className="min-h-32 text-[15px] leading-relaxed" value={text} maxLength={3000} onChange={(e) => setText(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button loading={approve.isPending} onClick={() => approve.mutate()}>
              Aprovar texto
            </Button>
            <Button variant="secondary" loading={save.isPending} disabled={text === draft.text} onClick={() => save.mutate()}>
              Salvar edição
            </Button>
            <Button variant="ghost" loading={generate.isPending} onClick={() => generate.mutate()}>
              Gerar de novo
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm text-muted">
            {approved
              ? "Quer atualizar? Gere um novo rascunho; o aprovado continua no relatório até você aprovar o novo."
              : `A página 1 do relatório traz um resumo em prosa para a direção e o auditor. ${copilot.data?.available ? "O copiloto escreve a partir dos dados" : "Ele é montado a partir dos dados"}; você revisa e aprova.`}
          </p>
          <Button loading={generate.isPending} onClick={() => generate.mutate()}>
            {approved ? "Gerar novo rascunho" : "Gerar resumo"}
          </Button>
        </div>
      )}
    </Card>
  )
}

function ObservationForm({ sectors }: { sectors: { id: string; name: string }[] }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [f, setF] = useState({ day: new Date().toISOString().slice(0, 10), method: "conversa" as keyof typeof METHOD, sectorId: "", participants: "", summary: "" })
  const add = useMutation({
    mutationFn: async () => (await client.report.addObservation.$post({ ...f, sectorId: f.sectorId || null, participants: Number(f.participants) || 0 })).json(),
    onSuccess: () => {
      setF((x) => ({ ...x, summary: "", participants: "" }))
      qc.invalidateQueries({ queryKey: ["report"] })
      toast("Registro adicionado")
    },
    onError: (e) => toast(e.message, "error"),
  })
  return (
    <details className="no-print rounded-xl border border-line p-4">
      <summary className="cursor-pointer text-sm font-medium">Registrar observação ou conversa</summary>
      <form
        className="mt-3 grid gap-3 md:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault()
          add.mutate()
        }}
      >
        <Field label="Data" htmlFor="oday">
          <Input id="oday" type="date" required value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} />
        </Field>
        <Field label="Método" htmlFor="omethod">
          <Select id="omethod" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as keyof typeof METHOD })}>
            {Object.entries(METHOD).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Setor" htmlFor="osector">
          <Select id="osector" value={f.sectorId} onChange={(e) => setF({ ...f, sectorId: e.target.value })}>
            <option value="">Toda a empresa</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Participantes" htmlFor="opart">
          <Input id="opart" type="number" min={0} value={f.participants} onChange={(e) => setF({ ...f, participants: e.target.value })} />
        </Field>
        <div className="md:col-span-4">
          <Field label="O que foi observado ou conversado (sem identificar pessoas)" htmlFor="osum">
            <Textarea id="osum" required minLength={20} maxLength={2000} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
          </Field>
        </div>
        <Button type="submit" className="self-start" loading={add.isPending}>
          Adicionar ao relatório
        </Button>
      </form>
    </details>
  )
}

function ReportContent() {
  const params = useSearchParams()
  const autoPrint = params.get("imprimir") === "1"
  const can = useCan()
  const qc = useQueryClient()
  const report = useQuery({ queryKey: ["report"], queryFn: async () => (await client.report.get.$get({})).json() })
  const removeObs = useMutation({
    mutationFn: async (id: string) => (await client.report.removeObservation.$post({ id })).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report"] }),
  })
  useEffect(() => {
    if (autoPrint && report.data?.insights) setTimeout(() => window.print(), 600)
  }, [autoPrint, report.data])

  if (report.isLoading) {
    return (
      <div className="grid h-80 place-items-center text-muted">
        <Spinner className="size-6" />
      </div>
    )
  }
  const r = report.data
  if (!r?.insights) {
    return (
      <>
        <PageHeader title="Relatório PGR" />
        <EmptyState title="Sem dados para o relatório" text="Lance uma campanha NR-1 e colete respostas para gerar o inventário." action={<ButtonLink href="/app/campanhas">Ir para campanhas</ButtonLink>} />
      </>
    )
  }
  const { insights, company, plan, sectors, history, summary, summaryDraft, observations, otherCampaigns } = r
  const sectorName = (id: string | null) => sectors.find((s) => s.id === id)?.name ?? "Toda a empresa"
  const generatedAt = new Date().toLocaleDateString("pt-BR")
  const t = insights.totals
  const prev = history.length > 1 ? history[history.length - 2] : null
  const delta = prev ? t.index - prev.index : null
  const today = new Date().toISOString().slice(0, 10)
  const topActions = [...plan]
    .filter((a) => a.status !== "done")
    .sort((a, b) => Number(stageOf(b) === "overdue") - Number(stageOf(a) === "overdue") || (dimensionMeta(b.dimension)?.severity ?? 0) - (dimensionMeta(a.dimension)?.severity ?? 0))
    .slice(0, 3)
  const participation = insights.participation.filter((p) => p.headcount > 0)
  let n = 0
  const next = () => String(++n)

  return (
    <>
      <PageHeader
        title="Relatório PGR"
        description="Inventário de riscos psicossociais, plano de ação e evolução, prontos para anexar ao PGR. A primeira página responde em 1 minuto o que a direção e o auditor precisam saber."
        actions={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              Imprimir
            </Button>
            <a href={`/api/relatorio/pdf?campanha=${insights.campaign.id}`} className={buttonClass("primary")} download>
              Baixar PDF
            </a>
          </>
        }
      />
      <SummaryPanel campaignId={insights.campaign.id} approved={summary} draft={summaryDraft} />

      <article className="print-sheet flex flex-col gap-10 rounded-3xl border border-line bg-surface p-6 text-[15px] leading-relaxed sm:p-10">
        <header className="flex flex-col gap-2 border-b border-line pb-8">
          <span className="font-mono text-xs uppercase tracking-wider text-brand-fg">Inventário de riscos psicossociais · NR-1 · Portaria MTE 1.419/2024</span>
          <h2 className="text-3xl font-semibold tracking-tight">{company.name}</h2>
          <p className="text-muted">
            CNPJ {formatCnpj(company.cnpj)} · {insights.campaign.name} · {formatDate(insights.campaign.startsAt)} a {formatDate(insights.campaign.endsAt)} · emitido em {generatedAt}
          </p>
        </header>

        <Section n={next()} title="Resumo executivo">
          <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-line p-5">
            <div>
              <div className={cn("text-5xl font-semibold leading-none tracking-tight", LEVEL_TEXT[t.level])}>{t.index}</div>
              <div className="mt-1 text-xs text-subtle">índice geral · 0 a 100</div>
            </div>
            <div className="h-12 w-px bg-line" />
            <div className="min-w-0 flex-1 text-sm">
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", cellStyle[t.level])}>Risco {RISK_LEVELS[t.level].label.toLowerCase()}</span>
              <p className="mt-2 text-muted">
                {delta !== null && prev ? (delta < -2 ? `Queda de ${-delta} pontos desde ${prev.name}. ` : delta > 2 ? `Alta de ${delta} pontos desde ${prev.name}. ` : `Estável desde ${prev.name}. `) : ""}
                {t.responses} de {t.headcount} pessoas responderam ({t.rate}%). {t.alerts ? `${t.alerts} dimensão(ões) em nível alto ou crítico.` : "Nenhuma dimensão em nível alto ou crítico."}
              </p>
            </div>
          </div>
          {summary ? (
            <p className="text-[15px] leading-relaxed">{summary.text}</p>
          ) : (
            <p className="no-print rounded-xl border border-dashed border-line p-4 text-sm text-subtle">O texto do resumo aparece aqui depois de aprovado.</p>
          )}
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-line p-4 text-sm">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Principais riscos</div>
              {insights.ranking.slice(0, 3).map((d, i) => (
                <div key={d.id} className="flex justify-between gap-2 py-0.5">
                  <span>
                    {i + 1}. {d.name}
                  </span>
                  <span className={cn("font-mono", LEVEL_TEXT[d.level])}>{d.score}</span>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-line p-4 text-sm">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Principais ações em aberto</div>
              {topActions.length ? (
                topActions.map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-2 py-0.5">
                    <span className="min-w-0">{a.what}</span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px]", a.due && a.due < today ? "bg-risk-crit/15 text-risk-crit-fg" : STATUS_CLS[a.status])}>{a.due && a.due < today ? "atrasada" : STATUS[a.status].toLowerCase()}</span>
                  </div>
                ))
              ) : (
                <span className="text-muted">Nenhuma ação em aberto.</span>
              )}
            </div>
            <div className="rounded-xl border border-line p-4 text-sm">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Participação por setor</div>
              {participation.slice(0, 5).map((p) => {
                const pct = Math.min(100, Math.round((p.responses / p.headcount) * 100))
                return (
                  <div key={p.id} className="flex items-center gap-2 py-0.5 text-xs">
                    <span className="w-24 truncate">{p.name}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-tint/[0.08]">
                      <span className="block h-full rounded-full bg-brand-fg" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-9 text-right font-mono">{pct}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        </Section>

        <Section n={next()} title="Metodologia e justificativa">
          <p className="text-muted">
            <strong className="text-fg">{insights.campaign.methodology?.name ?? "Equilibra NR-1"}.</strong> {insights.campaign.methodology?.justification ?? methodologyById("equilibra").justification}
          </p>
          <p className="text-muted">
            Questionário anônimo autoaplicável (“{insights.questionnaire.name}”, versão {insights.questionnaire.version}) com {insights.questionnaire.scoredCount} itens pontuáveis em {insights.ranking.length} dimensões, escala de frequência de 5
            pontos. Score de 0 (sem risco) a 100 (risco máximo): baixo &lt; 25, moderado 25–49, alto 50–74, crítico ≥ 75. A classificação do inventário combina probabilidade (derivada do score, 1–5) e severidade (1–5, definida na
            metodologia). Grupos com menos de {K_ANONYMITY} respostas não são exibidos isoladamente. Os resultados integram a Avaliação Ergonômica Preliminar (NR-17) e são complementados pelos registros de observação e diálogo da
            seção {observations.length ? "própria" : "de observação"}.
          </p>
        </Section>

        <Section n={next()} title="Participação">
          <div className="grid gap-1.5">
            {participation.map((p) => {
              const pct = Math.min(100, Math.round((p.responses / p.headcount) * 100))
              return (
                <div key={p.id} className="grid grid-cols-[140px_1fr_110px] items-center gap-3 text-sm">
                  <span className="truncate">{p.name}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-tint/[0.08]">
                    <span className="block h-full rounded-full bg-brand-fg" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="text-right font-mono text-xs text-muted">
                    {p.responses}/{p.headcount} · {pct}%
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-sm text-muted">
            Total: {t.responses} respostas de {t.headcount} trabalhadores ({t.rate}%).
          </p>
        </Section>

        <Section n={next()} title="Inventário de riscos" className="print-break">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-subtle">
                <tr>
                  <th className="py-2 pr-4 font-medium">Fator de risco</th>
                  <th className="py-2 pr-4 font-medium">Score</th>
                  <th className="py-2 pr-4 font-medium">Probab.</th>
                  <th className="py-2 pr-4 font-medium">Sever.</th>
                  <th className="py-2 pr-4 font-medium">Nível</th>
                  <th className="py-2 font-medium">Setores mais expostos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {insights.ranking.map((d) => {
                  const inv = inventoryRating(d.score, d.severity)
                  const exposed = insights.heatmap.filter((h) => (h.scores[d.id] ?? 0) >= 50).map((h) => h.label).join(", ")
                  return (
                    <tr key={d.id}>
                      <td className="py-2.5 pr-4">{d.name}</td>
                      <td className="py-2.5 pr-4 font-mono">{d.score}</td>
                      <td className="py-2.5 pr-4 font-mono">{inv.probability}</td>
                      <td className="py-2.5 pr-4 font-mono">{inv.severity}</td>
                      <td className="py-2.5 pr-4">
                        <span className={cn("rounded-full px-2 py-0.5 text-xs", cellStyle[riskLevel(d.score)])}>{RISK_LEVELS[riskLevel(d.score)].label}</span>
                      </td>
                      <td className="py-2.5 text-muted">{exposed || "—"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {insights.heatmap.length > 0 && (
            <div className="overflow-x-auto">
              <div className="grid min-w-[640px] gap-1" style={{ gridTemplateColumns: `140px repeat(${DIMENSIONS.length}, minmax(0,1fr))` }}>
                <span />
                {DIMENSIONS.map((d) => (
                  <span key={d.id} className="text-center text-[11px] text-subtle">
                    {d.short}
                  </span>
                ))}
                {insights.heatmap.map((row) => (
                  <div key={row.key} className="contents">
                    <span className="truncate self-center text-sm">
                      {row.label} <span className="text-xs text-subtle">({row.responses})</span>
                    </span>
                    {DIMENSIONS.map((d) => {
                      const v = row.scores[d.id]
                      return (
                        <span key={d.id} className={cn("grid h-8 place-items-center rounded-md font-mono text-xs", v === null ? "bg-tint/[0.03] text-subtle" : cellStyle[riskLevel(v)])}>
                          {v ?? "—"}
                        </span>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        <Section n={next()} title="Plano de ação">
          {plan.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-line text-subtle">
                  <tr>
                    <th className="py-2 pr-4 font-medium">O quê</th>
                    <th className="py-2 pr-4 font-medium">Dimensão</th>
                    <th className="py-2 pr-4 font-medium">Onde</th>
                    <th className="py-2 pr-4 font-medium">Quem</th>
                    <th className="py-2 pr-4 font-medium">Quando</th>
                    <th className="py-2 font-medium">Status e evidência</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {plan.map((a) => (
                    <tr key={a.id}>
                      <td className="py-2.5 pr-4">
                        {a.what}
                        {a.how && <span className="block text-xs text-subtle">Como: {a.how}</span>}
                      </td>
                      <td className="py-2.5 pr-4">{dimensionMeta(a.dimension)?.short}</td>
                      <td className="py-2.5 pr-4">{sectorName(a.sectorId)}</td>
                      <td className="py-2.5 pr-4">{a.who || "—"}</td>
                      <td className="py-2.5 pr-4">{a.due ? formatDate(a.due) : "—"}</td>
                      <td className="py-2.5">
                        <span className={cn("rounded-full px-2 py-0.5 text-xs", STATUS_CLS[a.status])}>{STATUS[a.status]}</span>
                        {a.status === "done" && a.completedAt && <span className="ml-1 text-xs text-subtle">em {new Date(a.completedAt).toLocaleDateString("pt-BR")}</span>}
                        {a.evidence && <span className="block text-xs text-subtle">Evidência: {a.evidence}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted">Nenhuma ação registrada ainda.</p>
          )}
        </Section>

        {history.length > 1 && (
          <Section n={next()} title="Evolução (monitoramento contínuo)">
            <IndexTrend points={history} />
            <p className="text-sm text-muted">
              {history.length} campanhas NR-1 comparadas, de {formatDate(history[0]!.startsAt)} a {formatDate(history[history.length - 1]!.startsAt)}. Índice: {history.map((h) => h.index).join(" → ")}.
            </p>
          </Section>
        )}

        <Section n={next()} title="Observação e diálogo">
          <p className="text-sm text-muted">Registros de observação da atividade e de conversa com os trabalhadores que complementam o questionário, como orienta o MTE.</p>
          {observations.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {observations.map((o) => (
                <li key={o.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div>
                    <div className="font-medium">
                      {formatDate(o.day)} · {METHOD[o.method]} · {sectorName(o.sectorId)}
                      {o.participants ? ` · ${o.participants} participantes` : ""}
                    </div>
                    <p className="text-muted">{o.summary}</p>
                  </div>
                  {can.edit && (
                    <button type="button" className="no-print text-xs text-subtle hover:text-fg" onClick={() => confirm("Remover este registro?") && removeObs.mutate(o.id)}>
                      remover
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-subtle">Nenhum registro ainda.</p>
          )}
          {can.edit && <ObservationForm sectors={sectors} />}
        </Section>

        {otherCampaigns.length > 0 && (
          <Section n={next()} title="Outras pesquisas aplicadas (anexo)">
            <p className="text-sm text-muted">Pesquisas de pulso e clima aplicadas pela empresa. Têm resultado próprio e não compõem o score NR-1.</p>
            <ul className="text-sm">
              {otherCampaigns.map((o) => (
                <li key={o.id} className="py-1">
                  {o.name} · {o.questionnaire} · {formatDate(o.startsAt)} · {o.responses} respostas · {o.anonymous ? "anônima" : "identificada"}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section n={next()} title="Responsabilidade">
          <p className="text-muted">
            Este documento apoia a gestão dos riscos psicossociais no GRO/PGR (NR-1, Portaria MTE nº 1.419/2024). A validação e a assinatura do PGR cabem ao responsável técnico designado pela organização.
            {summary?.approvedByName && ` Resumo executivo aprovado por ${summary.approvedByName}${summary.approvedAt ? ` em ${new Date(summary.approvedAt).toLocaleDateString("pt-BR")}` : ""}.`}
          </p>
          <div className="mt-10 grid gap-10 sm:grid-cols-2">
            {["Responsável técnico", "Representante da empresa"].map((l) => (
              <div key={l} className="border-t border-line-strong pt-2 text-sm text-subtle">
                {l}
              </div>
            ))}
          </div>
        </Section>
      </article>
    </>
  )
}

export default function ReportPage() {
  return (
    <Suspense>
      <ReportContent />
    </Suspense>
  )
}
