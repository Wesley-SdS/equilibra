"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import { PageHeader } from "@/components/app/page-header"
import { EMPTY_DRAFT, QuestionnaireDrawer, type QuestionnaireDraft } from "@/components/app/questionnaire-editor"
import { LikertBar, LikertLegend } from "@/components/app/trend"
import { Button, ButtonLink, Card, EmptyState, Field, Input, Spinner } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { JevBadge } from "@/components/app/jev-badge"
import { client } from "@/lib/client"
import { useCan } from "@/lib/hooks"
import { DIMENSIONS, K_ANONYMITY, QUESTIONS, SCALE } from "@/lib/methodology"
import { QUESTIONNAIRE_KINDS, estimatedMinutes, kindLabel, type QuestionnaireKind } from "@/lib/questionnaire"
import { cn, formatDate } from "@/lib/utils"

const MAX = 10

const KIND_CLS: Record<string, string> = { nr1: "bg-brand/15 text-brand-fg", clima: "bg-risk-mod/50 text-risk-mod-fg", pulso: "bg-tint/[0.08] text-fg", livre: "bg-tint/[0.06] text-muted" }

/** Biblioteca: o NR-1 padrão, os importados e os criados pela empresa, com versão atual e uso. */
function Library() {
  const can = useCan()
  const qc = useQueryClient()
  const toast = useToast()
  const router = useRouter()
  const params = useSearchParams()
  const [editing, setEditing] = useState<QuestionnaireDraft | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [filter, setFilter] = useState<QuestionnaireKind | "all">("all")

  const list = useQuery({ queryKey: ["questionnaires"], queryFn: async () => (await client.questionnaires.list.$get()).json() })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["questionnaires"] })
    qc.invalidateQueries({ queryKey: ["campaigns"] })
  }

  // ?novo=1 abre a gaveta de criação (ex.: vindo da tela de nova campanha).
  useEffect(() => {
    if (params.get("novo") === "1" && can.edit) setEditing({ ...EMPTY_DRAFT })
  }, [params, can.edit])

  const open = useMutation({
    mutationFn: async (id: string) => (await client.questionnaires.get.$get({ id })).json(),
    onSuccess: (q) => setEditing({ id: q.id, system: q.system, name: q.name, purpose: q.purpose, kind: q.kind, anonymous: q.anonymous, items: q.current?.items ?? [] }),
    onError: (e) => toast(e.message, "error"),
  })
  const save = useMutation({
    mutationFn: async (d: QuestionnaireDraft) => {
      const body = { name: d.name, purpose: d.purpose, kind: d.kind, anonymous: d.anonymous, items: d.items.map(({ id, text, dimension, risk }) => ({ id, text, dimension, risk, type: "likert5" as const })) }
      if (d.id) return (await client.questionnaires.update.$post({ id: d.id, ...body })).json()
      return (await client.questionnaires.create.$post(body)).json()
    },
    onSuccess: (r, d) => {
      setEditing(null)
      refresh()
      toast(d.id ? ("version" in r && r.version ? `Questionário salvo · versão ${r.version}` : "Questionário salvo") : "Questionário criado")
    },
  })
  const duplicate = useMutation({
    mutationFn: async (id: string) => (await client.questionnaires.duplicate.$post({ id })).json(),
    onSuccess: (q) => {
      setEditing(null)
      refresh()
      toast("Cópia criada. Edite o nome e os itens.")
      open.mutate(q.id)
    },
    onError: (e) => toast(e.message, "error"),
  })
  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: "active" | "archived" }) => (await client.questionnaires.setStatus.$post(v)).json(),
    onSuccess: refresh,
    onError: (e) => toast(e.message, "error"),
  })

  const rows = (list.data ?? []).filter((r) => (showArchived || r.status !== "archived") && (filter === "all" || r.kind === filter))
  const counts = (k: string) => (list.data ?? []).filter((r) => r.status !== "archived" && (k === "all" || r.kind === k)).length

  return (
    <>
      <PageHeader
        title="Questionários"
        description="Todos os questionários da empresa: o NR-1 padrão, os importados e os que você criou. Cada campanha aplica uma versão de um deles; editar nunca altera campanhas já lançadas."
        actions={
          can.edit ? (
            <>
              <ButtonLink href="/app/questionario/importar" variant="secondary">
                Importar planilha ou PDF
              </ButtonLink>
              <Button onClick={() => setEditing({ ...EMPTY_DRAFT })}>Novo questionário</Button>
            </>
          ) : undefined
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {[{ id: "all" as const, label: "Todos" }, ...QUESTIONNAIRE_KINDS].map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setFilter(k.id)}
            className={cn("rounded-lg border px-2.5 py-1 text-xs transition-colors", filter === k.id ? "border-brand/40 text-fg" : "border-line text-muted hover:text-fg")}
          >
            {k.label} · {counts(k.id)}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Mostrar arquivados
        </label>
      </div>

      {list.isLoading ? (
        <div className="grid h-40 place-items-center text-muted">
          <Spinner />
        </div>
      ) : !rows.length ? (
        <EmptyState title="Nenhum questionário neste filtro" text="Crie um novo ou duplique o NR-1 padrão para começar de uma base." />
      ) : (
        <div className="grid gap-2">
          {rows.map((r) => (
            <Card key={r.id} className={cn("grid items-center gap-3 xl:grid-cols-[1.6fr_auto_auto_1fr_auto]", r.status === "archived" && "opacity-60")}>
              <div className="min-w-0">
                <button type="button" onClick={() => open.mutate(r.id)} className="text-left text-[15px] font-medium leading-snug hover:text-brand-fg">
                  {r.name} <span className="font-mono text-xs text-subtle">v{r.version ?? 1}</span>
                </button>
                <p className="mt-0.5 text-xs text-subtle">
                  {r.purpose || (r.companyId === null ? "Padrão do sistema" : "Criado pela empresa")} · {r.itemCount ?? 0} itens · ~{estimatedMinutes(r.itemCount ?? 0)} min
                </p>
              </div>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", KIND_CLS[r.kind] ?? KIND_CLS.livre)}>{kindLabel(r.kind)}</span>
              <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs text-brand-fg">🔒 Anônimo</span>
              <span className="text-xs text-muted">
                {r.lastCampaignName ? (
                  <>
                    {r.lastCampaignName}
                    {r.lastCampaignStartsAt && ` · ${formatDate(r.lastCampaignStartsAt)}`}
                    {r.campaignCount > 1 && ` · ${r.campaignCount} campanhas`}
                  </>
                ) : (
                  "Nunca aplicado"
                )}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {can.edit && r.status === "active" && (
                  <ButtonLink href={`/app/campanhas?nova=1&questionario=${r.id}`} size="sm">
                    Lançar campanha
                  </ButtonLink>
                )}
                <Button variant="secondary" size="sm" onClick={() => open.mutate(r.id)}>
                  {can.edit && r.companyId !== null ? "Editar" : "Ver"}
                </Button>
                {can.edit && (
                  <Button variant="ghost" size="sm" loading={duplicate.isPending && duplicate.variables === r.id} onClick={() => duplicate.mutate(r.id)}>
                    Duplicar
                  </Button>
                )}
                {can.edit && r.companyId !== null && (
                  <Button variant="ghost" size="sm" onClick={() => setStatus.mutate({ id: r.id, status: r.status === "archived" ? "active" : "archived" })}>
                    {r.status === "archived" ? "Restaurar" : "Arquivar"}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <QuestionnaireDrawer
        draft={editing}
        saving={save.isPending}
        error={save.error?.message}
        onClose={() => {
          setEditing(null)
          if (params.get("novo")) router.replace("/app/questionario")
        }}
        onSave={(d) => save.mutate(d)}
        onDuplicate={(id) => duplicate.mutate(id)}
      />
    </>
  )
}

export default function QuestionnairesPage() {
  return (
    <Suspense>
      <Library />
      <CompanyQuestions />
    </Suspense>
  )
}

function CompanyQuestions() {
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
      <div className="mb-4 mt-10 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Perguntas da empresa</h2>
          <p className="text-sm text-muted">Até 10 perguntas próprias, anexadas ao fim de toda campanha e relatadas à parte (não entram no score).</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setPreview((v) => !v)}>
          {preview ? "Fechar pré-visualização" : "Pré-visualizar"}
        </Button>
      </div>

      <AnimatePresence>
        {preview && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Preview questions={active.map((q) => q.text)} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-4 [&>*]:min-w-0">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">Lista</h3>
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

      </div>

      <Card className="mt-4">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Resultados das perguntas da empresa</h3>
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
