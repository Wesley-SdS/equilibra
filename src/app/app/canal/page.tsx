"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"
import { JevBadge } from "@/components/app/jev-badge"
import { PageHeader } from "@/components/app/page-header"
import { Composer, MessageList } from "@/components/channel/thread"
import { Button, Card, EmptyState, Select, Spinner } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { CHANNEL_STATUS, categoryLabel } from "@/lib/channel"
import { client } from "@/lib/client"
import { useCan } from "@/lib/hooks"
import { cn, formatDate } from "@/lib/utils"

const SEVERITY = [
  { label: "baixa", cls: "bg-risk-low/60 text-risk-low-fg" },
  { label: "média", cls: "bg-risk-mod/50 text-risk-mod-fg" },
  { label: "alta", cls: "bg-risk-high/15 text-risk-high-fg" },
  { label: "crítica", cls: "bg-risk-crit/15 text-risk-crit-fg" },
]

/** Conversa de um relato: o RH responde ao autor (anônimo) ou deixa notas internas. */
function ThreadPanel({ reportId, canEdit }: { reportId: string; canEdit: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const thread = useQuery({
    queryKey: ["channel-hr-thread", reportId],
    queryFn: async () => (await client.channelAdmin.thread.$get({ reportId })).json(),
    refetchInterval: 15_000,
  })
  const reply = useMutation({
    mutationFn: async (v: { body: string; attachments: { data: string }[]; internal: boolean }) => (await client.channelAdmin.reply.$post({ reportId, ...v })).json(),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["channel-hr-thread", reportId] })
      qc.invalidateQueries({ queryKey: ["channel"] })
      qc.invalidateQueries({ queryKey: ["channel-unread"] })
      toast(v.internal ? "Nota interna salva" : "Resposta enviada ao autor do relato")
    },
  })

  // Abrir a conversa marca as mensagens como vistas: atualiza a lista e o indicador do menu.
  if (thread.isSuccess) {
    qc.invalidateQueries({ queryKey: ["channel-unread"] })
  }

  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
      <div className="mt-1 flex flex-col gap-4 rounded-2xl border border-line bg-tint/[0.02] p-4">
        {thread.isLoading ? (
          <div className="grid h-24 place-items-center text-muted">
            <Spinner />
          </div>
        ) : (
          <MessageList
            messages={thread.data?.messages ?? []}
            viewer="hr"
            empty="Sem mensagens ainda. Responda ao autor: ele acompanha pelo protocolo, sem se identificar."
          />
        )}
        {canEdit ? (
          <Composer
            allowInternal
            sending={reply.isPending}
            placeholder="Escreva a resposta ao autor (ou marque como nota interna)…"
            hint="A resposta só chega ao autor quando ele consultar o protocolo. Não peça dados que o identifiquem."
            onSend={(v) => reply.mutateAsync(v)}
          />
        ) : (
          <p className="text-xs text-subtle">Seu perfil é somente leitura.</p>
        )}
      </div>
    </motion.div>
  )
}

export default function ChannelAdminPage() {
  const can = useCan()
  const qc = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState<string | null>(null)
  const me = useQuery({ queryKey: ["me"], queryFn: async () => (await client.auth.me.$get()).json() })
  const reports = useQuery({ queryKey: ["channel"], queryFn: async () => (await client.channelAdmin.list.$get()).json(), refetchInterval: 30_000 })
  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: keyof typeof CHANNEL_STATUS }) => (await client.channelAdmin.setStatus.$post(v)).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channel"] }),
  })
  const publicUrl = me.data && typeof window !== "undefined" ? `${window.location.origin}/canal/${me.data.company.slug}` : ""

  return (
    <>
      <PageHeader
        title="Canal de relato"
        description="Relatos anônimos de assédio, discriminação ou sobrecarga. Cada relato passa por triagem automática (Jev); você responde ao autor pelo próprio canal, sem saber quem ele é."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              navigator.clipboard.writeText(publicUrl)
              toast("Link do canal copiado")
            }}
          >
            Copiar link do canal
          </Button>
        }
      />
      {reports.isLoading ? (
        <div className="grid h-40 place-items-center text-muted">
          <Spinner />
        </div>
      ) : !reports.data?.length ? (
        <EmptyState title="Nenhum relato recebido" text="Divulgue o link do canal para a equipe. Os relatos são anônimos." />
      ) : (
        <div className="grid gap-3">
          {reports.data.map((r) => {
            const t = r.triage
            const sev = t ? SEVERITY[Math.min(3, Math.round(t.severity))]! : null
            const isOpen = open === r.id
            return (
              <Card key={r.id} className={cn("flex flex-col gap-3", t && t.urgent >= 0.5 && r.status !== "resolved" && "border-risk-crit/40")}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-sm text-brand-fg">{r.protocol}</span>
                    <span className="rounded-full bg-tint/[0.06] px-2.5 py-0.5 text-xs text-muted">{categoryLabel(r.category)}</span>
                    <span className="text-xs text-subtle">{formatDate(r.createdDay)}</span>
                    {r.unread && <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-brand-ink">Nova mensagem</span>}
                  </div>
                  <Select
                    aria-label={`Status do relato ${r.protocol}`}
                    className="h-9 w-40 text-sm"
                    disabled={!can.edit}
                    value={r.status}
                    onChange={(e) => setStatus.mutate({ id: r.id, status: e.target.value as keyof typeof CHANNEL_STATUS })}
                  >
                    {Object.entries(CHANNEL_STATUS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </div>
                {t && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl bg-tint/[0.03] px-3 py-2.5 text-xs">
                    <span className="font-medium text-muted">Triagem</span>
                    <JevBadge decision={t} />
                    <span className="flex items-center gap-2">
                      Prioridade
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-tint/[0.08]">
                        <span className={cn("block h-full rounded-full", r.priority >= 70 ? "bg-risk-crit" : r.priority >= 45 ? "bg-risk-high" : "bg-risk-mod-fg")} style={{ width: `${r.priority}%` }} />
                      </span>
                      <span className="font-mono">{r.priority}</span>
                    </span>
                    {sev && <span className={cn("rounded-full px-2 py-0.5 font-medium", sev.cls)}>Gravidade {sev.label}</span>}
                    {t.urgent >= 0.5 && <span className="rounded-full bg-risk-crit/15 px-2 py-0.5 font-medium text-risk-crit-fg">Risco imediato · {Math.round(t.urgent * 100)}%</span>}
                    {t.identifiesPeople >= 0.5 && <span className="rounded-full bg-risk-mod/50 px-2 py-0.5 text-risk-mod-fg">Pode identificar pessoas: trate com sigilo</span>}
                    {t.engine === "jev" && t.category !== r.category && (
                      <span className="text-muted">
                        Jev sugere: <strong className="text-fg">{categoryLabel(t.category)}</strong>
                        {t.categoryConfidence !== undefined && ` (${Math.round(t.categoryConfidence * 100)}%)`}
                      </span>
                    )}
                  </div>
                )}
                <p className="whitespace-pre-line text-[15px] leading-relaxed text-muted">{r.body}</p>
                <div>
                  <Button variant={isOpen ? "secondary" : "ghost"} size="sm" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.id)}>
                    {isOpen ? "Fechar conversa" : r.messageCount ? `Conversa (${r.messageCount})` : "Responder ao autor"}
                  </Button>
                </div>
                <AnimatePresence initial={false}>{isOpen && <ThreadPanel reportId={r.id} canEdit={can.edit} />}</AnimatePresence>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
