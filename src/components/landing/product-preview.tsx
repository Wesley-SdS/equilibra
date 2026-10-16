"use client"

import { motion } from "motion/react"
import { cellStyle } from "@/components/ui/primitives"
import { riskLevel } from "@/lib/methodology"
import { cn } from "@/lib/utils"

const SECTORS = ["Produção", "Balcão", "Entregas", "Adm."]
const ROWS: { label: string; values: number[] }[] = [
  { label: "Demandas", values: [78, 61, 57, 32] },
  { label: "Controle", values: [56, 41, 38, 18] },
  { label: "Liderança", values: [44, 22, 60, 15] },
  { label: "Assédio", values: [20, 31, 12, 10] },
  { label: "Reconhecimento", values: [52, 28, 63, 21] },
]

export function ProductPreview() {
  return (
    <div className="ring-gradient rounded-[22px] bg-surface/90 p-2 shadow-[0_40px_120px_-40px_rgba(198,245,111,0.25)] backdrop-blur">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="size-2.5 rounded-full bg-tint/10" />
        <span className="size-2.5 rounded-full bg-tint/10" />
        <span className="size-2.5 rounded-full bg-tint/10" />
        <span className="ml-3 truncate rounded-md bg-tint/[0.04] px-3 py-1 font-mono text-xs text-subtle">app.equilibra.com.br/painel</span>
      </div>
      <div className="grid gap-4 p-3 sm:p-6 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-bg/60 p-5">
          <div className="flex items-baseline justify-between text-[13px] text-subtle">
            <span>Mapa de calor · setor × dimensão</span>
            <span className="font-mono">142 resp · 71%</span>
          </div>
          <div className="overflow-x-auto">
            <div className="grid min-w-[420px] grid-cols-[110px_repeat(4,minmax(0,1fr))] gap-1.5 text-xs">
              <span />
              {SECTORS.map((s) => (
                <span key={s} className="pb-1 text-subtle">
                  {s}
                </span>
              ))}
              {ROWS.map((row, r) => (
                <Row key={row.label} label={row.label} values={row.values} rowIndex={r} />
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Índice geral" value="43" tone="text-risk-mod-fg" note="Moderado" />
          <Stat label="Em alerta" value="3" tone="text-risk-crit-fg" note="1 crítica" />
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 1.1, duration: 0.6 }}
            className="col-span-2 flex flex-col gap-3 rounded-2xl border border-brand/25 bg-brand/[0.06] p-4"
          >
            <span className="font-mono text-[11px] uppercase tracking-wider text-brand-fg">Ação sugerida</span>
            <p className="text-[15px] leading-relaxed">
              Redistribuir metas da Produção com a liderança e criar pausas programadas no pico das 6h às 9h.
            </p>
            <span className="self-start rounded-full bg-brand px-3 py-1 text-xs font-medium text-brand-ink">+ Adicionar ao plano</span>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

function Row({ label, values, rowIndex }: { label: string; values: number[]; rowIndex: number }) {
  return (
    <>
      <span className="flex items-center text-muted">{label}</span>
      {values.map((v, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, scale: 0.6 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.25 + (rowIndex * 4 + i) * 0.035, type: "spring", stiffness: 300, damping: 22 }}
          className={cn("grid h-10 place-items-center rounded-lg font-mono text-[13px] font-medium", cellStyle[riskLevel(v)])}
        >
          {v}
        </motion.span>
      ))}
    </>
  )
}

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-line bg-bg/60 p-4">
      <span className="text-xs text-subtle">{label}</span>
      <span className="text-4xl font-semibold tracking-tight">{value}</span>
      <span className={cn("text-xs", tone)}>{note}</span>
    </div>
  )
}
