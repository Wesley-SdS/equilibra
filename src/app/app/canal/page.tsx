"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PageHeader } from "@/components/app/page-header"
import { Button, Card, EmptyState, Select, Spinner } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { CHANNEL_STATUS, categoryLabel } from "@/lib/channel"
import { client } from "@/lib/client"
import { useCan } from "@/lib/hooks"
import { cn, formatDate } from "@/lib/utils"
import { JevBadge } from "@/components/app/jev-badge"

const SEVERITY = [
  { label: "baixa", cls: "bg-risk-low/60 text-risk-low-fg" },
  { label: "média", cls: "bg-risk-mod/50 text-risk-mod-fg" },
  { label: "alta", cls: "bg-risk-high/15 text-risk-high-fg" },
  { label: "crítica", cls: "bg-risk-crit/15 text-risk-crit-fg" },
]

export default function ChannelAdminPage() {
  const can = useCan()
  const qc = useQueryClient()
  const toast = useToast()
  const me = useQuery({ queryKey: ["me"], queryFn: async () => (await client.auth.me.$get()).json() })
  const reports = useQuery({ queryKey: ["channel"], queryFn: async () => (await client.channelAdmin.list.$get()).json() })
  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: keyof typeof CHANNEL_STATUS }) => (await client.channelAdmin.setStatus.$post(v)).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channel"] }),
  })
  const publicUrl = me.data && typeof window !== "undefined" ? `${window.location.origin}/canal/${me.data.company.slug}` : ""

  return (
    <>
      <PageHeader
        title="Canal de relato"
        description="Relatos anônimos de assédio, discriminação ou sobrecarga. Cada relato passa por triagem automática (Jev) e a fila é ordenada por prioridade."
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
            return (
            <Card key={r.id} className={cn("flex flex-col gap-3", t && t.urgent >= 0.5 && r.status !== "resolved" && "border-risk-crit/40")}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm text-brand-fg">{r.protocol}</span>
                  <span className="rounded-full bg-tint/[0.06] px-2.5 py-0.5 text-xs text-muted">{categoryLabel(r.category)}</span>
                  <span className="text-xs text-subtle">{formatDate(r.createdDay)}</span>
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
            </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
