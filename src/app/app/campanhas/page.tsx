"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"
import { PageHeader } from "@/components/app/page-header"
import { Button, ButtonLink, Card, EmptyState, Field, Input, Spinner } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { client } from "@/lib/client"
import { cn, formatDate } from "@/lib/utils"

function isoIn(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function CampaignsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: "", startsAt: isoIn(0), endsAt: isoIn(14) })

  const campaigns = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => (await client.campaigns.list.$get()).json(),
  })
  const create = useMutation({
    mutationFn: async () => (await client.campaigns.create.$post(form)).json(),
    onSuccess: (c) => {
      setOpen(false)
      setForm({ name: "", startsAt: isoIn(0), endsAt: isoIn(14) })
      qc.invalidateQueries({ queryKey: ["campaigns"] })
      qc.invalidateQueries({ queryKey: ["insights"] })
      navigator.clipboard?.writeText(`${window.location.origin}/r/${c.token}`).catch(() => {})
      toast("Campanha criada. Link anônimo copiado.")
    },
  })
  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: "active" | "closed" }) => (await client.campaigns.setStatus.$post(v)).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  })

  return (
    <>
      <PageHeader
        title="Campanhas"
        description="Cada campanha gera um link anônimo para a equipe responder. Recomendamos reavaliar a cada 6 meses."
        actions={<Button onClick={() => setOpen((v) => !v)}>{open ? "Cancelar" : "Nova campanha"}</Button>}
      />

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Card className="mb-4">
              <form
                className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end"
                onSubmit={(e) => {
                  e.preventDefault()
                  create.mutate()
                }}
              >
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
                          c.status === "active" ? "bg-brand/15 text-brand" : "bg-white/[0.06] text-muted"
                        )}
                      >
                        {c.status === "active" ? "Ativa" : "Encerrada"}
                      </span>
                    </div>
                    <p className="text-sm text-subtle">
                      {formatDate(c.startsAt)} – {formatDate(c.endsAt)} · {c.responses} respostas
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
                    <ButtonLink href={`/r/${c.token}`} variant="secondary" size="sm">
                      Abrir questionário
                    </ButtonLink>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStatus.mutate({ id: c.id, status: c.status === "active" ? "closed" : "active" })}
                    >
                      {c.status === "active" ? "Encerrar" : "Reabrir"}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}
    </>
  )
}
