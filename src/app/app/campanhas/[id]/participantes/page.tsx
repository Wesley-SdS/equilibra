"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { use, useState } from "react"
import { PageHeader } from "@/components/app/page-header"
import { Button, ButtonLink, Card, EmptyState, Spinner } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { client } from "@/lib/client"
import { useCan } from "@/lib/hooks"
import { SCALE } from "@/lib/methodology"
import { cn, formatDate } from "@/lib/utils"

const VALUE_CLS = ["", "bg-tint/[0.05] text-muted", "bg-tint/[0.08]", "bg-risk-mod/30", "bg-risk-mod/50", "bg-risk-high/25"]

/** Valor visto pelo ângulo do risco: item de risco com "Sempre" é ruim; de proteção, "Nunca" é ruim. */
function riskTone(value: number, risk: boolean) {
  const r = risk ? value - 1 : 5 - value
  return r >= 3 ? "bg-risk-crit/15 text-risk-crit-fg" : r === 2 ? "bg-risk-mod/40 text-risk-mod-fg" : "bg-risk-low/50 text-risk-low-fg"
}

export default function ParticipantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const can = useCan()
  const qc = useQueryClient()
  const toast = useToast()
  const [selected, setSelected] = useState<string[]>([])
  const [filter, setFilter] = useState<"all" | "done" | "pending">("all")
  const data = useQuery({ queryKey: ["participants", id], queryFn: async () => (await client.participants.list.$get({ campaignId: id })).json() })
  const send = useMutation({
    mutationFn: async (kind: "invite" | "reminder") => (await client.participants.send.$post({ campaignId: id, kind })).json(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["participants", id] })
      toast(r.people ? `Enviado para ${r.people} pessoas (${r.emailSent} e-mails, ${r.whatsappSent} WhatsApp)${r.failed ? `, ${r.failed} sem contato válido` : ""}` : "Ninguém pendente para receber")
    },
    onError: (e) => toast(e.message, "error"),
  })

  if (data.isLoading) {
    return (
      <div className="grid h-80 place-items-center text-muted">
        <Spinner className="size-6" />
      </div>
    )
  }
  if (data.isError || !data.data) {
    return <EmptyState title="Sem participantes" text={data.error?.message ?? "Esta campanha não é identificada."} action={<ButtonLink href="/app/campanhas">Voltar</ButtonLink>} />
  }
  const d = data.data
  const done = d.participants.filter((p) => p.respondedAt).length
  const rate = d.participants.length ? Math.round((done / d.participants.length) * 100) : 0
  const rows = d.participants.filter((p) => filter === "all" || (filter === "done" ? p.respondedAt : !p.respondedAt))
  const notInvited = d.participants.filter((p) => !p.invitedAt && !p.respondedAt).length
  const selectedNames = d.participants.filter((p) => selected.includes(p.employeeId))
  const actionHref = `/app/plano?nova=1&pessoas=${selected.join(",")}&origem=${encodeURIComponent(d.campaign.name)}`

  return (
    <>
      <Link href="/app/campanhas" className="mb-4 inline-block text-sm text-muted hover:text-fg">
        ← Campanhas
      </Link>
      <PageHeader
        eyebrow={`${d.questionnaire.name} · identificado`}
        title={d.campaign.name}
        description="Quem foi convidado, quem respondeu e o que respondeu. Cada pessoa aceitou um aviso de que as respostas seriam vistas com o nome."
        actions={
          can.edit && d.campaign.status === "active" ? (
            <>
              <Button variant="secondary" loading={send.isPending && send.variables === "reminder"} onClick={() => send.mutate("reminder")}>
                Lembrar pendentes
              </Button>
              <Button loading={send.isPending && send.variables === "invite"} disabled={!notInvited} onClick={() => send.mutate("invite")}>
                Enviar convites{notInvited ? ` (${notInvited})` : ""}
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card className="flex flex-col gap-1.5">
          <span className="text-sm text-subtle">Responderam</span>
          <span className="text-3xl font-semibold tracking-tight">
            {done}
            <span className="text-lg text-subtle">/{d.participants.length}</span>
          </span>
          <div className="h-1.5 overflow-hidden rounded-full bg-tint/[0.08]">
            <div className="h-full rounded-full bg-brand" style={{ width: `${rate}%` }} />
          </div>
        </Card>
        <Card className="flex flex-col gap-1.5">
          <span className="text-sm text-subtle">Pendentes</span>
          <span className="text-3xl font-semibold tracking-tight">{d.participants.length - done}</span>
          <span className="text-xs text-muted">{notInvited ? `${notInvited} ainda sem convite` : "todos convidados"}</span>
        </Card>
        <Card className="flex flex-col gap-1.5">
          <span className="text-sm text-subtle">Encerra em</span>
          <span className="text-3xl font-semibold tracking-tight">{formatDate(d.campaign.endsAt)}</span>
          <span className="text-xs text-muted">{d.campaign.status === "active" ? "aberta" : "encerrada"}</span>
        </Card>
      </div>

      {selected.length > 0 && can.edit && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-brand/30">
          <span className="text-sm">
            {selected.length} selecionadas: {selectedNames.slice(0, 4).map((p) => p.name.split(" ")[0]).join(", ")}
            {selected.length > 4 && "…"}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
              Limpar
            </Button>
            <ButtonLink href={actionHref} size="sm">
              Criar ação para este grupo
            </ButtonLink>
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(["all", "done", "pending"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={cn("rounded-lg border px-2.5 py-1 text-xs", filter === f ? "border-brand/40 text-fg" : "border-line text-muted")}>
              {f === "all" ? `Todos · ${d.participants.length}` : f === "done" ? `Responderam · ${done}` : `Pendentes · ${d.participants.length - done}`}
            </button>
          ))}
          <span className="ml-auto text-xs text-subtle">Cor = leitura de risco do item (verde baixo, amarelo atenção, vermelho alto)</span>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs text-subtle">
            <tr>
              <th className="w-8 py-2" />
              <th className="py-2 pr-4 font-medium">Pessoa</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              {d.questionnaire.items.map((it, i) => (
                <th key={it.id} className="px-1 py-2 text-center font-mono font-medium" title={`${it.text}${it.dimensionName ? ` (${it.dimensionName}, ${it.risk ? "risco" : "proteção"})` : ""}`}>
                  {String(i + 1).padStart(2, "0")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="py-2.5">
                  <input type="checkbox" aria-label={`Selecionar ${p.name}`} checked={selected.includes(p.employeeId)} onChange={(e) => setSelected((x) => (e.target.checked ? [...x, p.employeeId] : x.filter((i) => i !== p.employeeId)))} />
                </td>
                <td className="py-2.5 pr-4">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-subtle">{p.sectorName ?? "Sem setor"}</div>
                </td>
                <td className="py-2.5 pr-4 text-xs">
                  {p.respondedAt ? (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-brand-fg">Respondeu {formatDate(new Date(p.respondedAt).toISOString().slice(0, 10))}</span>
                  ) : p.remindedAt ? (
                    <span className="rounded-full bg-risk-mod/50 px-2 py-0.5 text-risk-mod-fg">Lembrete enviado</span>
                  ) : p.invitedAt ? (
                    <span className="rounded-full bg-tint/[0.06] px-2 py-0.5 text-muted">Convidada</span>
                  ) : (
                    <span className="rounded-full bg-tint/[0.06] px-2 py-0.5 text-subtle">Sem convite</span>
                  )}
                  {!p.respondedAt && can.edit && (
                    <button
                      type="button"
                      className="ml-2 text-subtle underline hover:text-fg"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}${p.link}`)
                        toast(`Link pessoal de ${p.name.split(" ")[0]} copiado`)
                      }}
                    >
                      copiar link
                    </button>
                  )}
                </td>
                {d.questionnaire.items.map((it) => {
                  const v = p.answers?.[it.id]
                  return (
                    <td key={it.id} className="px-1 py-2.5 text-center">
                      {v ? (
                        <span className={cn("inline-grid size-7 place-items-center rounded-md font-mono text-xs", it.dimensionName ? riskTone(v, it.risk) : VALUE_CLS[v])} title={`${it.text}: ${SCALE[v - 1]}`}>
                          {v}
                        </span>
                      ) : (
                        <span className="text-subtle">·</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <ol className="mt-4 grid gap-1 text-xs text-muted md:grid-cols-2">
          {d.questionnaire.items.map((it, i) => (
            <li key={it.id}>
              <span className="font-mono text-subtle">{String(i + 1).padStart(2, "0")}</span> {it.text}
            </li>
          ))}
        </ol>
      </Card>
    </>
  )
}
