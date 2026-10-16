"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { PageHeader } from "@/components/app/page-header"
import { DimensionDelta, IndexTrend } from "@/components/app/trend"
import { ButtonLink, Card, EmptyState, RiskBadge, Spinner } from "@/components/ui/primitives"
import { client } from "@/lib/client"
import { DIMENSIONS } from "@/lib/methodology"
import { formatDate } from "@/lib/utils"

export default function EvolutionPage() {
  const history = useQuery({ queryKey: ["history"], queryFn: async () => (await client.insights.history.$get()).json() })

  if (history.isLoading) {
    return (
      <div className="grid h-80 place-items-center text-muted">
        <Spinner className="size-6" />
      </div>
    )
  }
  const points = history.data ?? []
  if (points.length < 2) {
    return (
      <>
        <PageHeader title="Evolução" description="Compare campanhas para mostrar à fiscalização que as ações estão funcionando." />
        <EmptyState
          title={points.length ? "Falta uma segunda campanha" : "Nenhuma campanha com respostas"}
          text="A evolução aparece a partir da segunda campanha com pelo menos 5 respostas. Recomendamos reavaliar a cada 6 meses."
          action={<ButtonLink href="/app/campanhas?nova=1">Planejar nova campanha</ButtonLink>}
        />
      </>
    )
  }

  const first = points[0]!
  const last = points[points.length - 1]!
  const prev = points[points.length - 2]!
  const delta = last.index - prev.index
  const rows = DIMENSIONS.map((d) => ({ id: d.id, name: d.name, before: prev.scores[d.id] ?? 0, after: last.scores[d.id] ?? 0 })).sort(
    (a, b) => a.after - a.before - (b.after - b.before)
  )
  const improved = rows.filter((r) => r.after < r.before).length

  return (
    <>
      <PageHeader title="Evolução" description={`${points.length} campanhas comparadas, de ${formatDate(first.startsAt)} a ${formatDate(last.startsAt)}.`} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="flex flex-col gap-2">
          <span className="text-sm text-subtle">Índice atual</span>
          <span className="text-4xl font-semibold tracking-tight">{last.index}</span>
          <RiskBadge score={last.index} className="self-start" />
        </Card>
        <Card className="flex flex-col gap-2">
          <span className="text-sm text-subtle">Variação vs. campanha anterior</span>
          <span className={delta <= 0 ? "text-4xl font-semibold tracking-tight text-risk-low-fg" : "text-4xl font-semibold tracking-tight text-risk-crit-fg"}>
            {delta > 0 ? `+${delta}` : delta}
          </span>
          <span className="text-sm text-muted">{delta < 0 ? "Risco caiu" : delta > 0 ? "Risco subiu" : "Estável"} em pontos do índice</span>
        </Card>
        <Card className="flex flex-col gap-2">
          <span className="text-sm text-subtle">Dimensões que melhoraram</span>
          <span className="text-4xl font-semibold tracking-tight">
            {improved}
            <span className="text-xl text-subtle">/{rows.length}</span>
          </span>
          <span className="text-sm text-muted">desde {prev.name}</span>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-2 text-lg font-semibold">Índice geral de risco</h2>
        <p className="mb-4 text-sm text-muted">0 = sem risco · 100 = risco máximo. Passe o mouse sobre cada campanha.</p>
        <IndexTrend points={points} />
      </Card>

      <Card className="mt-4">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Antes e depois por dimensão</h2>
            <p className="text-sm text-muted">
              {prev.name} → {last.name}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full border-2 border-subtle" /> Anterior
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-fg" /> Atual
            </span>
          </div>
        </div>
        <DimensionDelta rows={rows} />
      </Card>

      <Card className="mt-4 overflow-x-auto">
        <h2 className="mb-4 text-lg font-semibold">Tabela de dados</h2>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line text-subtle">
            <tr>
              <th className="py-2 pr-4 font-medium">Dimensão</th>
              {points.map((p) => (
                <th key={p.id} className="py-2 pr-4 font-medium">
                  {formatDate(p.startsAt).slice(3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {DIMENSIONS.map((d) => (
              <tr key={d.id}>
                <td className="py-2.5 pr-4">
                  <Link href={`/app/dimensao/${d.id}`} className="hover:text-brand-fg">
                    {d.name}
                  </Link>
                </td>
                {points.map((p) => (
                  <td key={p.id} className="py-2.5 pr-4 font-mono">
                    {p.scores[d.id]}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="font-medium">
              <td className="py-2.5 pr-4">Índice geral</td>
              {points.map((p) => (
                <td key={p.id} className="py-2.5 pr-4 font-mono">
                  {p.index}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </Card>
    </>
  )
}
