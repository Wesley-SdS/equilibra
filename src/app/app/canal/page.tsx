"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { PageHeader } from "@/components/app/page-header"
import { Button, Card, EmptyState, Select, Spinner } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { CHANNEL_STATUS, categoryLabel } from "@/lib/channel"
import { client } from "@/lib/client"
import { useCan } from "@/lib/hooks"
import { formatDate } from "@/lib/utils"

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
        description="Relatos anônimos de assédio, discriminação ou sobrecarga. Quem relata recebe um protocolo para acompanhar o andamento."
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
          {reports.data.map((r) => (
            <Card key={r.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
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
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-muted">{r.body}</p>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
