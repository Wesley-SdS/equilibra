"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { Button, Card, Spinner } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { client } from "@/lib/client"
import { useCan } from "@/lib/hooks"
import { cn, formatDate } from "@/lib/utils"

/** Envio do link anônimo por WhatsApp e e-mail a partir de uma lista colada pelo RH. */
export function DispatchCard({ campaignId, active }: { campaignId: string; active: boolean }) {
  const can = useCan()
  const qc = useQueryClient()
  const toast = useToast()
  const [text, setText] = useState("")
  const [basis, setBasis] = useState(false)

  const summary = useQuery({
    queryKey: ["dispatch", campaignId],
    queryFn: async () => (await client.dispatch.summary.$get({ campaignId })).json(),
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ["dispatch", campaignId] })

  const add = useMutation({
    mutationFn: async () => (await client.dispatch.add.$post({ campaignId, text, basis: basis as true })).json(),
    onSuccess: (r) => {
      setText("")
      refresh()
      const extra = [r.invalid && `${r.invalid} inválido(s)`, r.duplicates && `${r.duplicates} repetido(s)`, r.overLimit && `${r.overLimit} acima do limite`].filter(Boolean).join(", ")
      toast(`${r.added} contato(s) adicionados${extra ? ` (${extra})` : ""}`)
    },
    onError: (e) => toast(e.message, "error"),
  })
  const send = useMutation({
    mutationFn: async (kind: "invite" | "reminder") => (await client.dispatch.send.$post({ campaignId, kind })).json(),
    onSuccess: (r) => {
      refresh()
      toast(`Enviado: ${r.whatsappSent} WhatsApp, ${r.emailSent} e-mail${r.failed ? `, ${r.failed} falha(s)` : ""}`, r.failed ? "error" : "ok")
    },
    onError: (e) => toast(e.message, "error"),
  })
  const clear = useMutation({
    mutationFn: async () => (await client.dispatch.clear.$post({ campaignId })).json(),
    onSuccess: () => {
      refresh()
      toast("Lista apagada")
    },
  })

  const s = summary.data
  const total = (s?.whatsapp ?? 0) + (s?.email ?? 0)
  const simulated = s && (s.whatsappMode === "simulacao" || s.emailMode === "simulacao")

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Enviar para a equipe</h2>
        {simulated && (
          <span className="rounded-full bg-risk-mod/50 px-2.5 py-0.5 text-xs text-risk-mod-fg" title="Sem credenciais, as mensagens são gravadas localmente em vez de enviadas">
            Modo simulação
            {s.whatsappMode === "simulacao" ? " · WhatsApp" : ""}
            {s.emailMode === "simulacao" ? " · e-mail" : ""}
          </span>
        )}
      </div>
      <p className="text-sm text-muted">
        Cole telefones (com DDD) ou e-mails, um por linha. Todos recebem o <strong className="text-fg">mesmo link anônimo</strong>: a lista não é ligada às respostas e é apagada quando a campanha termina. Lembrete automático
        2 dias antes do fim.
      </p>

      {summary.isLoading ? (
        <div className="grid h-16 place-items-center text-muted">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["WhatsApp", s?.whatsapp ?? 0],
              ["E-mail", s?.email ?? 0],
              ["Limite", s?.max ?? 0],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-xl border border-line bg-tint/[0.02] px-2 py-3">
                <p className="font-mono text-xl font-semibold">{value}</p>
                <p className="text-xs text-subtle">{label}</p>
              </div>
            ))}
          </div>
          {!!s?.sample.length && <p className="font-mono text-xs text-subtle">Ex.: {s.sample.join(" · ")}</p>}
        </>
      )}

      {can.edit && active && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            add.mutate()
          }}
        >
          <label htmlFor="dtext" className="sr-only">
            Contatos
          </label>
          <textarea
            id="dtext"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"(11) 98765-4321\nmaria@empresa.com.br"}
            className="min-h-28 w-full rounded-xl border border-line-strong bg-tint/[0.03] px-3.5 py-3 font-mono text-sm placeholder:text-subtle focus:border-brand/60 focus:outline-none focus:ring-4 focus:ring-brand/10"
          />
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line px-3 py-2.5 text-[13px] leading-snug text-muted">
            <input type="checkbox" checked={basis} onChange={(e) => setBasis(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--brand-fg)]" />
            Declaro que a empresa tem fundamento legal para contatar essas pessoas sobre a avaliação de riscos psicossociais (NR-1) e que as informou sobre o uso dos contatos.
          </label>
          <Button type="submit" variant="secondary" loading={add.isPending} disabled={!basis || !text.trim()} className="self-start">
            Adicionar à lista
          </Button>
        </form>
      )}

      {can.edit && active && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button loading={send.isPending && send.variables === "invite"} disabled={!total} onClick={() => send.mutate("invite")}>
            Enviar convite agora
          </Button>
          <Button variant="secondary" loading={send.isPending && send.variables === "reminder"} disabled={!total} onClick={() => send.mutate("reminder")}>
            Enviar lembrete
          </Button>
          <Button variant="ghost" disabled={!total} loading={clear.isPending} onClick={() => confirm("Apagar toda a lista de envio?") && clear.mutate()}>
            Apagar lista
          </Button>
        </div>
      )}
      {!active && <p className="text-sm text-subtle">Campanha encerrada: a lista de envio foi apagada.</p>}

      {!!s?.history.length && (
        <ul className="flex flex-col divide-y divide-line border-t border-line text-sm">
          {s.history.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {h.kind === "invite" ? "Convite" : "Lembrete"} <span className="text-subtle">({h.trigger === "auto" ? "automático" : "manual"})</span>
              </span>
              <span className={cn("font-mono text-xs", h.failed ? "text-risk-high-fg" : "text-muted")}>
                {h.whatsappSent} WhatsApp · {h.emailSent} e-mail{h.failed ? ` · ${h.failed} falha(s)` : ""} · {formatDate(new Date(h.at).toISOString())}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
