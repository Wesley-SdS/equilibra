"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import { PageHeader } from "@/components/app/page-header"
import { Button, Field, Input, Select, Spinner, Textarea } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { client } from "@/lib/client"
import { useCan } from "@/lib/hooks"
import { DIMENSIONS, dimensionMeta, type DimensionId } from "@/lib/methodology"
import { cn, formatDate } from "@/lib/utils"

type Status = "todo" | "doing" | "done"
const COLUMNS: { id: Status; label: string; dot: string }[] = [
  { id: "todo", label: "A fazer", dot: "bg-subtle" },
  { id: "doing", label: "Em andamento", dot: "bg-risk-mod-fg" },
  { id: "done", label: "Concluída", dot: "bg-brand" },
]

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
}

const EMPTY: Draft = { dimension: "demandas", what: "", why: "", sectorId: null, who: "", due: "", how: "", cost: "", status: "todo" }

function PlanContent() {
  const can = useCan()
  const params = useSearchParams()
  const qc = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState<Draft | null>(null)
  useEffect(() => {
    if (params.get("nova") !== "1") return
    const dim = DIMENSIONS.find((d) => d.id === params.get("dimensao"))
    setEditing({ ...EMPTY, dimension: dim?.id ?? EMPTY.dimension })
  }, [params])

  const actions = useQuery({ queryKey: ["actions"], queryFn: async () => (await client.actions.list.$get()).json() })
  const sectors = useQuery({ queryKey: ["sectors"], queryFn: async () => (await client.sectors.list.$get()).json() })
  const sectorName = (id: string | null) => sectors.data?.find((s) => s.id === id)?.name

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const { id, ...data } = d
      if (id) return (await client.actions.update.$post({ id, ...data })).json()
      return (await client.actions.create.$post(data)).json()
    },
    onSuccess: () => {
      setEditing(null)
      qc.invalidateQueries({ queryKey: ["actions"] })
      toast("Plano atualizado")
    },
  })
  const move = useMutation({
    mutationFn: async (v: { id: string; status: Status }) => (await client.actions.update.$post(v)).json(),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["actions"] })
      const prev = qc.getQueryData(["actions"])
      qc.setQueryData(["actions"], (old: typeof actions.data) => old?.map((a) => (a.id === v.id ? { ...a, status: v.status } : a)))
      return { prev }
    },
    onError: (_e, _v, ctx) => qc.setQueryData(["actions"], ctx?.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ["actions"] }),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => (await client.actions.remove.$post({ id })).json(),
    onSuccess: () => {
      setEditing(null)
      qc.invalidateQueries({ queryKey: ["actions"] })
    },
  })

  const done = actions.data?.filter((a) => a.status === "done").length ?? 0
  const total = actions.data?.length ?? 0

  return (
    <>
      <PageHeader
        title="Plano de ação"
        description="Medidas de prevenção no formato 5W2H para cada risco identificado. É isso que a fiscalização vai pedir junto com o inventário."
        actions={can.edit ? <Button onClick={() => setEditing({ ...EMPTY })}>Nova ação</Button> : undefined}
      />
      <div className="mb-6 flex items-center gap-4">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div className="h-full rounded-full bg-brand" animate={{ width: total ? `${(done / total) * 100}%` : "0%" }} transition={{ duration: 0.6 }} />
        </div>
        <span className="font-mono text-sm text-muted">
          {done}/{total} concluídas
        </span>
      </div>

      {actions.isLoading ? (
        <div className="grid h-40 place-items-center text-muted">
          <Spinner />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => {
            const items = actions.data?.filter((a) => a.status === col.id) ?? []
            return (
              <section key={col.id} aria-label={col.label} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface/50 p-3">
                <header className="flex items-center justify-between px-2 pt-1">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className={cn("size-2 rounded-full", col.dot)} />
                    {col.label}
                  </span>
                  <span className="font-mono text-xs text-subtle">{items.length}</span>
                </header>
                <AnimatePresence initial={false}>
                  {items.map((a) => (
                    <motion.article
                      key={a.id}
                      layout
                      layoutId={a.id}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      className="flex flex-col gap-3 rounded-xl border border-line bg-surface-2 p-4"
                    >
                      <span className="self-start rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-muted">
                        {dimensionMeta(a.dimension)?.name}
                      </span>
                      <button type="button" disabled={!can.edit} onClick={() => setEditing({ ...a, status: a.status as Status, dimension: a.dimension as DimensionId })} className="text-left text-[15px] font-medium leading-snug hover:text-brand">
                        {a.what}
                      </button>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-subtle">
                        {sectorName(a.sectorId) && <span>Onde: {sectorName(a.sectorId)}</span>}
                        {a.who && <span>Quem: {a.who}</span>}
                        {a.due && <span>Prazo: {formatDate(a.due)}</span>}
                      </div>
                      {can.edit && <div className="flex gap-1.5">
                        {COLUMNS.filter((c) => c.id !== col.id).map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => move.mutate({ id: a.id, status: c.id })}
                            className="rounded-lg border border-line px-2 py-1 text-xs text-muted transition-colors hover:border-line-strong hover:text-fg"
                          >
                            → {c.label}
                          </button>
                        ))}
                      </div>}
                    </motion.article>
                  ))}
                </AnimatePresence>
                {!items.length && <p className="px-2 py-6 text-center text-sm text-subtle">Nada aqui.</p>}
              </section>
            )
          })}
        </div>
      )}

      <ActionDrawer
        draft={editing}
        sectors={sectors.data ?? []}
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
  saving,
  error,
  onClose,
  onSave,
  onDelete,
}: {
  draft: Draft | null
  sectors: { id: string; name: string }[]
  saving: boolean
  error?: string
  onClose: () => void
  onSave: (d: Draft) => void
  onDelete: (id: string) => void
}) {
  const [d, setD] = useState<Draft>(EMPTY)
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
              <button type="button" onClick={onClose} aria-label="Fechar" className="grid size-9 place-items-center rounded-lg text-muted hover:bg-white/[0.05]">
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
              <Field label="Status" htmlFor="astatus">
                <Select id="astatus" value={d.status} onChange={up("status")}>
                  {COLUMNS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
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
