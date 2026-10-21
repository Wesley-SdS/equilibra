"use client"

import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { Suspense, useEffect } from "react"
import { PageHeader } from "@/components/app/page-header"
import { Button, EmptyState, ButtonLink, Spinner, buttonClass } from "@/components/ui/primitives"
import { client } from "@/lib/client"
import { K_ANONYMITY, RISK_LEVELS, dimensionMeta, inventoryRating, riskLevel } from "@/lib/methodology"
import { formatCnpj, formatDate } from "@/lib/utils"

const STATUS = { todo: "A fazer", doing: "Em andamento", done: "Concluída" } as const

function ReportContent() {
  const autoPrint = useSearchParams().get("imprimir") === "1"
  const report = useQuery({ queryKey: ["report"], queryFn: async () => (await client.report.get.$get({})).json() })
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
        <EmptyState title="Sem dados para o relatório" text="Lance uma campanha e colete respostas para gerar o inventário." action={<ButtonLink href="/app/campanhas">Ir para campanhas</ButtonLink>} />
      </>
    )
  }
  const { insights, company, plan, sectors, history } = r
  const sectorName = (id: string | null) => sectors.find((s) => s.id === id)?.name ?? "Toda a empresa"
  const generatedAt = new Date().toLocaleDateString("pt-BR")

  return (
    <>
      <PageHeader
        title="Relatório PGR"
        description="Inventário de riscos psicossociais e plano de ação, prontos para anexar ao Programa de Gerenciamento de Riscos."
        actions={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              Imprimir
            </Button>
            <a href="/api/relatorio/pdf" className={buttonClass("primary")} download>
              Baixar PDF
            </a>
          </>
        }
      />
      <article className="print-sheet flex flex-col gap-10 rounded-3xl border border-line bg-surface p-6 text-[15px] leading-relaxed sm:p-10">
        <header className="flex flex-col gap-2 border-b border-line pb-8">
          <span className="font-mono text-xs uppercase tracking-wider text-brand-fg">Inventário de riscos psicossociais · NR-1</span>
          <h2 className="text-3xl font-semibold tracking-tight">{company.name}</h2>
          <p className="text-muted">
            CNPJ {formatCnpj(company.cnpj)} · {insights.campaign.name} · período {formatDate(insights.campaign.startsAt)} a{" "}
            {formatDate(insights.campaign.endsAt)} · emitido em {generatedAt}
          </p>
        </header>

        <Section n="1" title="Metodologia">
          <p className="text-muted">
            <strong className="text-fg">Metodologia: {insights.campaign.methodology?.name ?? "Equilibra NR-1"}.</strong> {insights.campaign.methodology?.justification}{" "}
            Avaliação por questionário anônimo autoaplicável (“{insights.questionnaire.name}”, versão {insights.questionnaire.version}) com {insights.questionnaire.scoredCount} itens pontuáveis em{" "}
            {insights.ranking.length} dimensões psicossociais ({insights.ranking.map((d) => d.name).join(", ")}), escala de frequência de 5 pontos. Cada dimensão recebe um
            score de 0 (sem risco) a 100 (risco máximo): baixo &lt; 25, moderado 25–49, alto 50–74, crítico ≥ 75. A classificação
            do inventário combina probabilidade (derivada do score, 1–5) e severidade (1–5). Para proteger o anonimato, grupos com
            menos de {K_ANONYMITY} respostas não são exibidos isoladamente.
          </p>
        </Section>

        <Section n="2" title="Participação">
          <p className="text-muted">
            {insights.totals.responses} respostas de {insights.totals.headcount} trabalhadores ({insights.totals.rate}%). Índice geral de
            risco: <strong className="text-fg">{insights.totals.index}/100 ({RISK_LEVELS[insights.totals.level].label})</strong>.
          </p>
        </Section>

        <Section n="3" title="Inventário de riscos">
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
                  const exposed = insights.heatmap
                    .filter((h) => (h.scores[d.id] ?? 0) >= 50)
                    .map((h) => h.label)
                    .join(", ")
                  return (
                    <tr key={d.id}>
                      <td className="py-2.5 pr-4">{d.name}</td>
                      <td className="py-2.5 pr-4 font-mono">{d.score}</td>
                      <td className="py-2.5 pr-4 font-mono">{inv.probability}</td>
                      <td className="py-2.5 pr-4 font-mono">{inv.severity}</td>
                      <td className="py-2.5 pr-4">{RISK_LEVELS[riskLevel(d.score)].label}</td>
                      <td className="py-2.5 text-muted">{exposed || "—"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>

        <Section n="4" title="Plano de ação" className="print-break">
          {plan.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-line text-subtle">
                  <tr>
                    <th className="py-2 pr-4 font-medium">O quê</th>
                    <th className="py-2 pr-4 font-medium">Dimensão</th>
                    <th className="py-2 pr-4 font-medium">Onde</th>
                    <th className="py-2 pr-4 font-medium">Quem</th>
                    <th className="py-2 pr-4 font-medium">Quando</th>
                    <th className="py-2 font-medium">Status</th>
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
                      <td className="py-2.5">{STATUS[a.status]}</td>
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
          <Section n="5" title="Evolução">
            <p className="mb-3 text-muted">Índice geral de risco por campanha, evidenciando o monitoramento contínuo exigido pela NR-1.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-line text-subtle">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Campanha</th>
                    <th className="py-2 pr-4 font-medium">Início</th>
                    <th className="py-2 pr-4 font-medium">Respostas</th>
                    <th className="py-2 font-medium">Índice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="py-2.5 pr-4">{h.name}</td>
                      <td className="py-2.5 pr-4">{formatDate(h.startsAt)}</td>
                      <td className="py-2.5 pr-4 font-mono">
                        {h.responses} ({h.rate}%)
                      </td>
                      <td className="py-2.5 font-mono">
                        {h.index} · {RISK_LEVELS[riskLevel(h.index)].label}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        <Section n={history.length > 1 ? "6" : "5"} title="Responsabilidade">
          <p className="text-muted">
            Este documento apoia a gestão dos riscos psicossociais no GRO/PGR (NR-1, Portaria MTE nº 1.419/2024). A validação e a
            assinatura do PGR cabem ao responsável técnico designado pela organização.
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

function Section({ n, title, children, className }: { n: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h3 className="mb-3 flex items-baseline gap-3 text-xl font-semibold">
        <span className="font-mono text-sm text-brand-fg">{n}</span>
        {title}
      </h3>
      {children}
    </section>
  )
}
