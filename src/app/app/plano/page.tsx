"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { useSearchParams } from "next/navigation"
import { Suspense, useEffect, useMemo, useState } from "react"
import { CopilotMessage, CopilotShell, useCopilot } from "@/components/app/copilot"
import { JevBadge } from "@/components/app/jev-badge"
import { PageHeader } from "@/components/app/page-header"
import { Button, Field, Input, Select, Spinner, Textarea } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { client } from "@/lib/client"
import { stageOf } from "@/lib/deadline"
import { useCan } from "@/lib/hooks"
import { DIMENSIONS, dimensionMeta, riskLevel, type DimensionId } from "@/lib/methodology"
import { cn, formatDate } from "@/lib/utils"

type Status = "todo" | "doing" | "done"
const COLUMNS: { id: Status; label: string; dot: string }[] = [
  { id: "todo", label: "A fazer", dot: "bg-subtle" },
  { id: "doing", label: "Em andamento", dot: "bg-risk-mod-fg" },
  { id: "done", label: "Concluída", dot: "bg-brand" },
]

type Step = { text: string; done: boolean }
type Draft = {
  id?: string
  dimension: DimensionId
  what: string
  why: string
  sectorId: string | null
  who: string
  due: string
  how: string
  cost: string
  status: Status
  employeeIds: string[]
  steps: Step[]
  evidence: string
  fromCopilot?: boolean
}

const EMPTY: Draft = { dimension: "demandas", what: "", why: "", sectorId: null, who: "", due: "", how: "", cost: "", status: "todo", employeeIds: [], steps: [], evidence: "" }

type Action = Awaited<ReturnType<Awaited<ReturnType<typeof client.actions.list.$get>>["json"]>>[number]

const LEVEL_PILL: Record<string, string> = {
  baixo: "bg-risk-low/60 text-risk-low-fg",
  moderado: "bg-risk-mod/50 text-risk-mod-fg",
  alto: "bg-risk-high/15 text-risk-high-fg",
  critico: "bg-risk-crit/15 text-risk-crit-fg",
}

const initials = (name: string) =>
  name
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "—"

function isoIn(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

/** Barra de tempo: quanto do prazo já passou desde a criação. */
function timeUsed(a: Action) {
  if (!a.due) return null
  const start = new Date(a.createdAt).getTime()
  const end = Date.parse(`${a.due}T23:59:59`)
  if (end <= start) return 1
  return Math.min(1, Math.max(0, (Date.now() - start) / (end - start)))
}

function ActionCard({ a, sectorName, canEdit, onOpen, onMove, onToggleStep }: { a: Action; sectorName: (id: string | null) => string | undefined; canEdit: boolean; onOpen: () => void; onMove: (s: Status) => void; onToggleStep: (i: number) => void }) {
  const stage = stageOf(a)
  const late = stage === "overdue"
  const meta = dimensionMeta(a.dimension)
  const level = a.riskBefore !== null ? riskLevel(a.riskBefore) : null
  const stepsDone = a.steps.filter((s) => s.done).length
  const progress = a.status === "done" ? 1 : a.steps.length ? stepsDone / a.steps.length : a.status === "doing" ? 0.3 : 0
  const used = timeUsed(a)
  const improved = a.riskBefore !== null && a.riskAfter !== null ? a.riskAfter - a.riskBefore : null
  return (
    <motion.article
      layout
      layoutId={a.id}
      draggable={canEdit}
      onDragStart={(e) => (e as unknown as React.DragEvent).dataTransfer?.setData("text/action", a.id)}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border bg-surface-2 p-4",
        late && a.status !== "done" ? "border-risk-crit/50" : a.status === "done" && improved !== null && improved < 0 ? "border-brand/30" : "border-line",
        canEdit && "cursor-grab active:cursor-grabbing"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", level ? LEVEL_PILL[level] : "bg-tint/[0.06] text-muted")}>
          {meta?.short}
          {a.riskBefore !== null && (
            <span className="ml-1 font-mono">
              · {a.riskBefore}
              {a.riskAfter !== null && ` → ${a.riskAfter}`}
            </span>
          )}
        </span>
        <span className="flex flex-wrap gap-1">
          {late && a.status !== "done" && <span className="rounded-full bg-risk-crit/15 px-2 py-0.5 text-[11px] font-medium text-risk-crit-fg">Atrasada</span>}
          {stage === "soon" && <span className="rounded-full bg-risk-mod/50 px-2 py-0.5 text-[11px] text-risk-mod-fg">Vence em breve</span>}
          {a.status === "done" && improved !== null && improved < -2 && <span className="rounded-full bg-risk-low/60 px-2 py-0.5 text-[11px] text-risk-low-fg">Efeito medido</span>}
          {a.decision?.engine === "copiloto" && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] text-brand-fg">Sugerida pelo copiloto</span>}
        </span>
      </div>
      <button type="button" onClick={onOpen} className="text-left text-[15px] font-medium leading-snug hover:text-brand-fg">
        {a.what}
      </button>
      {a.why && <p className="text-xs leading-relaxed text-subtle">{a.why}</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="grid size-5 place-items-center rounded-full bg-tint/[0.1] text-[9px] font-semibold">{a.who ? initials(a.who) : "—"}</span>
          {a.who || "Sem responsável"}
        </span>
        <span>{a.people.length ? `${a.people.length} pessoa(s)` : (sectorName(a.sectorId) ?? "Toda a empresa")}</span>
        {a.due && <span className={cn(late && a.status !== "done" && "font-medium text-risk-crit-fg")}>Prazo {formatDate(a.due)}</span>}
      </div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-tint/[0.08]" title={`${Math.round(progress * 100)}% concluído`}>
          <div className={cn("h-full rounded-full", a.status === "done" ? "bg-brand" : late ? "bg-risk-crit" : "bg-risk-mod-fg")} style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="font-mono text-[11px] text-subtle">{a.steps.length ? `${stepsDone}/${a.steps.length} etapas` : a.status === "done" ? "feita" : "sem etapas"}</span>
      </div>
      {used !== null && a.status !== "done" && (
        <div className="h-0.5 overflow-hidden rounded-full bg-tint/[0.05]" title={`${Math.round(used * 100)}% do prazo já passou`}>
          <div className="h-full bg-tint/30" style={{ width: `${used * 100}%` }} />
        </div>
      )}
      {a.steps.length > 0 && a.status !== "done" && (
        <ul className="flex flex-col gap-1 text-xs">
          {a.steps.map((s, i) => (
            <li key={i}>
              <label className={cn("flex items-center gap-2", s.done && "text-subtle line-through")}>
                <input type="checkbox" disabled={!canEdit} checked={s.done} onChange={() => onToggleStep(i)} />
                {s.text}
              </label>
            </li>
          ))}
        </ul>
      )}
      {a.status === "done" && a.evidence && <p className="text-[11px] text-subtle">Evidência: {a.evidence}</p>}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        {a.decision?.engine === "jev" ? <JevBadge decision={a.decision} label="Escolhida pelo Jev" /> : <span />}
        {canEdit && (
          <div className="flex gap-1">
            {COLUMNS.filter((c) => c.id !== a.status).map((c) => (
              <button key={c.id} type="button" onClick={() => onMove(c.id)} className="rounded-lg border border-line px-2 py-1 text-[11px] text-muted transition-colors hover:border-line-strong hover:text-fg">
                → {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.article>
  )
}

type CopilotResult = Awaited<ReturnType<Awaited<ReturnType<typeof client.agents.plan.$post>>["json"]>>

function PlanCopilot({ initialQuestion, onAdd, onEdit, sectorName }: { initialQuestion: string; onAdd: (d: Draft) => void; onEdit: (d: Draft) => void; sectorName: (id: string | null) => string | undefined }) {
  const toast = useToast()
  const [question, setQuestion] = useState(initialQuestion)
  const [asked, setAsked] = useState<string | null>(null)
  const [result, setResult] = useState<CopilotResult | null>(null)
  const ask = useMutation({
    mutationFn: async (q: string) => (await client.agents.plan.$post({ question: q })).json(),
    onSuccess: (r, q) => {
      setResult(r)
      setAsked(q)
      setQuestion("")
    },
    onError: (e) => toast(e.message, "error"),
  })
  useEffect(() => {
    if (initialQuestion) ask.mutate(initialQuestion)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pergunta vinda de outra tela: dispara uma vez
  }, [])
  const toDraft = (a: CopilotResult["actions"][number]): Draft => ({
    ...EMPTY,
    dimension: a.dimension,
    what: a.what,
    why: a.why,
    sectorId: a.sectorKey,
    who: a.who,
    due: isoIn(a.dueInDays),
    how: a.how,
    cost: a.cost,
    steps: a.steps.map((text) => ({ text, done: false })),
    fromCopilot: true,
  })
  return (
    <CopilotShell title="Copiloto do plano de ação" footer="Lê só os agregados que você já vê (grupos com 5+ respostas). Propõe; você decide e salva. Não sugere medidas contra pessoas.">
      {asked && <CopilotMessage from="me">{asked}</CopilotMessage>}
      {ask.isPending && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Lendo os dados…
        </div>
      )}
      {result && (
        <div className="flex flex-col gap-2.5">
          <CopilotMessage>
            {result.answer}
            {result.citedNumbers.length > 0 && (
              <span className="mt-2 flex flex-wrap gap-1">
                {result.citedNumbers.map((n) => (
                  <span key={n} className="rounded-md bg-tint/[0.06] px-1.5 py-0.5 font-mono text-[11px] text-muted">
                    {n}
                  </span>
                ))}
              </span>
            )}
          </CopilotMessage>
          {result.warnings.map((w) => (
            <p key={w} className="text-xs text-risk-mod-fg">
              {w}
            </p>
          ))}
          {result.actions.map((a, i) => (
            <div key={i} className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface/80 p-3 text-[13px]">
              <span className="font-medium">{a.what}</span>
              <span className="text-xs text-muted">
                <strong className="text-fg">Por quê</strong> {a.why}
              </span>
              <span className="text-xs text-muted">
                <strong className="text-fg">Onde</strong> {sectorName(a.sectorKey) ?? "Toda a empresa"} · <strong className="text-fg">Quem</strong> {a.who} · <strong className="text-fg">Quando</strong> {a.dueInDays} dias
              </span>
              <span className="text-xs text-muted">
                <strong className="text-fg">Como</strong> {a.how} · <strong className="text-fg">Quanto</strong> {a.cost}
              </span>
              <div className="mt-1 flex gap-1.5">
                <Button size="sm" onClick={() => onAdd(toDraft(a))}>
                  Adicionar ao plano
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onEdit(toDraft(a))}>
                  Editar antes
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (question.trim().length >= 5) ask.mutate(question.trim())
        }}
      >
        <Input aria-label="Pergunta ao copiloto" className="h-10 bg-surface text-sm" value={question} maxLength={800} onChange={(e) => setQuestion(e.target.value)} placeholder="Ex.: Por que Liderança piorou nas Entregas? O que fazer sem orçamento?" />
        <Button type="submit" size="sm" className="h-10" loading={ask.isPending} disabled={question.trim().length < 5}>
          Perguntar
        </Button>
      </form>
    </CopilotShell>
  )
}

function PlanContent() {
  const can = useCan()
  const params = useSearchParams()
  const qc = useQueryClient()
  const toast = useToast()
  const copilot = useCopilot()
  const [editing, setEditing] = useState<Draft | null>(null)
  const [view, setView] = useState<"board" | "dimension" | "sector">("board")
  const [who, setWho] = useState("")
  const [due, setDue] = useState<"" | "late" | "soon">("")
  const [showCopilot, setShowCopilot] = useState(Boolean(params.get("copiloto")))

  useEffect(() => {
    if (params.get("nova") !== "1") return
    const dim = DIMENSIONS.find((d) => d.id === params.get("dimensao"))
    const people = (params.get("pessoas") ?? "").split(",").filter(Boolean)
    const origin = params.get("origem")
    setEditing({
      ...EMPTY,
      dimension: dim?.id ?? EMPTY.dimension,
      sectorId: params.get("setor") || null,
      employeeIds: people,
      why: params.get("por") ?? (origin ? `Resultado da campanha identificada “${origin}”.` : ""),
    })
  }, [params])

  const actions = useQuery({ queryKey: ["actions"], queryFn: async () => (await client.actions.list.$get()).json() })
  const sectors = useQuery({ queryKey: ["sectors"], queryFn: async () => (await client.sectors.list.$get()).json() })
  const people = useQuery({ queryKey: ["employees"], queryFn: async () => (await client.employees.list.$get()).json() })
  const sectorName = (id: string | null) => sectors.data?.find((s) => s.id === id)?.name
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["actions"] })
    qc.invalidateQueries({ queryKey: ["deadlines"] })
  }

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const { id, ...data } = d
      if (id) return (await client.actions.update.$post({ id, ...data })).json()
      return (await client.actions.create.$post(data)).json()
    },
    onSuccess: (_r, d) => {
      setEditing(null)
      refresh()
      toast(d.id ? "Ação atualizada" : "Ação adicionada ao plano")
    },
    onError: (e) => toast(e.message, "error"),
  })
  const patch = useMutation({
    mutationFn: async (v: { id: string; status?: Status; steps?: Step[] }) => (await client.actions.update.$post(v)).json(),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["actions"] })
      const prev = qc.getQueryData(["actions"])
      qc.setQueryData(["actions"], (old: Action[] | undefined) => old?.map((a) => (a.id === v.id ? { ...a, ...v } : a)))
      return { prev }
    },
    onError: (_e, _v, ctx) => qc.setQueryData(["actions"], ctx?.prev),
    onSettled: refresh,
  })
  const remove = useMutation({
    mutationFn: async (id: string) => (await client.actions.remove.$post({ id })).json(),
    onSuccess: () => {
      setEditing(null)
      refresh()
    },
  })

  const all = useMemo(() => actions.data ?? [], [actions.data])
  const owners = [...new Set(all.map((a) => a.who).filter(Boolean))]
  const filtered = all.filter((a) => (!who || a.who === who) && (!due || (due === "late" ? stageOf(a) === "overdue" : stageOf(a) === "soon")))
  // Atrasadas primeiro, depois por prazo.
  const ordered = [...filtered].sort((x, y) => Number(stageOf(y) === "overdue") - Number(stageOf(x) === "overdue") || (x.due || "9999").localeCompare(y.due || "9999"))
  const done = all.filter((a) => a.status === "done").length
  const late = all.filter((a) => stageOf(a) === "overdue").length
  const soon = all.filter((a) => stageOf(a) === "soon").length
  const open = (a: Action) =>
    setEditing({ id: a.id, dimension: a.dimension as DimensionId, what: a.what, why: a.why, sectorId: a.sectorId, who: a.who, due: a.due, how: a.how, cost: a.cost, status: a.status as Status, employeeIds: a.employeeIds, steps: a.steps, evidence: a.evidence })
  const toggleStep = (a: Action, i: number) => patch.mutate({ id: a.id, steps: a.steps.map((s, k) => (k === i ? { ...s, done: !s.done } : s)) })
  const card = (a: Action) => <ActionCard key={a.id} a={a} sectorName={sectorName} canEdit={can.edit} onOpen={() => open(a)} onMove={(s) => patch.mutate({ id: a.id, status: s })} onToggleStep={(i) => toggleStep(a, i)} />

  const groups =
    view === "dimension"
      ? DIMENSIONS.map((d) => ({ key: d.id, label: d.name, items: ordered.filter((a) => a.dimension === d.id) })).filter((g) => g.items.length)
      : [{ key: "all", label: "Toda a empresa", items: ordered.filter((a) => !a.sectorId) }, ...(sectors.data ?? []).map((s) => ({ key: s.id, label: s.name, items: ordered.filter((a) => a.sectorId === s.id) }))].filter((g) => g.items.length)

  return (
    <>
      <PageHeader
        title="Plano de ação"
        description="Medidas 5W2H para cada risco. Cada card mostra o risco que motivou a ação, quem cuida, o prazo e o quanto já andou."
        actions={
          <>
            {copilot.data?.available && can.edit && (
              <Button variant="secondary" onClick={() => setShowCopilot((v) => !v)}>
                ✦ {showCopilot ? "Fechar copiloto" : "Copiloto"}
              </Button>
            )}
            {can.edit && <Button onClick={() => setEditing({ ...EMPTY })}>Nova ação</Button>}
          </>
        }
      />

      <div className={cn("grid gap-5", showCopilot && "xl:grid-cols-[minmax(0,1fr)_380px]")}>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="h-2 min-w-40 flex-1 overflow-hidden rounded-full bg-tint/[0.06]">
              <motion.div className="h-full rounded-full bg-brand" animate={{ width: all.length ? `${(done / all.length) * 100}%` : "0%" }} transition={{ duration: 0.6 }} />
            </div>
            <span className="font-mono text-sm text-muted">
              {done}/{all.length} concluídas
            </span>
            {late > 0 && <span className="rounded-full bg-risk-crit/15 px-2.5 py-0.5 text-xs text-risk-crit-fg">{late} atrasadas</span>}
            {soon > 0 && <span className="rounded-full bg-risk-mod/50 px-2.5 py-0.5 text-xs text-risk-mod-fg">{soon} vencem em breve</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-xl border border-line-strong text-sm">
              {(
                [
                  ["board", "Quadro"],
                  ["dimension", "Por dimensão"],
                  ["sector", "Por setor"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setView(id)} className={cn("px-3 py-1.5", view === id ? "bg-tint/[0.08] text-fg" : "text-muted hover:text-fg")}>
                  {label}
                </button>
              ))}
            </div>
            <Select aria-label="Responsável" className="h-9 w-48 text-sm" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Responsável: todos</option>
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
            <Select aria-label="Prazo" className="h-9 w-44 text-sm" value={due} onChange={(e) => setDue(e.target.value as typeof due)}>
              <option value="">Prazo: todos</option>
              <option value="late">Atrasadas</option>
              <option value="soon">Vencem em breve</option>
            </Select>
          </div>

          {actions.isLoading ? (
            <div className="grid h-40 place-items-center text-muted">
              <Spinner />
            </div>
          ) : view === "board" ? (
            <div className="grid gap-4 lg:grid-cols-3">
              {COLUMNS.map((col) => {
                const items = ordered.filter((a) => a.status === col.id)
                return (
                  <section
                    key={col.id}
                    aria-label={col.label}
                    onDragOver={(e) => can.edit && e.preventDefault()}
                    onDrop={(e) => {
                      const id = e.dataTransfer.getData("text/action")
                      const a = all.find((x) => x.id === id)
                      if (a && a.status !== col.id) patch.mutate({ id, status: col.id })
                    }}
                    className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface/50 p-3"
                  >
                    <header className="flex items-center justify-between px-2 pt-1">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span className={cn("size-2 rounded-full", col.dot)} />
                        {col.label}
                      </span>
                      <span className="font-mono text-xs text-subtle">{items.length}</span>
                    </header>
                    <AnimatePresence initial={false}>{items.map(card)}</AnimatePresence>
                    {!items.length && <p className="px-2 py-6 text-center text-sm text-subtle">Arraste uma ação para cá.</p>}
                  </section>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {groups.map((g) => (
                <section key={g.key}>
                  <h2 className="mb-2 text-sm font-semibold">
                    {g.label} <span className="font-mono text-xs text-subtle">· {g.items.length}</span>
                  </h2>
                  <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{g.items.map(card)}</div>
                </section>
              ))}
              {!groups.length && <p className="text-sm text-muted">Nenhuma ação com esses filtros.</p>}
            </div>
          )}
        </div>
        {showCopilot && copilot.data?.available && (
          <aside className="xl:sticky xl:top-6 xl:self-start">
            <PlanCopilot initialQuestion={params.get("copiloto") ?? ""} sectorName={sectorName} onEdit={(d) => setEditing(d)} onAdd={(d) => save.mutate(d)} />
          </aside>
        )}
      </div>

      <ActionDrawer
        draft={editing}
        sectors={sectors.data ?? []}
        people={(people.data ?? []).filter((p) => p.active)}
        saving={save.isPending}
        error={save.error?.message}
        onClose={() => setEditing(null)}
        onSave={(d) => save.mutate(d)}
        onDelete={(id) => remove.mutate(id)}
      />
    </>
  )
}

export default function PlanPage() {
  return (
    <Suspense>
      <PlanContent />
    </Suspense>
  )
}

function ActionDrawer({
  draft,
  sectors,
  people,
  saving,
  error,
  onClose,
  onSave,
  onDelete,
}: {
  draft: Draft | null
  sectors: { id: string; name: string }[]
  people: { id: string; name: string; sectorName: string | null }[]
  saving: boolean
  error?: string
  onClose: () => void
  onSave: (d: Draft) => void
  onDelete: (id: string) => void
}) {
  const [d, setD] = useState<Draft>(EMPTY)
  const [newStep, setNewStep] = useState("")
  useEffect(() => {
    if (draft) setD(draft)
  }, [draft])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    if (draft) window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [draft, onClose])
  const up = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setD((x) => ({ ...x, [k]: k === "sectorId" && !e.target.value ? null : e.target.value }))
  const addStep = () => {
    if (!newStep.trim()) return
    setD((x) => ({ ...x, steps: [...x.steps, { text: newStep.trim(), done: false }] }))
    setNewStep("")
  }

  return (
    <AnimatePresence>
      {draft && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={draft.id ? "Editar ação" : "Nova ação"}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-line-strong bg-surface"
          >
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="text-lg font-semibold">{draft.id ? "Editar ação" : "Nova ação"}</h2>
              <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-tint/[0.05]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <form
              className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5"
              onSubmit={(e) => {
                e.preventDefault()
                onSave(d)
              }}
            >
              {d.fromCopilot && <p className="rounded-xl bg-brand/10 px-3 py-2 text-xs text-brand-fg">Proposta do copiloto: revise antes de salvar.</p>}
              <Field label="Dimensão de risco" htmlFor="adim">
                <Select id="adim" value={d.dimension} onChange={up("dimension")}>
                  {DIMENSIONS.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="O quê (ação)" htmlFor="awhat">
                <Textarea id="awhat" required className="min-h-20" value={d.what} onChange={up("what")} />
              </Field>
              <Field label="Por quê" htmlFor="awhy">
                <Input id="awhy" value={d.why} onChange={up("why")} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Onde (setor)" htmlFor="asector">
                  <Select id="asector" value={d.sectorId ?? ""} onChange={up("sectorId")}>
                    <option value="">Toda a empresa</option>
                    {sectors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Quem (responsável)" htmlFor="awho">
                  <Input id="awho" value={d.who} onChange={up("who")} />
                </Field>
                <Field label="Quando (prazo)" htmlFor="adue">
                  <Input id="adue" type="date" value={d.due} onChange={up("due")} />
                </Field>
                <Field label="Quanto (custo)" htmlFor="acost">
                  <Input id="acost" value={d.cost} onChange={up("cost")} placeholder="Ex.: R$ 1.500" />
                </Field>
              </div>
              <Field label="Como" htmlFor="ahow">
                <Textarea id="ahow" value={d.how} onChange={up("how")} />
              </Field>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Etapas</span>
                {d.steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={s.done} onChange={() => setD((x) => ({ ...x, steps: x.steps.map((y, k) => (k === i ? { ...y, done: !y.done } : y)) }))} />
                    <span className={cn("flex-1", s.done && "text-subtle line-through")}>{s.text}</span>
                    <button type="button" className="text-xs text-subtle hover:text-fg" onClick={() => setD((x) => ({ ...x, steps: x.steps.filter((_, k) => k !== i) }))}>
                      remover
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    aria-label="Nova etapa"
                    className="h-9 text-sm"
                    value={newStep}
                    maxLength={200}
                    placeholder="Adicionar etapa e Enter"
                    onChange={(e) => setNewStep(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        addStep()
                      }
                    }}
                  />
                  <Button type="button" size="sm" variant="secondary" className="h-9" onClick={addStep}>
                    Adicionar
                  </Button>
                </div>
              </div>
              {people.length > 0 && (
                <details className="text-sm" open={d.employeeIds.length > 0}>
                  <summary className="cursor-pointer font-medium">Para quem ({d.employeeIds.length} pessoas)</summary>
                  <p className="mt-1 text-xs text-subtle">Use para ações dirigidas a um grupo ou pessoa (por exemplo, a partir de um questionário identificado).</p>
                  <div className="mt-2 grid max-h-40 gap-1 overflow-y-auto">
                    {people.map((p) => (
                      <label key={p.id} className="flex items-center gap-2">
                        <input type="checkbox" checked={d.employeeIds.includes(p.id)} onChange={(e) => setD((x) => ({ ...x, employeeIds: e.target.checked ? [...x.employeeIds, p.id] : x.employeeIds.filter((i) => i !== p.id) }))} />
                        {p.name} <span className="text-xs text-subtle">{p.sectorName ?? ""}</span>
                      </label>
                    ))}
                  </div>
                </details>
              )}
              <Field label="Status" htmlFor="astatus">
                <Select id="astatus" value={d.status} onChange={up("status")}>
                  {COLUMNS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {d.status === "done" && (
                <Field label="Evidência de conclusão" htmlFor="aevid" hint="Vai para o relatório PGR (ex.: lista de presença, escala assinada, comunicado enviado).">
                  <Input id="aevid" value={d.evidence} maxLength={1000} onChange={up("evidence")} />
                </Field>
              )}
              {error && <p className="text-sm text-risk-crit-fg">{error}</p>}
              <div className="mt-auto flex gap-2 pt-4">
                {draft.id && (
                  <Button type="button" variant="danger" onClick={() => confirm("Excluir esta ação?") && onDelete(draft.id!)}>
                    Excluir
                  </Button>
                )}
                <Button type="submit" loading={saving} className="flex-1">
                  Salvar
                </Button>
              </div>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
