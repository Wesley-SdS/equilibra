"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { PageHeader } from "@/components/app/page-header"
import { Button, Card, Spinner } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { client } from "@/lib/client"
import { useCan } from "@/lib/hooks"

export default function ListeningAdminPage() {
  const can = useCan()
  const qc = useQueryClient()
  const toast = useToast()
  const [ack, setAck] = useState(false)
  const me = useQuery({ queryKey: ["me"], queryFn: async () => (await client.auth.me.$get()).json() })
  const data = useQuery({ queryKey: ["escuta-admin"], queryFn: async () => (await client.listeningAdmin.insights.$get()).json() })
  const setEnabled = useMutation({
    mutationFn: async (enabled: boolean) => (await client.listeningAdmin.setEnabled.$post({ enabled, acknowledge: ack })).json(),
    onSuccess: (_r, enabled) => {
      qc.invalidateQueries({ queryKey: ["escuta-admin"] })
      toast(enabled ? "Espaço de escuta ativado" : "Espaço de escuta desativado")
    },
    onError: (e) => toast(e.message, "error"),
  })
  const link = me.data && typeof window !== "undefined" ? `${window.location.origin}/escuta/${me.data.company.slug}` : ""
  const isOwner = me.data?.role === "owner"

  if (data.isLoading || !data.data) {
    return (
      <div className="grid h-80 place-items-center text-muted">
        <Spinner className="size-6" />
      </div>
    )
  }
  const d = data.data
  const maxTheme = Math.max(1, ...d.themes.map((t) => t.conversations))

  return (
    <>
      <PageHeader
        title="Espaço de escuta"
        description="Um agente de apoio (IA, não psicólogo) para os trabalhadores falarem do que está pesando no trabalho. Ele ouve, informa e encaminha; a empresa nunca vê as conversas, só temas agregados."
      />

      {!d.platformEnabled && (
        <Card className="mb-4 border-risk-mod/50">
          <h2 className="font-semibold">Em piloto fechado</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Este recurso só é liberado depois do parecer jurídico (exercício profissional, LGPD, defesa do consumidor) e com um psicólogo responsável técnico revisando o comportamento do agente e o protocolo de crise, conforme a
            decisão 8 do PRD v2. Enquanto isso, a ativação fica bloqueada nesta instalação.
          </p>
        </Card>
      )}
      {d.pilot && (
        <Card className="mb-4 border-brand/40">
          <h2 className="font-semibold">Sua empresa está no piloto</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            O Espaço de escuta está liberado só para as empresas do piloto, acompanhadas pelo psicólogo responsável técnico. Avise a equipe que é uma IA de apoio, não atendimento psicológico, e conte para nós o que funcionou e o que não funcionou.
          </p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] [&>*]:min-w-0">
        <Card className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">O que o agente faz e o que recusa</h2>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <ul className="flex flex-col gap-1.5 text-muted">
              <li className="font-medium text-fg">Faz</li>
              <li>Escuta e devolve o que entendeu, sem julgar</li>
              <li>Informação sobre estresse, sono, carga de trabalho e direitos básicos</li>
              <li>Ajuda a organizar o que dizer à liderança ou ao RH</li>
              <li>Encaminha: CVV 188, SAMU 192, CAPS, convênio, canal de relato, RH</li>
            </ul>
            <ul className="flex flex-col gap-1.5 text-muted">
              <li className="font-medium text-fg">Recusa</li>
              <li>Diagnóstico, terapia ou técnica terapêutica</li>
              <li>Opinião sobre medicamentos (indica médico)</li>
              <li>Pedir dados que identifiquem a pessoa</li>
              <li>Conversar com menores de 18 anos</li>
            </ul>
          </div>
          <p className="rounded-xl bg-risk-crit/10 px-3 py-2.5 text-sm text-muted">
            <strong className="text-fg">Protocolo de crise:</strong> sinais de risco interrompem a conversa e mostram os contatos de emergência (CVV 188, SAMU 192) com um texto fixo; o agente só acompanha até a pessoa dizer que
            ligou ou está segura. Nada é enviado à empresa.
          </p>
          <p className="text-xs text-subtle">
            A empresa nunca recebe: quem usou, quantas vezes cada pessoa usou, trechos de conversa ou sinais de crise. As conversas ficam cifradas com uma chave que só existe no aparelho da pessoa e somem após 90 dias sem uso.
          </p>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Ativação</h2>
              <span className={d.enabled ? "rounded-full bg-brand/15 px-2.5 py-0.5 text-xs text-brand-fg" : "rounded-full bg-tint/[0.06] px-2.5 py-0.5 text-xs text-muted"}>{d.enabled ? "Ativo" : "Desligado"}</span>
            </div>
            {d.enabled ? (
              <>
                <p className="text-sm text-muted">Compartilhe o link com a equipe (cartaz, grupo de WhatsApp, intranet). Cada pessoa entra sem login.</p>
                <code className="truncate rounded-lg bg-tint/[0.05] px-3 py-2 font-mono text-xs">{link}</code>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(link)
                      toast("Link copiado")
                    }}
                  >
                    Copiar link
                  </Button>
                  {isOwner && (
                    <Button size="sm" variant="ghost" loading={setEnabled.isPending} onClick={() => setEnabled.mutate(false)}>
                      Desativar
                    </Button>
                  )}
                </div>
              </>
            ) : isOwner && can.edit ? (
              <>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                  <span>Entendo que o agente é uma IA de apoio, não substitui psicólogo, e que a empresa não terá acesso às conversas.</span>
                </label>
                <Button className="self-start" disabled={!d.platformEnabled || !ack} loading={setEnabled.isPending} onClick={() => setEnabled.mutate(true)}>
                  Ativar o Espaço de escuta
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted">Só o dono da conta pode ativar.</p>
            )}
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="font-semibold">Temas deste mês</h2>
            {d.enough ? (
              <>
                <p className="text-xs text-subtle">{d.activeConversations} conversas ativas no mês. Cada conversa conta uma vez por tema.</p>
                {d.themes.map((t) => (
                  <div key={t.theme} className="grid grid-cols-[150px_1fr_40px] items-center gap-3 text-sm">
                    <span className="truncate">{t.name}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-tint/[0.08]">
                      <span className="block h-full rounded-full bg-brand-fg" style={{ width: `${(t.conversations / maxTheme) * 100}%` }} />
                    </span>
                    <span className="text-right font-mono text-xs">{t.conversations}</span>
                  </div>
                ))}
                {!d.themes.length && <p className="text-sm text-muted">Nenhum tema de trabalho identificado ainda.</p>}
                <p className="text-xs text-subtle">Um tema recorrente pede investigação: crie um questionário de pulso sobre ele em Questionários.</p>
              </>
            ) : (
              <p className="text-sm text-muted">Os temas só aparecem com pelo menos 10 conversas no mês e 20 trabalhadores cadastrados, para que ninguém seja reconhecido.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
