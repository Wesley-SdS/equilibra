"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"
import QRCode from "qrcode"
import { use, useEffect, useState } from "react"
import { PageHeader } from "@/components/app/page-header"
import { Button, Card, Logo, Spinner } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { client } from "@/lib/client"
import { QUESTIONS } from "@/lib/methodology"
import { formatDate } from "@/lib/utils"

export default function CampaignKitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const toast = useToast()
  const [qr, setQr] = useState<string | null>(null)
  const campaign = useQuery({ queryKey: ["campaign", id], queryFn: async () => (await client.campaigns.get.$get({ id })).json() })
  const url = campaign.data && typeof window !== "undefined" ? `${window.location.origin}/r/${campaign.data.token}` : ""

  useEffect(() => {
    if (!url) return
    QRCode.toDataURL(url, { margin: 1, width: 640, errorCorrectionLevel: "M", color: { dark: "#07090a", light: "#ffffff" } }).then(setQr)
  }, [url])

  if (campaign.isLoading || !campaign.data) {
    return (
      <div className="grid h-80 place-items-center text-muted">
        <Spinner className="size-6" />
      </div>
    )
  }
  const c = campaign.data
  const whatsapp = `Oi, pessoal! A ${c.companyName} está fazendo uma avaliação sobre o nosso dia a dia de trabalho. São ${QUESTIONS.length} perguntas rápidas (uns 6 minutos), 100% anônimas: não pedimos nome, e-mail nem telefone. Responda até ${formatDate(c.endsAt)}: ${url}`
  const email = `Assunto: Sua opinião sobre o ambiente de trabalho (anônimo, 6 min)\n\nOlá,\n\nEstamos realizando a avaliação de riscos psicossociais prevista na NR-1. Queremos entender como está a rotina de cada setor para melhorar as condições de trabalho.\n\n• ${QUESTIONS.length} perguntas, cerca de 6 minutos\n• Totalmente anônimo: sem nome, e-mail ou IP\n• Resultados só aparecem para grupos de 5 ou mais pessoas\n\nResponda até ${formatDate(c.endsAt)}: ${url}\n\nObrigado!`

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast(`${label} copiado`)
  }

  return (
    <>
      <div className="no-print">
        <Link href="/app/campanhas" className="mb-4 inline-block text-sm text-muted hover:text-fg">
          ← Campanhas
        </Link>
        <PageHeader
          eyebrow={c.name}
          title="Kit de divulgação"
          description="Cartaz com QR code para o mural e mensagens prontas. A taxa de resposta sobe muito quando a direção divulga e reforça o anonimato."
          actions={<Button onClick={() => window.print()}>Imprimir cartaz</Button>}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="print-sheet flex flex-col items-center gap-6 rounded-3xl bg-white p-8 text-center text-[#07090a] sm:p-12">
          <Logo className="[&_span:last-child]:text-[#07090a]" />
          <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Como está o seu dia a dia no trabalho?</h2>
          <p className="max-w-sm text-[15px] leading-relaxed text-neutral-600">
            Responda pelo celular em cerca de 6 minutos. É anônimo: não pedimos nome, e-mail nem telefone.
          </p>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR code para o questionário" width={240} height={240} className="size-60 rounded-xl" />
          ) : (
            <div className="grid size-60 place-items-center rounded-xl bg-neutral-100">
              <Spinner />
            </div>
          )}
          <p className="text-sm text-neutral-600">
            Aponte a câmera do celular · responda até <strong className="text-[#07090a]">{formatDate(c.endsAt)}</strong>
          </p>
          <p className="break-all font-mono text-xs text-neutral-500">{url}</p>
          <p className="text-xs text-neutral-500">{c.companyName}</p>
        </div>

        <div className="no-print flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Mensagem para WhatsApp</h2>
              <Button size="sm" variant="secondary" onClick={() => copy(whatsapp, "Texto")}>
                Copiar
              </Button>
            </div>
            <p className="whitespace-pre-line rounded-xl bg-white/[0.03] p-4 text-sm leading-relaxed text-muted">{whatsapp}</p>
            <a href={`https://wa.me/?text=${encodeURIComponent(whatsapp)}`} target="_blank" rel="noreferrer" className="text-sm text-brand hover:text-brand-strong">
              Abrir no WhatsApp →
            </a>
          </Card>
          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">E-mail para a equipe</h2>
              <Button size="sm" variant="secondary" onClick={() => copy(email, "E-mail")}>
                Copiar
              </Button>
            </div>
            <p className="whitespace-pre-line rounded-xl bg-white/[0.03] p-4 text-sm leading-relaxed text-muted">{email}</p>
          </Card>
          <Card className="flex flex-col gap-2">
            <h2 className="font-semibold">Dicas para aumentar a adesão</h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted">
              <li>Peça para a direção enviar a primeira mensagem.</li>
              <li>Reserve 10 minutos da jornada para responder.</li>
              <li>Mande um lembrete na metade do prazo com a taxa atual.</li>
              <li>Mostre os resultados e as ações depois: isso aumenta a confiança na próxima rodada.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  )
}
