"use client"

import { motion } from "motion/react"
import { useState } from "react"
import { barStyle, cellStyle, RiskBadge } from "@/components/ui/primitives"
import { DIMENSIONS, riskLevel, type DimensionId } from "@/lib/methodology"
import { cn } from "@/lib/utils"

type Row = { key: string; label: string; responses: number; grouped: boolean; scores: Record<DimensionId, number | null> }

export function Heatmap({ rows }: { rows: Row[] }) {
  const [hover, setHover] = useState<string | null>(null)
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] table-fixed border-separate border-spacing-1.5 text-sm">
        <caption className="sr-only">Score de risco por setor e dimensão, de 0 a 100</caption>
        <thead>
          <tr>
            <th scope="col" className="w-40 text-left text-xs font-normal text-subtle">
              Setor
            </th>
            {DIMENSIONS.map((d) => (
              <th key={d.id} scope="col" className="truncate text-left text-xs font-normal text-subtle" title={d.name}>
                {d.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={row.key}>
              <th scope="row" className="pr-2 text-left font-normal">
                <span className="block truncate text-fg">{row.label}</span>
                <span className="text-xs text-subtle">{row.responses} resp.</span>
              </th>
              {DIMENSIONS.map((d, i) => {
                const v = row.scores[d.id]
                const id = `${row.key}-${d.id}`
                return (
                  <td key={d.id} className="p-0">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: hover && hover !== id ? 0.55 : 1, scale: hover === id ? 1.06 : 1 }}
                      transition={{ delay: hover ? 0 : (r * DIMENSIONS.length + i) * 0.015, type: "spring", stiffness: 380, damping: 26 }}
                      onMouseEnter={() => setHover(id)}
                      onMouseLeave={() => setHover(null)}
                      title={`${row.label} · ${d.name}: ${v ?? "—"}`}
                      className={cn(
                        "grid h-12 place-items-center rounded-lg font-mono text-[13px] font-medium",
                        v === null ? "bg-white/[0.03] text-subtle" : cellStyle[riskLevel(v)]
                      )}
                    >
                      {v ?? "—"}
                    </motion.div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function RiskBars({ items }: { items: { id: string; name: string; score: number }[] }) {
  return (
    <ul className="flex flex-col gap-4">
      {items.map((it, i) => (
        <li key={it.id} className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span>{it.name}</span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-muted">{it.score}</span>
              <RiskBadge score={it.score} />
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <motion.div
              className={cn("h-full rounded-full", barStyle[riskLevel(it.score)])}
              initial={{ width: 0 }}
              animate={{ width: `${it.score}%` }}
              transition={{ duration: 0.9, delay: 0.1 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Anel de progresso para taxa de resposta. */
export function Ring({ value, size = 120 }: { value: number; size?: number }) {
  const r = (size - 14) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${value}% de resposta`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#c6f56f"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - Math.min(100, value) / 100) }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="#edefee" fontSize={size / 4.5} fontWeight="600">
        {value}%
      </text>
    </svg>
  )
}

export function Legend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-subtle">
      {[
        ["Baixo · 0–24", "bg-risk-low"],
        ["Moderado · 25–49", "bg-risk-mod"],
        ["Alto · 50–74", "bg-risk-high"],
        ["Crítico · 75+", "bg-risk-crit"],
      ].map(([label, cls]) => (
        <span key={label} className="flex items-center gap-2">
          <span className={cn("size-3 rounded", cls)} />
          {label}
        </span>
      ))}
    </div>
  )
}
