"use client"

import { motion } from "motion/react"
import { useState } from "react"
import { RiskBadge } from "@/components/ui/primitives"
import { SCALE } from "@/lib/methodology"
import { cn, formatDate } from "@/lib/utils"

type Point = { id: string; name: string; startsAt: string; index: number; responses: number; rate: number }

/** Linha do índice geral por campanha, com crosshair e tooltip no hover. */
export function IndexTrend({ points }: { points: Point[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 720
  const H = 240
  const pad = { l: 36, r: 84, t: 20, b: 36 }
  const x = (i: number) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (points.length - 1)) * (W - pad.l - pad.r))
  const y = (v: number) => pad.t + (1 - v / 100) * (H - pad.t - pad.b)
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.index)}`).join(" ")
  const bands = [
    { from: 75, to: 100, label: "Crítico" },
    { from: 50, to: 75, label: "Alto" },
    { from: 25, to: 50, label: "Moderado" },
    { from: 0, to: 25, label: "Baixo" },
  ]
  const h = hover !== null ? points[hover] : null

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Evolução do índice geral de risco por campanha">
        {bands.map((b) => (
          <g key={b.label}>
            <line x1={pad.l} x2={W - pad.r} y1={y(b.from)} y2={y(b.from)} className="stroke-line" />
            <text x={W - 4} y={(y(b.to) + y(b.from)) / 2 + 4} textAnchor="end" fontSize="11" className="fill-subtle">
              {b.label}
            </text>
          </g>
        ))}
        {[0, 25, 50, 75, 100].map((v) => (
          <text key={v} x={pad.l - 10} y={y(v) + 4} textAnchor="end" fontSize="11" className="fill-subtle" fontFamily="var(--font-geist-mono)">
            {v}
          </text>
        ))}
        {h && hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} className="stroke-line-strong" strokeDasharray="3 3" />}
        <motion.path d={path} fill="none" className="stroke-brand-fg" strokeWidth="2" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
        {points.map((p, i) => (
          <g key={p.id}>
            <motion.circle cx={x(i)} cy={y(p.index)} r={hover === i ? 6 : 4.5} className="fill-brand stroke-surface" strokeWidth="2" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 + i * 0.1 }} />
            <text x={x(i)} y={H - pad.b + 20} textAnchor="middle" fontSize="11" className="fill-muted">
              {formatDate(p.startsAt).slice(3)}
            </text>
            {(i === points.length - 1 || i === 0) && (
              <text x={x(i)} y={y(p.index) - 12} textAnchor="middle" fontSize="12" fontWeight="600" className="fill-fg">
                {p.index}
              </text>
            )}
            <rect
              x={x(i) - 40}
              y={pad.t}
              width={80}
              height={H - pad.t - pad.b}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 w-56 -translate-x-1/2 rounded-xl border border-line-strong bg-surface-2/95 p-3 text-sm shadow-xl backdrop-blur"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          <p className="font-medium">{h.name}</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-muted">Índice</span>
            <span className="flex items-center gap-2 font-mono">
              {h.index} <RiskBadge score={h.index} />
            </span>
          </div>
          <div className="mt-1 flex justify-between text-muted">
            <span>Respostas</span>
            <span className="font-mono text-fg">
              {h.responses} · {h.rate}%
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Antes → depois por dimensão, entre duas campanhas. */
export function DimensionDelta({ rows }: { rows: { id: string; name: string; before: number; after: number }[] }) {
  return (
    <ul className="flex flex-col gap-5">
      {rows.map((r, i) => {
        const delta = r.after - r.before
        const better = delta < 0
        const lo = Math.min(r.before, r.after)
        const hi = Math.max(r.before, r.after)
        return (
          <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[180px_minmax(0,1fr)_88px]">
            <span className="text-sm">{r.name}</span>
            <span
              className={cn(
                "flex items-center justify-end gap-1 font-mono text-sm sm:order-last",
                delta === 0 ? "text-muted" : better ? "text-risk-low-fg" : "text-risk-crit-fg"
              )}
            >
              <span aria-hidden="true">{delta === 0 ? "=" : better ? "↓" : "↑"}</span>
              {delta > 0 ? `+${delta}` : delta}
              <span className="sr-only">{better ? "melhorou" : delta === 0 ? "estável" : "piorou"}</span>
            </span>
            <div className="relative col-span-2 h-6 sm:col-span-1" title={`${r.name}: ${r.before} → ${r.after}`}>
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-tint/[0.08]" />
              {[25, 50, 75].map((t) => (
                <div key={t} className="absolute top-1 h-4 w-px bg-tint/[0.06]" style={{ left: `${t}%` }} />
              ))}
              <motion.div
                className={cn("absolute top-1/2 h-1 -translate-y-1/2 rounded-full", better ? "bg-risk-low-fg/50" : "bg-risk-crit/50")}
                initial={{ left: `${r.before}%`, width: 0 }}
                animate={{ left: `${lo}%`, width: `${hi - lo}%` }}
                transition={{ duration: 0.8, delay: i * 0.05 }}
              />
              <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-subtle bg-surface" style={{ left: `${r.before}%` }} />
              <motion.span
                className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-fg"
                initial={{ left: `${r.before}%` }}
                animate={{ left: `${r.after}%` }}
                transition={{ duration: 0.8, delay: i * 0.05 }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// Rampa sequencial de uma só cor (marca) para a escala ordinal Nunca → Sempre.
const LIKERT_RAMP = ["var(--likert-1)", "var(--likert-2)", "var(--likert-3)", "var(--likert-4)", "var(--likert-5)"]

export function LikertLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted">
      {SCALE.map((label, i) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="size-3 rounded" style={{ background: LIKERT_RAMP[i] }} />
          {label}
        </span>
      ))}
    </div>
  )
}

/** Distribuição das respostas de um item (barra 100% empilhada, 2px de respiro entre segmentos). */
export function LikertBar({ distribution }: { distribution: number[] }) {
  const total = distribution.reduce((s, v) => s + v, 0) || 1
  return (
    <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
      {distribution.map((v, i) =>
        v ? (
          <motion.span
            key={i}
            title={`${SCALE[i]}: ${v} (${Math.round((v / total) * 100)}%)`}
            className="h-full basis-0 first:rounded-l-full last:rounded-r-full"
            style={{ background: LIKERT_RAMP[i] }}
            initial={{ flexGrow: 0 }}
            animate={{ flexGrow: v }}
            transition={{ duration: 0.7, delay: i * 0.04 }}
          />
        ) : null
      )}
    </div>
  )
}
