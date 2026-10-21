"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useState } from "react"
import { CopilotIcon, useCopilot } from "@/components/app/copilot"
import { PageHeader } from "@/components/app/page-header"
import { ButtonLink, Card, EmptyState, RiskBadge, Select, Spinner, buttonClass } from "@/components/ui/primitives"
import { client } from "@/lib/client"
import { DIMENSIONS } from "@/lib/methodology"
import { cn, formatDate } from "@/lib/utils"

type Evo = Extract<Awaited<ReturnType<Awaited<ReturnType<typeof client.insights.evolution.$get>>["json"]>>, { enough: true }>

const STABLE = 2

/** Célula da matriz de variação: verde melhorou, vermelho piorou, cinza estável. */
function deltaCls(delta: number) {
  if (delta <= -10) return "bg-risk-low text-risk-low-fg"
  if (delta < -STABLE) return "bg-risk-low/50 text-risk-low-fg"
  if (delta >= 10) return "bg-risk-crit/25 text-risk-crit-fg"
  if (delta > STABLE) return "bg-risk-crit/10 text-risk-crit-fg"
  return "bg-tint/[0.04] text-subtle"
}
const arrow = (d: number) => (d < -STABLE ? "▼" : d > STABLE ? "▲" : "=")

/** Linha do índice geral com as ações concluídas marcadas na data em que foram concluídas. */
function IndexWithActions({ evo }: { evo: Evo }) {
  const [hover, setHover] = useState<string | null>(null)
  const pts = evo.points
  const W = 640
  const H = 250
  const pad = { l: 34, r: 20, t: 24, b: 54 }
  const t = (d: string) => Date.parse(`${d}T00:00:00Z`)
  const t0 = t(pts[0]!.startsAt)
  const t1 = Math.max(t(pts.at(-1)!.startsAt), ...evo.actionsDone.map((a) => t(a.completedOn)))
  const x = (d: string) => pad.l + ((t(d) - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - v / 100) * (H - pad.t - pad.b)
  const markers = evo.actionsDone.filter((a) => t(a.completedOn) >= t0)
  const hovered = markers.find((m) => m.id === hover)
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Índice geral de risco por campanha, com as ações concluídas">
        <rect x={pad.l} y={y(75)} width={W - pad.l - pad.r} height={y(50) - y(75)} className="fill-risk-high/5" />
        <rect x={pad.l} y={y(50)} width={W - pad.l - pad.r} height={y(25) - y(50)} className="fill-risk-mod/10" />
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="stroke-line" />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize="11" className="fill-subtle" fontFamily="var(--font-geist-mono)">
              {v}
            </text>
          </g>
        ))}
        {markers.map((m) => (
          <g key={m.id} onMouseEnter={() => setHover(m.id)} onMouseLeave={() => setHover(null)} className="cursor-default">
            <line x1={x(m.completedOn)} x2={x(m.completedOn)} y1={pad.t} y2={H - pad.b + 6} className="stroke-risk-mod-fg/40" strokeDasharray="3 3" />
            <path d={`M${x(m.completedOn)} ${H - pad.b + 2}l6 6-6 6-6-6z`} className={hover === m.id ? "fill-fg" : "fill-risk-mod-fg"} />
          </g>
        ))}
        <path d={pts.map((p, i) => `${i ? "L" : "M"}${x(p.startsAt)},${y(p.index)}`).join(" ")} fill="none" className="stroke-brand-fg" strokeWidth="2.5" strokeLinejoin="round" />
        {pts.map((p) => {
          const active = p.id === evo.from.id || p.id === evo.to.id
          return (
            <g key={p.id}>
              <circle cx={x(p.startsAt)} cy={y(p.index)} r={active ? 6 : 4} className={active ? "fill-surface stroke-brand-fg" : "fill-brand stroke-surface"} strokeWidth="2.5" />
              <text x={x(p.startsAt)} y={y(p.index) - 12} textAnchor="middle" fontSize="12" fontWeight="600" className="fill-fg" fontFamily="var(--font-geist-mono)">
                {p.index}
              </text>
              <text x={x(p.startsAt)} y={H - 12} textAnchor="middle" fontSize="11" className="fill-muted">
                {formatDate(p.startsAt).slice(3)}
              </text>
            </g>
          )
        })}
      </svg>
      {hovered && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-xl border border-line-strong bg-surface-2 px-3 py-2 text-xs shadow-xl">
          <div className="font-semibold">{hovered.what}</div>
          <div className="text-muted">
            {DIMENSIONS.find((d) => d.id === hovered.dimension)?.short} · {hovered.sector} · concluída em {formatDate(hovered.completedOn)}
          </div>
        </div>
      )}
    </div>
  )
}

function csv(evo: Evo) {
  const head = ["Dimensão", ...evo.points.map((p) => p.name), "Variação"]
  const rows = DIMENSIONS.map((d) => [d.name, ...evo.points.map((p) => String(p.scores[d.id] ?? "")), String((evo.to && evo.dimensions.find((x) => x.id === d.id)?.delta) ?? "")])
  rows.push(["Índice geral", ...evo.points.map((p) => String(p.index)), String(evo.kpis.delta)])
  return [head, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n")
}

export default function EvolutionPage() {
  const [fromId, setFromId] = useState<string | undefined>()
  const [toId, setToId] = useState<string | undefined>()
  const [sectorKey, setSectorKey] = useState<string | undefined>()
  const copilot = useCopilot()
  const q = useQuery({
    queryKey: ["evolution", fromId, toId, sectorKey],
    queryFn: async () => (await client.insights.evolution.$get({ fromId, toId, sectorKey })).json(),
    placeholderData: (prev) => prev,
  })

  if (q.isLoading) {
    return (
      <div className="grid h-80 place-items-center text-muted">
        <Spinner className="size-6" />
      </div>
    )
  }
  if (!q.data?.enough) {
    return (
      <>
        <PageHeader title="Evolução" description="Compare campanhas NR-1 para mostrar à fiscalização que as ações estão funcionando." />
        <EmptyState
          title={q.data?.points.length ? "Falta uma segunda campanha" : "Nenhuma campanha com respostas"}
          text="A evolução aparece a partir da segunda campanha NR-1 com pelo menos 5 respostas. Recomendamos reavaliar a cada 6 meses."
          action={<ButtonLink href="/app/campanhas?nova=1">Planejar nova campanha</ButtonLink>}
        />
      </>
    )
  }
  const evo = q.data
  const matrixSectors = evo.sectors
  const cell = (key: string, dim: string) => evo.cells.find((c) => c.sectorKey === key && c.dimension === dim)

  return (
    <>
      <PageHeader
        title="Evolução"
        description="O que mudou entre campanhas, onde mudou e o que foi feito no meio. É a prova de monitoramento contínuo que a NR-1 pede."
        actions={
          <>
            <Select aria-label="Campanha anterior" className="h-10 w-44 text-sm" value={evo.from.id} onChange={(e) => setFromId(e.target.value)}>
              {evo.points.filter((p) => p.startsAt < evo.to.startsAt).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <span className="self-center text-subtle">→</span>
            <Select aria-label="Campanha atual" className="h-10 w-44 text-sm" value={evo.to.id} onChange={(e) => setToId(e.target.value)}>
              {evo.points.slice(1).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Select aria-label="Setor" className="h-10 w-40 text-sm" value={sectorKey ?? ""} onChange={(e) => setSectorKey(e.target.value || undefined)}>
              <option value="">Todos os setores</option>
              {matrixSectors.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
            <a className={buttonClass("secondary")} download={`evolucao-${evo.to.startsAt}.csv`} href={`data:text/csv;charset=utf-8,${encodeURIComponent("﻿" + csv(evo))}`}>
              Exportar CSV
            </a>
          </>
        }
      />

      <Card className="mb-4 border-brand/25">
        <p className="text-lg font-medium leading-relaxed tracking-[-0.01em] sm:text-xl">{evo.lead}</p>
        <p className="mt-2 text-xs text-subtle">
          Leitura gerada por regras a partir dos agregados (sem IA) · {evo.to.responses} respostas em {evo.to.name} · {evo.from.responses} em {evo.from.name} · grupos com menos de 5 respostas não aparecem
        </p>
      </Card>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="flex flex-col gap-2">
          <span className="text-sm text-subtle">Índice atual</span>
          <span className="text-4xl font-semibold tracking-tight">{evo.kpis.index}</span>
          <RiskBadge score={evo.kpis.index} className="self-start" />
        </Card>
        <Card className="flex flex-col gap-2">
          <span className="text-sm text-subtle">Variação</span>
          <span className={cn("text-4xl font-semibold tracking-tight", evo.kpis.delta < -STABLE ? "text-risk-low-fg" : evo.kpis.delta > STABLE ? "text-risk-crit-fg" : "")}>
            {evo.kpis.delta > 0 ? `+${evo.kpis.delta}` : evo.kpis.delta}
          </span>
          <span className="text-sm text-muted">pontos vs. {evo.from.name}</span>
        </Card>
        <Card className="flex flex-col gap-2">
          <span className="text-sm text-subtle">Dimensões</span>
          <span className="text-4xl font-semibold tracking-tight">
            {evo.kpis.improved}
            <span className="text-xl text-subtle">/{evo.kpis.dimensions}</span>
          </span>
          <span className="text-sm text-muted">
            melhoraram · {evo.kpis.worsened} pioraram · {evo.kpis.stable} estáveis
          </span>
        </Card>
        <Card className="flex flex-col gap-2">
          <span className="text-sm text-subtle">Ações concluídas</span>
          <span className="text-4xl font-semibold tracking-tight">{evo.kpis.done}</span>
          <span className="text-sm text-muted">
            de {evo.kpis.total} no plano{evo.kpis.late ? ` · ${evo.kpis.late} atrasadas` : ""}
          </span>
        </Card>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr] [&>*]:min-w-0">
        <Card>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Índice geral com as ações marcadas</h2>
            <span className="text-xs text-subtle">◆ ação concluída · passe o mouse</span>
          </div>
          <IndexWithActions evo={evo} />
        </Card>
        <Card className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Onde agir agora</h2>
            <span className="text-xs text-subtle">o que mais piorou</span>
          </div>
          {!evo.hotspots.length && <p className="py-6 text-sm text-muted">Nenhum setor piorou mais de 2 pontos em alguma dimensão. Mantenha o plano e reavalie no próximo ciclo.</p>}
          {evo.hotspots.map((h) => (
            <div key={`${h.sectorKey}-${h.dimension}`} className="flex items-center gap-3 rounded-xl border border-line bg-tint/[0.02] p-3">
              <span className={cn("rounded-full px-2.5 py-0.5 font-mono text-xs", deltaCls(h.delta))}>+{h.delta}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {h.dimensionName} · {h.sectorLabel}
                </div>
                <div className="text-xs text-subtle">
                  {h.before} → {h.after} · {h.responses} respostas ·{" "}
                  {h.openActions ? `${h.openActions} ação aberta${h.lateActions ? `, ${h.lateActions} atrasada` : ""}` : "nenhuma ação no plano"}
                </div>
              </div>
              {h.openActions ? (
                <ButtonLink href="/app/plano" variant="secondary" size="sm">
                  Ver plano
                </ButtonLink>
              ) : (
                <ButtonLink href={`/app/plano?nova=1&dimensao=${h.dimension}&setor=${h.sectorKey}&por=${encodeURIComponent(`${h.dimensionName} subiu ${h.delta} pontos em ${h.sectorLabel} (${h.before} → ${h.after}).`)}`} size="sm">
                  Criar ação
                </ButtonLink>
              )}
            </div>
          ))}
          {copilot.data?.available && evo.hotspots[0] && (
            <Link href={`/app/plano?copiloto=${encodeURIComponent(`Por que ${evo.hotspots[0].dimensionName} piorou em ${evo.hotspots[0].sectorLabel}? O que fazer?`)}`} className="mt-1 flex items-center gap-2 text-sm text-brand-fg hover:underline">
              <CopilotIcon /> Perguntar ao copiloto por que {evo.hotspots[0].dimensionName.toLowerCase()} piorou em {evo.hotspots[0].sectorLabel}
            </Link>
          )}
        </Card>
      </div>

      <Card className="mb-4 overflow-x-auto">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Variação por setor e dimensão</h2>
          <span className="text-xs text-subtle">
            pontos de diferença {evo.from.name} → {evo.to.name} · verde melhorou · vermelho piorou
          </span>
        </div>
        {matrixSectors.length ? (
          <div className="grid min-w-[760px] gap-1.5" style={{ gridTemplateColumns: `160px repeat(${DIMENSIONS.length}, minmax(0,1fr))` }}>
            <span />
            {DIMENSIONS.map((d) => (
              <span key={d.id} className="pb-1 text-center text-xs text-subtle">
                {d.short}
              </span>
            ))}
            {matrixSectors.map((s) => (
              <div key={s.key} className="contents">
                <span className="self-center truncate pr-2 text-sm">{s.label}</span>
                {DIMENSIONS.map((d) => {
                  const c = cell(s.key, d.id)
                  return c ? (
                    <Link
                      key={d.id}
                      href={`/app/dimensao/${d.id}?campanha=${evo.to.id}`}
                      title={`${d.name} · ${s.label}: ${c.before} → ${c.after}`}
                      className={cn("flex h-12 flex-col items-center justify-center rounded-lg font-mono text-sm transition-transform hover:scale-[1.04]", deltaCls(c.delta))}
                    >
                      {arrow(c.delta)} {Math.abs(c.delta)}
                      <span className="font-sans text-[10px] opacity-80">
                        {c.before} → {c.after}
                      </span>
                    </Link>
                  ) : (
                    <span key={d.id} className="grid h-12 place-items-center rounded-lg bg-tint/[0.02] text-xs text-subtle">
                      ·
                    </span>
                  )
                })}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Nenhum setor teve 5 ou mais respostas nas duas campanhas. A comparação por setor fica disponível quando houver grupos grandes o bastante.</p>
        )}
      </Card>

      <Card>
        <details>
          <summary className="cursor-pointer text-sm font-medium">Tabela de dados ({evo.points.length} campanhas)</summary>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-subtle">
                <tr>
                  <th className="py-2 pr-4 font-medium">Dimensão</th>
                  {evo.points.map((p) => (
                    <th key={p.id} className="py-2 pr-4 font-medium">
                      {formatDate(p.startsAt).slice(3)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {DIMENSIONS.map((d) => (
                  <tr key={d.id}>
                    <td className="py-2 pr-4">{d.name}</td>
                    {evo.points.map((p) => (
                      <td key={p.id} className="py-2 pr-4 font-mono">
                        {p.scores[d.id] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="py-2 pr-4">Índice geral</td>
                  {evo.points.map((p) => (
                    <td key={p.id} className="py-2 pr-4 font-mono">
                      {p.index}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </Card>
    </>
  )
}
