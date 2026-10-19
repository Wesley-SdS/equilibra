"use client"

import { AnimatePresence, motion } from "motion/react"
import { useMutation } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { CopilotMessage, CopilotShell, useCopilot } from "@/components/app/copilot"
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { client } from "@/lib/client"
import { DIMENSIONS, type DimensionId } from "@/lib/methodology"
import { MAX_ITEMS, QUESTIONNAIRE_KINDS, newItemId, type QuestionnaireItem, type QuestionnaireKind } from "@/lib/questionnaire"
import { cn } from "@/lib/utils"

export type QuestionnaireDraft = {
  id?: string
  system?: boolean
  /** Já usado em campanha: o anonimato não muda mais. */
  used?: boolean
  name: string
  purpose: string
  kind: QuestionnaireKind
  anonymous: boolean
  items: QuestionnaireItem[]
}

export const EMPTY_DRAFT: QuestionnaireDraft = { name: "", purpose: "", kind: "pulso", anonymous: true, items: [] }

/** Gaveta de criação/edição de questionário. O NR-1 padrão abre só para leitura. */
export function QuestionnaireDrawer({
  draft,
  saving,
  error,
  onClose,
  onSave,
  onDuplicate,
}: {
  draft: QuestionnaireDraft | null
  saving: boolean
  error?: string
  onClose: () => void
  onSave: (d: QuestionnaireDraft) => void
  onDuplicate: (id: string) => void
}) {
  const [d, setD] = useState<QuestionnaireDraft>(EMPTY_DRAFT)
  useEffect(() => {
    if (draft) setD(draft)
  }, [draft])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    if (draft) window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [draft, onClose])

  const readOnly = Boolean(d.system)
  const setItem = (id: string, patch: Partial<QuestionnaireItem>) => setD((x) => ({ ...x, items: x.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }))
  const addItem = () => setD((x) => ({ ...x, items: [...x.items, { id: newItemId(), text: "", type: "likert5", dimension: null, risk: true }] }))
  const removeItem = (id: string) => setD((x) => ({ ...x, items: x.items.filter((i) => i.id !== id) }))
  const move = (id: string, dir: -1 | 1) =>
    setD((x) => {
      const i = x.items.findIndex((it) => it.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= x.items.length) return x
      const items = [...x.items]
      ;[items[i], items[j]] = [items[j]!, items[i]!]
      return { ...x, items }
    })
  const scored = d.items.filter((i) => i.dimension).length

  return (
    <AnimatePresence>
      {draft && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={d.id ? (readOnly ? "Ver questionário" : "Editar questionário") : "Novo questionário"}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-line-strong bg-surface"
          >
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">{d.id ? (readOnly ? d.name : "Editar questionário") : "Novo questionário"}</h2>
                {readOnly && <p className="text-xs text-subtle">Questionário padrão do sistema: só leitura. Duplique para editar uma cópia.</p>}
              </div>
              <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-tint/[0.05]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <form
              className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-5"
              onSubmit={(e) => {
                e.preventDefault()
                if (!readOnly) onSave(d)
              }}
            >
              {!readOnly && <QuestionnaireCopilot draft={d} onApply={(patch) => setD((x) => ({ ...x, ...patch }))} />}
              {!readOnly && (
                <>
                  <Field label="Nome" htmlFor="qname">
                    <Input id="qname" required maxLength={80} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Ex.: Pulso Entregas · rota e cobrança" />
                  </Field>
                  <Field label="Para que serve" htmlFor="qpurpose" hint="Aparece na biblioteca e no relatório como justificativa do instrumento.">
                    <Textarea id="qpurpose" maxLength={500} className="min-h-16" value={d.purpose} onChange={(e) => setD({ ...d, purpose: e.target.value })} />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Tipo" htmlFor="qkind" hint={QUESTIONNAIRE_KINDS.find((k) => k.id === d.kind)?.description}>
                      <Select id="qkind" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as QuestionnaireKind, anonymous: e.target.value === "nr1" ? true : d.anonymous })}>
                        {QUESTIONNAIRE_KINDS.map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium">Anonimato</span>
                      <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={d.anonymous}
                          aria-label="Questionário anônimo"
                          disabled={d.kind === "nr1" || d.used}
                          onClick={() => setD({ ...d, anonymous: !d.anonymous })}
                          className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-60", d.anonymous ? "bg-brand" : "bg-tint/[0.14]")}
                        >
                          <span className={cn("absolute top-1 size-4 rounded-full transition-all", d.anonymous ? "right-1 bg-brand-ink" : "left-1 bg-surface")} />
                        </button>
                        <div className="text-xs leading-snug text-muted">
                          <span className="font-medium text-fg">{d.anonymous ? "Anônimo" : "Identificado"}</span>
                          {d.kind === "nr1" ? " · o NR-1 é sempre anônimo." : d.used ? " · já usado em campanha: não muda mais." : d.anonymous ? " · ninguém é identificado; resultados só para grupos de 5+." : " · você verá quem respondeu e o quê; a pessoa é avisada antes."}
                        </div>
                      </div>
                    </div>
                  </div>
                  {!d.anonymous && (
                    <p className="rounded-xl border border-risk-mod/60 bg-risk-mod/10 px-3 py-2.5 text-xs leading-relaxed text-risk-mod-fg">
                      Identificado: cada pessoa recebe um link pessoal e aceita um aviso antes de responder. Use para pulsos de equipe e acompanhamento de ações, nunca para
                      temas de assédio ou medo de retaliação. Cadastre as pessoas em Pessoas antes de lançar a campanha.
                    </p>
                  )}
                </>
              )}

              <div className="flex items-end justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">Itens</h3>
                  <p className="text-xs text-subtle">
                    {d.items.length}/{MAX_ITEMS} · {scored} entram no score por dimensão · escala Nunca → Sempre
                  </p>
                </div>
                {!readOnly && (
                  <Button type="button" variant="secondary" size="sm" disabled={d.items.length >= MAX_ITEMS} onClick={addItem}>
                    Adicionar item
                  </Button>
                )}
              </div>

              <ol className="flex flex-col gap-2">
                {d.items.map((it, i) => (
                  <li key={it.id} className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-3 font-mono text-xs text-subtle">{String(i + 1).padStart(2, "0")}</span>
                      {readOnly ? (
                        <p className="flex-1 py-2 text-[15px] leading-snug">{it.text}</p>
                      ) : (
                        <Input aria-label={`Item ${i + 1}`} required minLength={8} maxLength={200} value={it.text} onChange={(e) => setItem(it.id, { text: e.target.value })} placeholder="Escreva como uma afirmação de frequência." />
                      )}
                      {!readOnly && (
                        <div className="flex shrink-0 items-center">
                          <IconBtn label="Subir" disabled={i === 0} onClick={() => move(it.id, -1)} d="M12 19V5M5 12l7-7 7 7" />
                          <IconBtn label="Descer" disabled={i === d.items.length - 1} onClick={() => move(it.id, 1)} d="M12 5v14M5 12l7 7 7-7" />
                          <IconBtn label="Remover" onClick={() => removeItem(it.id)} d="M6 6l12 12M18 6L6 18" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-7">
                      {readOnly ? (
                        <>
                          <span className="rounded-full bg-tint/[0.06] px-2 py-0.5 text-[11px] text-muted">{DIMENSIONS.find((x) => x.id === it.dimension)?.name ?? "Fora do score"}</span>
                          {it.dimension && <span className={cn("rounded-full px-2 py-0.5 text-[11px]", it.risk ? "bg-risk-crit/15 text-risk-crit-fg" : "bg-risk-low/60 text-risk-low-fg")}>{it.risk ? "Risco" : "Proteção"}</span>}
                        </>
                      ) : (
                        <>
                          <Select aria-label="Dimensão" className="h-9 w-56 text-sm" value={it.dimension ?? ""} onChange={(e) => setItem(it.id, { dimension: (e.target.value || null) as DimensionId | null })}>
                            <option value="">Fora do score</option>
                            {DIMENSIONS.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.name}
                              </option>
                            ))}
                          </Select>
                          {it.dimension && (
                            <div className="flex overflow-hidden rounded-lg border border-line text-xs">
                              {[
                                { v: true, l: "Risco", hint: "mais frequente = pior" },
                                { v: false, l: "Proteção", hint: "mais frequente = melhor" },
                              ].map((o) => (
                                <button key={o.l} type="button" title={o.hint} onClick={() => setItem(it.id, { risk: o.v })} className={cn("px-2.5 py-1.5", it.risk === o.v ? "bg-tint/[0.1] text-fg" : "text-muted hover:text-fg")}>
                                  {o.l}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
              {!d.items.length && <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-subtle">Nenhum item ainda. Adicione o primeiro ou duplique o NR-1 padrão para começar de uma base.</p>}

              {error && <p className="text-sm text-risk-crit-fg">{error}</p>}
              <div className="mt-auto flex gap-2 pt-4">
                {d.id && (
                  <Button type="button" variant="secondary" onClick={() => onDuplicate(d.id!)}>
                    Duplicar
                  </Button>
                )}
                {!readOnly && (
                  <Button type="submit" loading={saving} className="flex-1" disabled={!d.items.length}>
                    {d.id ? "Salvar (publica nova versão se os itens mudaram)" : "Criar questionário"}
                  </Button>
                )}
              </div>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
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

type Proposal = Awaited<ReturnType<Awaited<ReturnType<typeof client.agents.questionnaire.$post>>["json"]>>

/** Copiloto de questionários: o gestor descreve a dor, recebe itens e aceita um a um ou todos. */
function QuestionnaireCopilot({ draft, onApply }: { draft: QuestionnaireDraft; onApply: (patch: Partial<QuestionnaireDraft>) => void }) {
  const copilot = useCopilot()
  const toast = useToast()
  const [open, setOpen] = useState(!draft.id && !draft.items.length)
  const [pain, setPain] = useState("")
  const [instruction, setInstruction] = useState("")
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [taken, setTaken] = useState<Set<number>>(new Set())
  const ask = useMutation({
    mutationFn: async (refine: boolean) =>
      (
        await client.agents.questionnaire.$post({
          pain: pain || draft.purpose || draft.name,
          ...(refine && instruction ? { instruction } : {}),
          ...(draft.items.length ? { draft: { name: draft.name, kind: draft.kind, items: draft.items.map(({ text, dimension, risk }) => ({ text, dimension, risk })) } } : {}),
        })
      ).json(),
    onSuccess: (r) => {
      setProposal(r)
      setTaken(new Set())
      setInstruction("")
    },
    onError: (e) => toast(e.message, "error"),
  })
  const feedback = (accepted: boolean) => proposal && client.agents.feedback.$post({ runId: proposal.runId, accepted }).catch(() => {})

  if (!copilot.data?.available) return null
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start text-sm font-medium text-brand-fg hover:underline">
        ✦ Criar ou ajustar com o copiloto
      </button>
    )
  }
  const toItem = (it: Proposal["items"][number]): QuestionnaireItem => ({ id: newItemId(), text: it.text, type: "likert5", dimension: it.dimension, risk: it.risk })
  const takeAll = () => {
    if (!proposal) return
    // Ajuste sobre um rascunho existente: a proposta substitui a lista inteira.
    onApply({
      items: proposal.items.map(toItem),
      ...(draft.name ? {} : { name: proposal.suggestedName }),
      ...(draft.purpose ? {} : { purpose: proposal.objective }),
      ...(draft.id ? {} : { kind: proposal.suggestedKind, anonymous: proposal.suggestedKind === "nr1" ? true : proposal.suggestAnonymous }),
    })
    feedback(true)
    setProposal(null)
    toast("Itens do copiloto aplicados ao rascunho")
  }

  return (
    <CopilotShell title="Copiloto de questionários">
      <Textarea
        aria-label="Descreva a situação"
        className="min-h-20 bg-surface"
        value={pain}
        maxLength={2000}
        onChange={(e) => setPain(e.target.value)}
        placeholder="Ex.: A equipe de entregas reclama de rota mal planejada e de cobrança por WhatsApp fora do horário. Quero medir antes de mudar a escala."
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" loading={ask.isPending && !ask.variables} disabled={(pain.trim().length < 10 && !draft.purpose) || ask.isPending} onClick={() => ask.mutate(false)}>
          {draft.items.length ? "Revisar o rascunho" : "Propor questionário"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Fechar
        </Button>
      </div>
      {proposal && (
        <div className="flex flex-col gap-3">
          <CopilotMessage>
            {proposal.message}
            <span className="mt-2 block text-xs text-muted">
              <strong className="text-fg">Objetivo:</strong> {proposal.objective} · <strong className="text-fg">Público:</strong> {proposal.audience}
            </span>
            <span className="mt-1 block text-xs text-muted">
              <strong className="text-fg">{proposal.suggestAnonymous ? "Sugiro anônimo" : "Pode ser identificado"}:</strong> {proposal.anonymityReason}
            </span>
            <span className="mt-1 block text-xs text-muted">
              <strong className="text-fg">O questionário não mede bem:</strong> {proposal.notMeasurable}
            </span>
          </CopilotMessage>
          {proposal.warnings.map((w) => (
            <p key={w} className="text-xs text-risk-mod-fg">
              {w}
            </p>
          ))}
          <ol className="flex flex-col gap-1.5">
            {proposal.items.map((it, i) => (
              <li key={i} className={cn("flex items-start gap-2 rounded-xl border bg-surface/70 p-2.5 text-sm", it.flags.length ? "border-risk-mod/60" : "border-line", taken.has(i) && "opacity-50")}>
                <span className="mt-0.5 font-mono text-[11px] text-subtle">{String(i + 1).padStart(2, "0")}</span>
                <div className="flex-1">
                  <p className="leading-snug">{it.text}</p>
                  <p className="mt-1 text-[11px] text-subtle">
                    {DIMENSIONS.find((x) => x.id === it.dimension)?.name ?? "Fora do score"} · {it.risk ? "risco" : "proteção"}
                    {it.engine === "jev" && " · dimensão conferida pelo Jev"} · {it.rationale}
                  </p>
                  {it.flags.map((f) => (
                    <p key={f} className="mt-1 text-[11px] text-risk-mod-fg">
                      {f}
                    </p>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={taken.has(i)}
                  onClick={() => {
                    onApply({ items: [...draft.items, toItem(it)] })
                    setTaken((x) => new Set(x).add(i))
                  }}
                  className="rounded-lg border border-line px-2 py-1 text-xs text-brand-fg hover:border-brand/50 disabled:opacity-40"
                >
                  {taken.has(i) ? "Adicionado" : "Adicionar"}
                </button>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={takeAll}>
              {draft.items.length ? "Substituir o rascunho por esta versão" : "Usar todos os itens"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                feedback(false)
                setProposal(null)
              }}
            >
              Descartar
            </Button>
          </div>
          <div className="flex gap-2">
            <Input aria-label="Pedir ajuste" className="h-9 bg-surface text-sm" value={instruction} maxLength={500} onChange={(e) => setInstruction(e.target.value)} placeholder="Peça um ajuste: “mais curto”, “adicione 2 sobre pausas”…" />
            <Button type="button" size="sm" variant="secondary" disabled={!instruction.trim()} loading={ask.isPending && ask.variables === true} onClick={() => ask.mutate(true)}>
              Ajustar
            </Button>
          </div>
        </div>
      )}
    </CopilotShell>
  )
}
