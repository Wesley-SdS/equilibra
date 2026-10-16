"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { use, useCallback, useEffect, useRef, useState } from "react"
import { Button, Logo, Spinner } from "@/components/ui/primitives"
import { client } from "@/lib/client"
import { DIMENSIONS, QUESTIONS, SCALE } from "@/lib/methodology"
import { cn } from "@/lib/utils"

type Phase = "intro" | "questions" | "done"

export default function SurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const storageKey = `eq_draft_${token}`
  const [phase, setPhase] = useState<Phase>("intro")
  const [sectorId, setSectorId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [index, setIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const advancing = useRef(false)

  const info = useQuery({
    queryKey: ["survey", token],
    queryFn: async () => (await client.survey.byToken.$get({ token })).json(),
    retry: false,
  })

  // Rascunho local: se a pessoa fechar a aba, continua de onde parou (fica só no aparelho dela).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const d = JSON.parse(raw) as { sectorId: string; answers: Record<string, number>; index: number }
        setSectorId(d.sectorId)
        setAnswers(d.answers)
        setIndex(Math.min(d.index, QUESTIONS.length - 1))
      }
    } catch {}
  }, [storageKey])
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [phase])
  useEffect(() => {
    if (phase !== "questions" || !sectorId) return
    try {
      localStorage.setItem(storageKey, JSON.stringify({ sectorId, answers, index }))
    } catch {}
  }, [answers, index, phase, sectorId, storageKey])

  const submit = useMutation({
    mutationFn: async (final: Record<string, number>) =>
      (
        await client.survey.submit.$post({
          token,
          sectorId: sectorId!,
          answers: QUESTIONS.map((q) => ({ questionId: q.id, value: final[q.id]! })),
        })
      ).json(),
    onSuccess: () => {
      try {
        localStorage.removeItem(storageKey)
      } catch {}
      setPhase("done")
    },
  })

  // Índice e respostas também ficam em refs: handlers de teclado e timers leem sempre o
  // valor atual, mesmo quando disparam antes do próximo render (teclas muito rápidas).
  const indexRef = useRef(0)
  const answersRef = useRef<Record<string, number>>({})
  indexRef.current = index
  answersRef.current = answers

  const goTo = useCallback((i: number, dir: number) => {
    const clamped = Math.min(Math.max(i, 0), QUESTIONS.length - 1)
    indexRef.current = clamped
    setDirection(dir)
    setIndex(clamped)
  }, [])

  const answer = useCallback(
    (value: number) => {
      // Trava enquanto a transição para a próxima pergunta (ou o envio) acontece:
      // cliques/teclas rápidas não podem agendar dois avanços nem pular do fim da lista.
      if (advancing.current || submit.isPending) return
      advancing.current = true
      const current = indexRef.current
      const q = QUESTIONS[current]!
      const next = { ...answersRef.current, [q.id]: value }
      answersRef.current = next
      setAnswers(next)
      setTimeout(() => {
        const missing = QUESTIONS.findIndex((x) => !next[x.id])
        if (current < QUESTIONS.length - 1) {
          goTo(current + 1, 1)
        } else if (missing >= 0) {
          // Nunca envia incompleto: volta para a primeira pergunta sem resposta.
          goTo(missing, -1)
        } else {
          submit.mutate(next)
        }
        advancing.current = false
      }, 220)
    },
    [goTo, submit]
  )

  useEffect(() => {
    if (phase !== "questions") return
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (n >= 1 && n <= 5) answer(n)
      if (e.key === "ArrowLeft" && indexRef.current > 0 && !advancing.current) goTo(indexRef.current - 1, -1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [phase, answer, goTo])

  if (info.isLoading) {
    return (
      <Shell>
        <div className="grid flex-1 place-items-center text-muted">
          <Spinner className="size-6" />
        </div>
      </Shell>
    )
  }
  if (info.isError || !info.data) {
    return (
      <Shell>
        <Message title="Link inválido" text="Este link de avaliação não existe. Confira com o RH da sua empresa." />
      </Shell>
    )
  }
  const data = info.data
  if (data.alreadyAnswered && phase !== "done") {
    return (
      <Shell company={data.companyName}>
        <Message title="Você já respondeu" text="Obrigado! Sua resposta já foi registrada neste dispositivo." />
      </Shell>
    )
  }
  if (!data.campaign.isOpen && phase !== "done") {
    return (
      <Shell company={data.companyName}>
        <Message title="Avaliação encerrada" text="Esta avaliação não está recebendo respostas no momento." />
      </Shell>
    )
  }

  // Índice sempre dentro da lista (protege também contra rascunhos antigos no aparelho).
  const q = QUESTIONS[Math.min(Math.max(index, 0), QUESTIONS.length - 1)]!
  const dim = DIMENSIONS.find((d) => d.id === q.dimension)!
  const progress = ((index + (answers[q.id] ? 1 : 0)) / QUESTIONS.length) * 100

  return (
    <Shell company={data.companyName}>
      <AnimatePresence mode="wait">
        {phase === "intro" && (
          <motion.div key="intro" exit={{ opacity: 0, y: -12 }} className="flex flex-1 flex-col gap-6">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3">
              <span className="font-mono text-xs text-brand-fg">{data.campaign.name}</span>
              <h1 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.03em]">Como está o seu dia a dia no trabalho?</h1>
              <p className="text-[15px] leading-relaxed text-muted">
                São {QUESTIONS.length} perguntas rápidas, cerca de 6 minutos. Suas respostas ajudam a empresa a melhorar as condições de trabalho.
              </p>
            </motion.div>
            <motion.ul
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex flex-col gap-2.5 rounded-2xl border border-brand/20 bg-brand/[0.05] p-4 text-sm"
            >
              {["Não pedimos nome, e-mail nem telefone", "Não registramos IP nem horário exato", "Resultados só aparecem para grupos de 5 ou mais pessoas"].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0 text-brand-fg" aria-hidden="true">
                    <rect x="5" y="11" width="14" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                  {t}
                </li>
              ))}
            </motion.ul>
            <motion.fieldset initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="flex flex-col gap-2.5">
              <legend className="mb-2.5 text-sm font-medium">Em qual setor você trabalha?</legend>
              {data.sectors.map((s) => (
                <label
                  key={s.id}
                  className={cn(
                    "flex min-h-13 cursor-pointer items-center gap-3 rounded-xl border px-4 text-[15px] transition-all",
                    sectorId === s.id ? "border-brand bg-brand/10" : "border-line-strong hover:border-tint/25"
                  )}
                >
                  <input type="radio" name="sector" className="sr-only" checked={sectorId === s.id} onChange={() => setSectorId(s.id)} />
                  <span className={cn("grid size-5 place-items-center rounded-full border-2", sectorId === s.id ? "border-brand" : "border-subtle")}>
                    {sectorId === s.id && <motion.span layoutId="sector-dot" className="size-2.5 rounded-full bg-brand" />}
                  </span>
                  {s.name}
                </label>
              ))}
            </motion.fieldset>
            <Button size="lg" className="mt-auto" disabled={!sectorId} onClick={() => setPhase("questions")}>
              {Object.keys(answers).length ? "Continuar de onde parei" : "Começar"}
            </Button>
          </motion.div>
        )}

        {phase === "questions" && (
          <motion.div key="questions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col">
            <div className="flex flex-col gap-2.5">
              <div className="flex justify-between text-[13px] text-subtle">
                <span>{dim.name}</span>
                <span className="font-mono">
                  {index + 1}/{QUESTIONS.length}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-tint/[0.07]" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
                <motion.div className="h-full rounded-full bg-brand" animate={{ width: `${progress}%` }} transition={{ type: "spring", stiffness: 200, damping: 30 }} />
              </div>
            </div>

            <div className="relative mt-10 flex-1">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={q.id}
                  custom={direction}
                  initial={{ opacity: 0, x: direction * 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: direction * -40 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-col gap-8"
                >
                  <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.02em]">{q.text}</h2>
                  <div className="flex flex-col gap-2.5" role="radiogroup" aria-label={q.text}>
                    {SCALE.map((label, i) => {
                      const value = i + 1
                      const selected = answers[q.id] === value
                      return (
                        <motion.button
                          key={label}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          whileTap={{ scale: 0.98 }}
                          disabled={submit.isPending}
                          onClick={() => answer(value)}
                          className={cn(
                            "flex min-h-14 items-center justify-between rounded-xl border px-4 text-left text-base font-medium transition-colors",
                            selected ? "border-brand bg-brand text-brand-ink" : "border-line-strong bg-tint/[0.02] hover:border-tint/25 hover:bg-tint/[0.05]"
                          )}
                        >
                          {label}
                          <kbd className={cn("hidden rounded-md border px-1.5 font-mono text-xs sm:inline", selected ? "border-black/20" : "border-line-strong text-subtle")}>
                            {value}
                          </kbd>
                        </motion.button>
                      )
                    })}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="mt-8 flex items-center justify-between">
              <Button
                variant="ghost"
                disabled={index === 0 || submit.isPending}
                onClick={() => goTo(indexRef.current - 1, -1)}
              >
                ← Voltar
              </Button>
              {submit.isPending ? (
                <span className="flex items-center gap-2 text-sm text-muted">
                  <Spinner /> Enviando…
                </span>
              ) : submit.error ? (
                <Button size="sm" onClick={() => submit.mutate(answers)}>
                  Tentar enviar de novo
                </Button>
              ) : (
                <span className="hidden text-xs text-subtle sm:block">Use as teclas 1–5</span>
              )}
            </div>
            {submit.error && <p className="mt-3 text-sm text-risk-crit-fg">{submit.error.message}</p>}
          </motion.div>
        )}

        {phase === "done" && (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
              className="grid size-20 place-items-center rounded-full bg-brand"
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#07090a" strokeWidth="2.6" aria-hidden="true">
                <motion.path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.35, duration: 0.4 }} />
              </svg>
            </motion.div>
            <h1 className="text-3xl font-semibold tracking-tight">Obrigado!</h1>
            <p className="max-w-xs text-muted">Sua resposta anônima foi registrada. Ela ajuda a construir um ambiente de trabalho mais saudável.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  )
}

function Shell({ children, company }: { children: React.ReactNode; company?: string }) {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-[-240px] h-[480px] w-[700px] -translate-x-1/2 rounded-full bg-glow"
      />
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col px-5 py-6">
        <header className="mb-8 flex items-center justify-between">
          <Logo />
          {company && <span className="max-w-[50%] truncate text-xs text-subtle">{company}</span>}
        </header>
        {children}
      </div>
    </div>
  )
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="max-w-xs text-muted">{text}</p>
    </div>
  )
}
