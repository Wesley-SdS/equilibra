"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { PageHeader } from "@/components/app/page-header"
import { Button, ButtonLink, Card, EmptyState, Field, Input, Select, Spinner } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { client } from "@/lib/client"
import { useCan } from "@/lib/hooks"
import { NR1_STANDARD_ID, estimatedMinutes, kindLabel } from "@/lib/questionnaire"
import { cn, formatDate } from "@/lib/utils"

function isoIn(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const PHASE = {
  scheduled: { label: "Agendada", cls: "bg-risk-mod/50 text-risk-mod-fg" },
  open: { label: "Ativa", cls: "bg-brand/15 text-brand-fg" },
  expired: { label: "Prazo vencido", cls: "bg-risk-high/15 text-risk-high-fg" },
  closed: { label: "Encerrada", cls: "bg-tint/[0.06] text-muted" },
} as const

type Row = { id: string; name: string; startsAt: string; endsAt: string }

/** Edição de nome e datas: serve para agendar a abertura, adiar ou estender o prazo (também reabre campanhas encerradas). */
function EditForm({ row, onDone }: { row: Row; onDone: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [f, setF] = useState({ name: row.name, startsAt: row.startsAt, endsAt: row.endsAt })
  const save = useMutation({
    mutationFn: async () => (await client.campaigns.update.$post({ id: row.id, ...f })).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] })
      toast("Campanha atualizada")
      onDone()
    },
  })
  return (
    <form
      className="grid w-full gap-3 border-t border-line pt-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <Field label="Nome" htmlFor={`n-${row.id}`}>
        <Input id={`n-${row.id}`} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <Field label="Abre em" htmlFor={`s-${row.id}`}>
        <Input id={`s-${row.id}`} type="date" required value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} />
      </Field>
      <Field label="Encerra em" htmlFor={`e-${row.id}`}>
        <Input id={`e-${row.id}`} type="date" required value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={save.isPending}>
          Salvar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancelar
        </Button>
      </div>
      {save.error && <p className="text-sm text-risk-crit-fg md:col-span-4">{save.error.message}</p>}
      <p className="text-xs text-subtle md:col-span-4">A abertura e o encerramento são automáticos nessas datas. O link e as respostas já recebidas não mudam.</p>
    </form>
  )
}

function CampaignsContent() {
  const can = useCan()
  const qc = useQueryClient()
  const toast = useToast()
  const params = useSearchParams()
  const [open, setOpen] = useState(params.get("nova") === "1")
  const [form, setForm] = useState({ name: "", startsAt: isoIn(0), endsAt: isoIn(14), questionnaireId: params.get("questionario") ?? NR1_STANDARD_ID })

  const library = useQuery({ queryKey: ["questionnaires"], queryFn: async () => (await client.questionnaires.list.$get()).json() })
  const choices = (library.data ?? []).filter((q) => q.status === "active")
  const chosen = choices.find((q) => q.id === form.questionnaireId)
  const [editing, setEditing] = useState<string | null>(null)

  const campaigns = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => (await client.campaigns.list.$get()).json(),
  })
  const create = useMutation({
    mutationFn: async () => (await client.campaigns.create.$post(form)).json(),
    onSuccess: (c) => {
      setOpen(false)
      setForm({ name: "", startsAt: isoIn(0), endsAt: isoIn(14), questionnaireId: NR1_STANDARD_ID })
      qc.invalidateQueries({ queryKey: ["campaigns"] })
      qc.invalidateQueries({ queryKey: ["insights"] })
      navigator.clipboard?.writeText(`${window.location.origin}/r/${c.token}`).catch(() => {})
      toast("Campanha criada. Link anônimo copiado.")
    },
  })
  const remind = useMutation({
    mutationFn: async (id: string) => (await client.campaigns.remind.$post({ id })).json(),
    onSuccess: (r) => toast(r.sent ? `Lembrete enviado para ${r.sent} pessoa(s) da equipe` : "Ninguém para receber o lembrete"),
    onError: (e) => toast(e.message, "error"),
  })
  const duplicate = useMutation({
    mutationFn: async (id: string) => (await client.campaigns.duplicate.$post({ id })).json(),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["campaigns"] })
      setEditing(c.id)
      toast("Campanha duplicada com um link novo. Ajuste as datas e o nome.")
    },
    onError: (e) => toast(e.message, "error"),
  })
  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: "active" | "closed" }) => (await client.campaigns.setStatus.$post(v)).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
    onError: (e) => toast(e.message, "error"),
  })

  return (
    <>
      <PageHeader
        title="Campanhas"
        description="Cada campanha gera um link anônimo para a equipe responder. Recomendamos reavaliar a cada 6 meses."
        actions={can.edit ? <Button onClick={() => setOpen((v) => !v)}>{open ? "Cancelar" : "Nova campanha"}</Button> : undefined}
      />

      <AnimatePresence>
        {open && can.edit && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Card className="mb-4">
              <form
                className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end"
                onSubmit={(e) => {
                  e.preventDefault()
                  create.mutate()
                }}
              >
                <div className="md:col-span-4">
                  <Field label="Questionário" htmlFor="cquest" hint={chosen ? `${kindLabel(chosen.kind)} · ${chosen.itemCount ?? 0} itens · ~${estimatedMinutes(chosen.itemCount ?? 0)} min · v${chosen.version ?? 1}${chosen.kind === "nr1" ? " · alimenta inventário, evolução e relatório PGR" : " · resultado próprio, fora do score NR-1"}` : undefined}>
                    <div className="flex flex-wrap gap-2">
                      <Select id="cquest" className="min-w-0 flex-1" value={form.questionnaireId} onChange={(e) => setForm({ ...form, questionnaireId: e.target.value })}>
                        {choices.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.name} · {kindLabel(q.kind)}
                          </option>
                        ))}
                      </Select>
                      <ButtonLink href="/app/questionario?novo=1" variant="secondary">
                        Criar um novo
                      </ButtonLink>
                    </div>
                  </Field>
                </div>
                <Field label="Nome" htmlFor="cname">
                  <Input id="cname" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Avaliação psicossocial · 1º semestre" />
                </Field>
                <Field label="Início" htmlFor="cstart">
                  <Input id="cstart" type="date" required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
                </Field>
                <Field label="Fim" htmlFor="cend">
                  <Input id="cend" type="date" required value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
                </Field>
                <Button type="submit" loading={create.isPending}>
                  Criar e copiar link
                </Button>
              </form>
              {create.error && <p className="mt-3 text-sm text-risk-crit-fg">{create.error.message}</p>}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {campaigns.isLoading ? (
        <div className="grid h-40 place-items-center text-muted">
          <Spinner />
        </div>
      ) : !campaigns.data?.length ? (
        <EmptyState title="Nenhuma campanha" text="Crie a primeira campanha e envie o link para a equipe." action={<Button onClick={() => setOpen(true)}>Nova campanha</Button>} />
      ) : (
        <div className="grid gap-3">
          {campaigns.data.map((c, i) => {
            const link = typeof window !== "undefined" ? `${window.location.origin}/r/${c.token}` : `/r/${c.token}`
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-3">
                      <h2 className="truncate text-lg font-semibold">{c.name}</h2>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-medium",
                          PHASE[c.phase].cls
                        )}
                      >
                        {PHASE[c.phase].label}
                      </span>
                    </div>
                    <p className="text-sm text-subtle">
                      {c.phase === "scheduled" ? `Abre em ${formatDate(c.startsAt)} · encerra em ${formatDate(c.endsAt)}` : `${formatDate(c.startsAt)} – ${formatDate(c.endsAt)}`} · {c.responses} respostas
                      {c.customCount > 0 && ` · +${c.customCount} perguntas da empresa`}
                    </p>
                    <p className="text-xs text-subtle">
                      <span className="rounded-full bg-tint/[0.06] px-2 py-0.5 text-muted">{kindLabel(c.questionnaire.kind)}</span> {c.questionnaire.name} · v{c.questionnaire.version} · {c.questionnaire.itemCount} itens
                    </p>
                    <code className="mt-1 truncate font-mono text-xs text-muted">{link}</code>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(link)
                        toast("Link copiado")
                      }}
                    >
                      Copiar link
                    </Button>
                    <ButtonLink href={`/app/campanhas/${c.id}/kit`} variant="secondary" size="sm">
                      Kit + QR code
                    </ButtonLink>
                    <ButtonLink href={`/r/${c.token}`} variant="secondary" size="sm">
                      Abrir questionário
                    </ButtonLink>
                    {can.edit && c.status === "active" && (
                      <Button variant="ghost" size="sm" loading={remind.isPending && remind.variables === c.id} onClick={() => remind.mutate(c.id)}>
                        Lembrar equipe
                      </Button>
                    )}
                    {can.edit && (
                      <Button variant="ghost" size="sm" onClick={() => setEditing(editing === c.id ? null : c.id)}>
                        Editar
                      </Button>
                    )}
                    {can.edit && (
                      <Button variant="ghost" size="sm" loading={duplicate.isPending && duplicate.variables === c.id} onClick={() => duplicate.mutate(c.id)}>
                        Duplicar
                      </Button>
                    )}
                    {can.edit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStatus.mutate({ id: c.id, status: c.status === "active" ? "closed" : "active" })}
                    >
                      {c.status === "active" ? "Encerrar" : "Reabrir"}
                    </Button>
                    )}
                  </div>
                  {editing === c.id && can.edit && <EditForm row={c} onDone={() => setEditing(null)} />}
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}
    </>
  )
}

export default function CampaignsPage() {
  return (
    <Suspense>
      <CampaignsContent />
    </Suspense>
  )
}
