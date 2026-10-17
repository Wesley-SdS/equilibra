"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { use, useState } from "react"
import { Button, Field, Input, Logo, Select, Spinner, Textarea } from "@/components/ui/primitives"
import { CHANNEL_CATEGORIES, CHANNEL_STATUS, type ChannelCategory } from "@/lib/channel"
import { client } from "@/lib/client"
import { cn, formatDate } from "@/lib/utils"

export default function ChannelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [tab, setTab] = useState<"new" | "track">("new")
  const [category, setCategory] = useState<ChannelCategory>("assedio_moral")
  const [body, setBody] = useState("")
  const [protocol, setProtocol] = useState("")
  const [lookup, setLookup] = useState<string | null>(null)

  const company = useQuery({
    queryKey: ["channel-company", slug],
    queryFn: async () => (await client.channel.company.$get({ slug })).json(),
    retry: false,
  })
  const submit = useMutation({
    mutationFn: async () => (await client.channel.submit.$post({ slug, category, body })).json(),
  })
  const status = useQuery({
    queryKey: ["channel-status", lookup],
    queryFn: async () => (await client.channel.status.$get({ protocol: lookup! })).json(),
    enabled: !!lookup,
    retry: false,
  })

  return (
    <div className="relative min-h-dvh">
      <div className="relative mx-auto flex min-h-dvh max-w-lg flex-col px-5 py-6">
        <header className="mb-10 flex items-center justify-between">
          <Logo />
          {company.data && <span className="truncate text-xs text-subtle">{company.data.name}</span>}
        </header>

        {company.isLoading ? (
          <div className="grid flex-1 place-items-center text-muted">
            <Spinner />
          </div>
        ) : company.isError ? (
          <p className="text-center text-muted">Canal não encontrado.</p>
        ) : submit.data ? (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-4 text-center">
            <h1 className="text-3xl font-semibold tracking-tight">Relato enviado</h1>
            <p className="text-muted">Guarde o protocolo abaixo para acompanhar o andamento. Ele é a única forma de consultar seu relato.</p>
            <code className="rounded-2xl border border-brand/30 bg-brand/[0.06] px-6 py-4 font-mono text-2xl tracking-wider text-brand-fg">{submit.data.protocol}</code>
            <Button variant="secondary" onClick={() => navigator.clipboard.writeText(submit.data.protocol)}>
              Copiar protocolo
            </Button>
          </motion.div>
        ) : (
          <>
            <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.03em]">Canal de relato anônimo</h1>
            <p className="mt-2 text-muted">Relate situações de assédio, discriminação ou sobrecarga. Não pedimos sua identificação.</p>

            <div className="mt-8 grid grid-cols-2 gap-1 rounded-xl border border-line p-1" role="tablist">
              {(["new", "track"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn("relative h-10 rounded-lg text-sm font-medium", tab === t ? "text-fg" : "text-muted")}
                >
                  {tab === t && <motion.span layoutId="tab" className="absolute inset-0 rounded-lg bg-tint/[0.08]" />}
                  <span className="relative">{t === "new" ? "Novo relato" : "Acompanhar"}</span>
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {tab === "new" ? (
                <motion.form
                  key="new"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mt-6 flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault()
                    submit.mutate()
                  }}
                >
                  <Field label="Tipo de situação" htmlFor="ccat">
                    <Select id="ccat" value={category} onChange={(e) => setCategory(e.target.value as ChannelCategory)}>
                      {CHANNEL_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="O que aconteceu?" htmlFor="cbody" hint="Evite nomes e detalhes pessoais desnecessários. O texto passa por triagem automática para priorizar o atendimento (veja a Política de Privacidade).">
                    <Textarea id="cbody" required minLength={20} className="min-h-40" value={body} onChange={(e) => setBody(e.target.value)} />
                  </Field>
                  {submit.error && <p className="text-sm text-risk-crit-fg">{submit.error.message}</p>}
                  <Button type="submit" size="lg" loading={submit.isPending}>
                    Enviar relato anônimo
                  </Button>
                </motion.form>
              ) : (
                <motion.div key="track" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mt-6 flex flex-col gap-4">
                  <form
                    className="flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      setLookup(protocol.trim().toUpperCase())
                    }}
                  >
                    <Input aria-label="Protocolo" placeholder="EQ-XXXX-XXXX" className="font-mono uppercase" value={protocol} onChange={(e) => setProtocol(e.target.value)} />
                    <Button type="submit" loading={status.isFetching}>
                      Consultar
                    </Button>
                  </form>
                  {status.data && (
                    <div className="rounded-2xl border border-line p-4">
                      <p className="text-sm text-subtle">Aberto em {formatDate(status.data.createdDay)}</p>
                      <p className="mt-1 text-lg font-semibold">{CHANNEL_STATUS[status.data.status]}</p>
                    </div>
                  )}
                  {status.isError && <p className="text-sm text-risk-crit-fg">Protocolo não encontrado.</p>}
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  )
}
