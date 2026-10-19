"use client"

import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState } from "react"
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives"
import { DIMENSIONS, type DimensionId } from "@/lib/methodology"
import { MAX_ITEMS, QUESTIONNAIRE_KINDS, newItemId, type QuestionnaireItem, type QuestionnaireKind } from "@/lib/questionnaire"
import { cn } from "@/lib/utils"

export type QuestionnaireDraft = {
  id?: string
  system?: boolean
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
                      <Select id="qkind" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as QuestionnaireKind })}>
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
                        <span role="switch" aria-checked="true" aria-label="Questionário anônimo" aria-disabled="true" className="relative h-6 w-10 rounded-full bg-brand opacity-80">
                          <span className="absolute right-1 top-1 size-4 rounded-full bg-brand-ink" />
                        </span>
                        <div className="text-xs leading-snug text-muted">
                          <span className="font-medium text-fg">Anônimo</span>
                          {d.kind === "nr1" ? " · o NR-1 é sempre anônimo." : " · o modo identificado chega na próxima versão."}
                        </div>
                      </div>
                    </div>
                  </div>
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
