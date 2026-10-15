"use client"

import { useQuery } from "@tanstack/react-query"
import { motion } from "motion/react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { use } from "react"
import { PageHeader } from "@/components/app/page-header"
import { LikertBar, LikertLegend } from "@/components/app/trend"
import { ButtonLink, Card, RiskBadge, Spinner, barStyle } from "@/components/ui/primitives"
import { client } from "@/lib/client"
import { ACTION_LIBRARY, DIMENSIONS, K_ANONYMITY, riskLevel, type DimensionId } from "@/lib/methodology"
import { cn } from "@/lib/utils"

export default function DimensionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const dim = DIMENSIONS.find((d) => d.id === id)
  const detail = useQuery({
    queryKey: ["dimension", id],
    queryFn: async () => (await client.insights.dimension.$get({ dimension: id as DimensionId })).json(),
    enabled: !!dim,
  })
  if (!dim) notFound()

  if (detail.isLoading) {
    return (
      <div className="grid h-80 place-items-center text-muted">
        <Spinner className="size-6" />
      </div>
    )
  }
  const d = detail.data
  const idx = DIMENSIONS.findIndex((x) => x.id === dim.id)
  const prev = DIMENSIONS[(idx - 1 + DIMENSIONS.length) % DIMENSIONS.length]!
  const next = DIMENSIONS[(idx + 1) % DIMENSIONS.length]!

  return (
    <>
      <nav aria-label="Navegação entre dimensões" className="mb-4 flex items-center justify-between text-sm text-muted">
        <Link href="/app" className="hover:text-fg">
          ← Visão geral
        </Link>
        <span className="flex gap-4">
          <Link href={`/app/dimensao/${prev.id}`} className="hover:text-fg">
            ‹ {prev.short}
          </Link>
          <Link href={`/app/dimensao/${next.id}`} className="hover:text-fg">
            {next.short} ›
          </Link>
        </span>
      </nav>
      <PageHeader
        eyebrow={d?.campaign.name}
        title={dim.name}
        actions={d?.enough ? <ButtonLink href={`/app/plano?nova=1&dimensao=${dim.id}`}>Criar ação para esta dimensão</ButtonLink> : undefined}
      />

      {!d || !d.enough ? (
        <Card>
          <p className="py-10 text-center text-muted">O detalhamento aparece quando a campanha tiver ao menos {K_ANONYMITY} respostas.</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1fr_2fr] [&>*]:min-w-0">
            <Card className="flex flex-col gap-4">
              <span className="text-sm text-subtle">Score da dimensão</span>
              <div className="flex items-end gap-3">
                <span className="text-6xl font-semibold tracking-tight">{d.score}</span>
                <span className="pb-2 text-subtle">/100</span>
              </div>
              <RiskBadge score={d.score} className="self-start" />
              <p className="text-sm leading-relaxed text-muted">
                Severidade padrão no inventário: <strong className="text-fg">{dim.severity}/5</strong>.
              </p>
            </Card>
            <Card>
              <h2 className="mb-4 text-lg font-semibold">Por setor</h2>
              <ul className="flex flex-col gap-3">
                {d.sectors.map((s, i) => (
                  <li key={s.key} className="grid grid-cols-[minmax(0,140px)_minmax(0,1fr)_48px] items-center gap-3 text-sm">
                    <span className="truncate">{s.label}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                      <motion.div
                        className={cn("h-full rounded-full", barStyle[riskLevel(s.score)])}
                        initial={{ width: 0 }}
                        animate={{ width: `${s.score}%` }}
                        transition={{ duration: 0.8, delay: i * 0.05 }}
                      />
                    </div>
                    <span className="text-right font-mono text-muted">{s.score}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <Card className="mt-4">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Itens do questionário</h2>
                <p className="text-sm text-muted">Ordenados do maior para o menor risco. Itens marcados como proteção são invertidos no cálculo.</p>
              </div>
              <LikertLegend />
            </div>
            <ul className="flex flex-col divide-y divide-line">
              {d.items.map((it) => (
                <li key={it.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_260px_90px] md:items-center">
                  <div className="flex flex-col gap-1">
                    <p className="text-[15px] leading-snug">{it.text}</p>
                    <span className="text-xs text-subtle">
                      {it.protective ? "Fator de proteção" : "Fator de risco"} · {it.n} respostas
                    </span>
                  </div>
                  <LikertBar distribution={it.distribution} />
                  <div className="flex items-center gap-2 md:justify-end">
                    <span className="font-mono text-sm">{it.risk}</span>
                    <RiskBadge score={it.risk} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="mt-4">
            <h2 className="mb-4 text-lg font-semibold">Medidas recomendadas</h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {ACTION_LIBRARY[dim.id].map((a) => (
                <li key={a.what} className="flex flex-col gap-2 rounded-xl border border-line p-4">
                  <p className="font-medium">{a.what}</p>
                  <p className="text-sm text-muted">{a.how}</p>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  )
}
