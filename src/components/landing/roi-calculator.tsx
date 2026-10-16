"use client"

import { animate, motion, useMotionValue, useTransform } from "motion/react"
import { useEffect, useState } from "react"
import { ButtonLink } from "@/components/ui/primitives"
import { PLANS, brl } from "@/lib/plans"


// Plano adequado ao porte, a partir da fonte única de planos.
function planFor(employees: number) {
  return PLANS.find((p) => employees <= p.limits.employees) ?? PLANS[PLANS.length - 1]!
}

function AnimatedMoney({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(value)
  const text = useTransform(mv, (v) => brl(Math.round(v)))
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.5, ease: [0.22, 1, 0.36, 1] })
    return () => c.stop()
  }, [mv, value])
  return <motion.span className={className}>{text}</motion.span>
}

/** Compara o custo anual do Equilibra com diagnósticos pontuais de consultoria. A premissa é editável. */
export function RoiCalculator() {
  const [employees, setEmployees] = useState(80)
  const [consultancy, setConsultancy] = useState(15000)
  const [rounds, setRounds] = useState(2)
  const plan = planFor(employees)
  const ours = plan.monthly * 12
  const theirs = consultancy * rounds
  const saving = Math.max(0, theirs - ours)

  return (
    <div className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line lg:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col gap-7 bg-bg p-8">
        <div className="flex flex-col gap-3">
          <label htmlFor="roi-emp" className="flex justify-between text-sm">
            <span className="text-muted">Funcionários</span>
            <span className="font-mono text-fg">{employees}</span>
          </label>
          <input
            id="roi-emp"
            type="range"
            min={10}
            max={500}
            step={5}
            value={employees}
            onChange={(e) => setEmployees(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-tint/[0.08] accent-[var(--brand-fg)]"
          />
        </div>
        <div className="flex flex-col gap-3">
          <label htmlFor="roi-cons" className="flex justify-between text-sm">
            <span className="text-muted">Orçamento de consultoria por diagnóstico</span>
            <span className="font-mono text-fg">{brl(consultancy)}</span>
          </label>
          <input
            id="roi-cons"
            type="range"
            min={5000}
            max={40000}
            step={1000}
            value={consultancy}
            onChange={(e) => setConsultancy(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-tint/[0.08] accent-[var(--brand-fg)]"
          />
          <p className="text-xs text-subtle">Use o valor que você recebeu de orçamento. Padrão: R$ 15 mil.</p>
        </div>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-sm text-muted">Avaliações por ano</legend>
          <div className="flex gap-2">
            {[1, 2, 4].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={rounds === n}
                onClick={() => setRounds(n)}
                className={
                  rounds === n
                    ? "h-10 flex-1 rounded-xl border border-brand bg-brand/10 text-sm font-medium text-brand-fg"
                    : "h-10 flex-1 rounded-xl border border-line-strong text-sm text-muted hover:text-fg"
                }
              >
                {n}×
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="flex flex-col justify-between gap-8 bg-surface p-8">
        <dl className="flex flex-col gap-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Consultoria ({rounds}× ao ano)</dt>
            <dd className="font-mono">
              <AnimatedMoney value={theirs} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Equilibra · plano {plan.name}</dt>
            <dd className="font-mono">
              <AnimatedMoney value={ours} />
            </dd>
          </div>
          <div className="h-px bg-line" />
          <div className="flex flex-col gap-1">
            <dt className="text-muted">Economia estimada no ano</dt>
            <dd>
              <AnimatedMoney value={saving} className="text-5xl font-semibold tracking-tight text-brand-fg" />
            </dd>
          </div>
        </dl>
        <div className="flex flex-col gap-3">
          <p className="text-xs leading-relaxed text-subtle">
            Estimativa ilustrativa com os valores acima. O Equilibra inclui campanhas, plano de ação e relatório contínuos, não só o diagnóstico.
          </p>
          <ButtonLink href="/comecar">Começar grátis</ButtonLink>
        </div>
      </div>
    </div>
  )
}
