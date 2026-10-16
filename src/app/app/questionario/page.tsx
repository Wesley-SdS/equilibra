"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"
import { PageHeader } from "@/components/app/page-header"
import { LikertBar, LikertLegend } from "@/components/app/trend"
import { Button, Card, Field, Input, Spinner } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { JevBadge } from "@/components/app/jev-badge"
import { client } from "@/lib/client"
import { useCan } from "@/lib/hooks"
import { DIMENSIONS, K_ANONYMITY, QUESTIONS, SCALE } from "@/lib/methodology"
import { cn } from "@/lib/utils"

const MAX = 10

export default function QuestionnairePage() {
  const can = useCan()
  const qc = useQueryClient()
  const toast = useToast()
  const [text, setText] = useState("")
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [preview, setPreview] = useState(false)

  const list = useQuery({ queryKey: ["questions"], queryFn: async () => (await client.questions.list.$get()).json() })
  const results = useQuery({ queryKey: ["questions-results"], queryFn: async () => (await client.questions.results.$get({})).json() })
  const refresh = () => qc.invalidateQueries({ queryKey: ["questions"] })

  const create = useMutation({
    mutationFn: async () => (await client.questions.create.$post({ text })).json(),
    onSuccess: () => {
      setText("")
      refresh()
      toast("Pergunta adicionada. Ela entra nas próximas campanhas.")
    },
  })
  const update = useMutation({
    mutationFn: async (v: { id: string; text?: string; active?: boolean }) => (await client.questions.update.$post(v)).json(),
    onSuccess: () => {
      setEditing(null)
      refresh()
    },
    onError: (e) => toast(e.message, "error"),
  })
  const move = useMutation({
    mutationFn: async (v: { id: string; dir: "up" | "down" }) => (await client.questions.move.$post(v)).json(),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: async (id: string) => (await client.questions.remove.$post({ id })).json(),
    onSuccess: () => {
      refresh()
      toast("Pergunta excluída")
    },
  })

  const rows = list.data ?? []
  const active = rows.filter((r) => r.active)

  return (
    <>
      <PageHeader
        title="Questionário"
        description="As 28 perguntas da metodologia são fixas, para manter o cálculo de risco válido. Você pode acrescentar até 10 perguntas próprias da empresa, relatadas à parte."
        actions={
          <Button variant="secondary" onClick={() => setPreview((v) => !v)}>
            {preview ? "Fechar pré-visualização" : "Pré-visualizar"}
          </Button>
        }
      />

      <AnimatePresence>
        {preview && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Preview questions={active.map((q) => q.text)} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Perguntas da empresa</h2>
            <span className="font-mono text-sm text-muted">
              {active.length}/{MAX} ativas
            </span>
          </div>

          {can.edit && (
            <form
              className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault()
                create.mutate()
              }}
            >
              <div className="flex-1">
                <Field label="Nova pergunta" htmlFor="qtext" hint="Escreva como uma afirmação de frequência. Ex.: “Tenho os equipamentos de que preciso para trabalhar.”">
                  <Input id="qtext" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="Ex.: Recebo treinamento suficiente para a minha função." />
                </Field>
              </div>
              <Button type="submit" loading={create.isPending} disabled={active.length >= MAX} className="sm:mb-[26px]">
                Adicionar
              </Button>
            </form>
          )}
          {create.error && <p className="-mt-2 mb-4 text-sm text-risk-crit-fg">{create.error.message}</p>}

          {list.isLoading ? (
            <div className="grid h-24 place-items-center text-muted">
              <Spinner />
            </div>
          ) : rows.length ? (
            <ol className="flex flex-col divide-y divide-line">
              <AnimatePresence initial={false}>
                {rows.map((q, i) => (
                  <motion.li key={q.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-start gap-3 py-3">
                    <span className="mt-0.5 font-mono text-xs text-subtle">{String(i + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      {editing?.id === q.id ? (
                        <form
                          className="flex gap-2"
                          onSubmit={(e) => {
                            e.preventDefault()
                            update.mutate({ id: q.id, text: editing.text })
                          }}
                        >
                          <Input aria-label="Editar pergunta" autoFocus value={editing.text} maxLength={200} onChange={(e) => setEditing({ id: q.id, text: e.target.value })} />
                          <Button type="submit" size="sm" className="h-11" loading={update.isPending}>
                            Salvar
                          </Button>
                        </form>
                      ) : (
                        <>
                          <p className={cn("text-[15px] leading-snug", !q.active && "text-subtle line-through")}>{q.text}</p>
                          {q.dimension && (
                            <span className="mt-1 inline-flex items-center gap-1.5 text-xs text-subtle">
                              Relacionada a {DIMENSIONS.find((d) => d.id === q.dimension)?.name}
                              <JevBadge decision={{ engine: "jev", confidence: (q.dimensionConfidence ?? 0) / 100 }} />
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    {can.edit && editing?.id !== q.id && (
                      <div className="flex shrink-0 items-center gap-1">
                        <IconBtn label="Subir" disabled={i === 0} onClick={() => move.mutate({ id: q.id, dir: "up" })} d="M12 19V5M5 12l7-7 7 7" />
                        <IconBtn label="Descer" disabled={i === rows.length - 1} onClick={() => move.mutate({ id: q.id, dir: "down" })} d="M12 5v14M5 12l7 7 7-7" />
                        <IconBtn label="Editar" onClick={() => setEditing({ id: q.id, text: q.text })} d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />
                        <button
                          type="button"
                          role="switch"
                          aria-checked={q.active}
                          aria-label={q.active ? "Desativar pergunta" : "Ativar pergunta"}
                          onClick={() => update.mutate({ id: q.id, active: !q.active })}
                          className={cn("relative mx-1 h-6 w-10 rounded-full transition-colors", q.active ? "bg-brand" : "bg-tint/[0.12]")}
                        >
                          <motion.span layout className={cn("absolute top-1 size-4 rounded-full bg-surface shadow", q.active ? "right-1" : "left-1")} />
                        </button>
                        <IconBtn label="Excluir" onClick={() => confirm("Excluir esta pergunta? Campanhas já lançadas mantêm a cópia delas.") && remove.mutate(q.id)} d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                      </div>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          ) : (
            <p className="py-8 text-center text-sm text-muted">Nenhuma pergunta própria ainda. O questionário usa só as 28 perguntas da metodologia.</p>
          )}
          <p className="mt-4 text-[13px] text-subtle">
            Cada campanha guarda uma cópia das perguntas ativas no momento em que é criada. Editar ou excluir aqui não altera campanhas já lançadas.
          </p>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <h2 className="mb-1 text-lg font-semibold">Metodologia (fixa)</h2>
            <p className="mb-4 text-sm text-muted">
              {QUESTIONS.length} itens em {DIMENSIONS.length} dimensões. Essas perguntas compõem o score de risco da NR-1.
            </p>
            <ul className="flex flex-col gap-2 text-sm">
              {DIMENSIONS.map((d) => (
                <li key={d.id} className="flex justify-between gap-3">
                  <span>{d.name}</span>
                  <span className="font-mono text-subtle">{QUESTIONS.filter((q) => q.dimension === d.id).length}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Resultados das perguntas da empresa</h2>
            <p className="text-sm text-muted">{results.data ? results.data.campaign.name : "Última campanha"} · não entram no score NR-1</p>
          </div>
          <LikertLegend />
        </div>
        {results.isLoading ? (
          <div className="grid h-24 place-items-center text-muted">
            <Spinner />
          </div>
        ) : !results.data ? (
          <p className="py-8 text-center text-sm text-muted">Nenhuma campanha ainda.</p>
        ) : !results.data.enough ? (
          <p className="py-8 text-center text-sm text-muted">Os resultados aparecem a partir de {K_ANONYMITY} respostas na campanha.</p>
        ) : !results.data.items.length ? (
          <p className="py-8 text-center text-sm text-muted">A última campanha foi lançada sem perguntas da empresa. As perguntas ativas entram na próxima.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {results.data.items.map((r) => (
              <li key={r.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,1fr)_240px_150px] md:items-center">
                <div>
                  <p className="text-[15px] leading-snug">{r.text}</p>
                  <span className="text-xs text-subtle">{r.n} respostas</span>
                </div>
                <LikertBar distribution={r.distribution} />
                <div className="flex items-baseline gap-3 md:justify-end">
                  <span className="font-mono text-lg">{r.average.toFixed(1)}</span>
                  <span className="text-xs text-muted">{r.favorable}% freq./sempre</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

function IconBtn({ label, d, onClick, disabled }: { label: string; d: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-lg text-subtle transition-colors hover:bg-tint/[0.06] hover:text-fg disabled:opacity-30"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={d} />
      </svg>
    </button>
  )
}

/** Mostra como as perguntas da empresa aparecem no fim do questionário. */
function Preview({ questions }: { questions: string[] }) {
  const [i, setI] = useState(0)
  const items = questions.length ? questions : ["(Nenhuma pergunta ativa — só as 28 da metodologia serão exibidas.)"]
  const q = items[Math.min(i, items.length - 1)]!
  return (
    <div className="mb-4 flex justify-center rounded-3xl border border-line bg-surface/60 p-6">
      <div className="w-full max-w-sm rounded-[28px] border border-line-strong bg-bg p-5 shadow-2xl shadow-[var(--shadow)]">
        <div className="mb-2 flex justify-between text-[12px] text-subtle">
          <span>Perguntas da empresa</span>
          <span className="font-mono">
            {QUESTIONS.length + Math.min(i, items.length - 1) + 1}/{QUESTIONS.length + questions.length}
          </span>
        </div>
        <div className="mb-6 h-1 rounded-full bg-tint/[0.08]">
          <div className="h-1 rounded-full bg-brand" style={{ width: `${((QUESTIONS.length + i + 1) / (QUESTIONS.length + Math.max(1, questions.length))) * 100}%` }} />
        </div>
        <AnimatePresence mode="wait">
          <motion.p key={q} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="mb-5 text-xl font-semibold leading-snug">
            {q}
          </motion.p>
        </AnimatePresence>
        <div className="flex flex-col gap-2">
          {SCALE.map((s) => (
            <button key={s} type="button" onClick={() => setI((x) => (x + 1) % items.length)} className="h-11 rounded-xl border border-line-strong px-3 text-left text-sm hover:border-brand/60">
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
