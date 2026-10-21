"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { use, useEffect, useRef, useState } from "react"
import { LegalLinks } from "@/components/legal-links"
import { Button, Logo, Spinner } from "@/components/ui/primitives"
import { client } from "@/lib/client"
import { cn } from "@/lib/utils"

type Msg = { id: string; role: "user" | "assistant"; text: string; crisis: boolean }

function CrisisCard() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-risk-crit/50 bg-risk-crit/10 p-4">
      <h2 className="text-lg font-semibold leading-snug">Fale agora com alguém preparado</h2>
      <a href="tel:188" className="flex items-center gap-3 rounded-xl bg-risk-crit px-4 py-3 text-white">
        <span className="font-mono text-2xl font-semibold">188</span>
        <span className="text-sm leading-tight">
          <strong className="block">Ligar para o CVV</strong>Gratuito, 24 horas, sigiloso. Também por chat em cvv.org.br
        </span>
      </a>
      <a href="tel:192" className="flex items-center justify-between rounded-xl border border-line-strong px-4 py-2.5 text-sm">
        SAMU 192 <span className="text-xs text-subtle">emergência médica</span>
      </a>
      <p className="text-xs leading-relaxed text-muted">Nada desta conversa é enviado à sua empresa. Se algo do trabalho contribui para isso, você pode abrir um relato anônimo depois.</p>
    </div>
  )
}

export default function ListeningPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const qc = useQueryClient()
  const [consent, setConsent] = useState(false)
  const [text, setText] = useState("")
  const [options, setOptions] = useState<string[]>([])
  const [pending, setPending] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)

  const status = useQuery({ queryKey: ["escuta", slug], queryFn: async () => (await client.listening.status.$get({ slug })).json(), retry: false })
  const messages = useQuery({
    queryKey: ["escuta-msgs", slug],
    queryFn: async () => (await client.listening.messages.$get({ slug })).json() as Promise<Msg[]>,
    enabled: Boolean(status.data?.hasConversation),
  })
  const start = useMutation({
    mutationFn: async () => (await client.listening.start.$post({ slug, consent: true })).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["escuta", slug] }),
  })
  const send = useMutation({
    mutationFn: async (t: string) => (await client.listening.send.$post({ slug, text: t })).json(),
    onMutate: (t) => {
      setPending(t)
      setText("")
      setOptions([])
    },
    onSuccess: (r) => {
      setOptions(r.options)
      qc.invalidateQueries({ queryKey: ["escuta-msgs", slug] })
      if (r.crisis) qc.invalidateQueries({ queryKey: ["escuta", slug] })
    },
    onSettled: () => setPending(null),
  })
  const remove = useMutation({
    mutationFn: async () => (await client.listening.remove.$post({ slug })).json(),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ["escuta-msgs", slug] })
      qc.invalidateQueries({ queryKey: ["escuta", slug] })
    },
  })
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages.data, pending])

  const shell = (children: React.ReactNode) => (
    <div className="relative min-h-dvh overflow-hidden">
      <div aria-hidden="true" className="absolute left-1/2 top-[-240px] h-[480px] w-[700px] -translate-x-1/2 rounded-full bg-glow" />
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 py-6">
        <header className="flex items-center justify-between">
          <Logo />
          {status.data && <span className="max-w-[50%] truncate text-xs text-subtle">{status.data.companyName}</span>}
        </header>
        {children}
        <p className="text-center text-[11px] leading-relaxed text-subtle">Em emergência: CVV 188 (24 h, gratuito) · SAMU 192</p>
        <LegalLinks className="justify-center" />
      </div>
    </div>
  )

  if (status.isLoading) return shell(<div className="grid flex-1 place-items-center text-muted"><Spinner className="size-6" /></div>)
  if (status.isError || !status.data) return shell(<p className="flex-1 pt-20 text-center text-muted">Este endereço não existe.</p>)
  const s = status.data
  if (!s.available) {
    return shell(
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-2xl font-semibold">Espaço de escuta indisponível</h1>
        <p className="max-w-xs text-muted">Este recurso não está ativo nesta empresa. Se precisar conversar agora, ligue para o CVV no 188, a qualquer hora.</p>
      </div>
    )
  }

  if (!s.hasConversation) {
    return shell(
      <div className="flex flex-1 flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-xs text-brand-fg">Espaço de escuta</span>
          <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.03em]">Um lugar para falar do que está pesando no trabalho</h1>
        </div>
        <ul className="flex flex-col gap-2.5 rounded-2xl border border-brand/20 bg-brand/[0.05] p-4 text-sm leading-relaxed">
          <li>
            <strong>Sou uma inteligência artificial, não um psicólogo.</strong> Não faço terapia nem diagnóstico. Posso ouvir, dar informação e indicar onde buscar ajuda.
          </li>
          <li>
            <strong>Sua empresa não vê esta conversa</strong>, nem quem usou. Ela só vê temas gerais (como “carga de trabalho”) e só quando muitas pessoas usam.
          </li>
          <li>A conversa fica cifrada e ligada só a este aparelho. Você pode apagá-la a qualquer momento; sem uso, ela some em 90 dias.</li>
          <li>Em risco ou emergência, eu vou te indicar ajuda humana imediata (CVV 188, SAMU 192).</li>
          <li>Se você tem menos de 18 anos, procure um adulto de confiança ou o CVV.</li>
        </ul>
        <label className="flex items-start gap-3 rounded-xl border border-line-strong p-4 text-sm">
          <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>Li e concordo. Entendo que converso com uma IA e que isso não substitui atendimento profissional.</span>
        </label>
        <Button size="lg" className="mt-auto" disabled={!consent} loading={start.isPending} onClick={() => start.mutate()}>
          Começar
        </Button>
      </div>
    )
  }

  const list = messages.data ?? []
  return shell(
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center justify-between text-xs text-subtle">
        <span>IA de apoio · não é psicólogo · sua empresa não vê</span>
        <button type="button" className="underline hover:text-fg" onClick={() => confirm("Apagar toda a conversa deste aparelho? Não dá para desfazer.") && remove.mutate()}>
          Apagar conversa
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-2.5">
        {!list.length && !pending && (
          <div className="max-w-[86%] self-start rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-3 text-[15px] leading-relaxed">Oi. Este é um espaço para você falar do que está pesando no trabalho. O que está acontecendo?</div>
        )}
        {list.map((m) => (
          <div
            key={m.id}
            className={cn(
              "max-w-[86%] whitespace-pre-line rounded-2xl px-4 py-3 text-[15px] leading-relaxed",
              m.role === "user" ? "self-end rounded-br-md bg-brand text-brand-ink" : "self-start rounded-bl-md border border-line bg-surface"
            )}
          >
            {m.text}
          </div>
        ))}
        {pending && <div className="max-w-[86%] self-end rounded-2xl rounded-br-md bg-brand/70 px-4 py-3 text-[15px] text-brand-ink">{pending}</div>}
        {send.isPending && (
          <div className="flex items-center gap-2 self-start text-sm text-muted">
            <Spinner /> escrevendo…
          </div>
        )}
        {s.crisis && <CrisisCard />}
        {options.length > 0 && !send.isPending && (
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <button key={o} type="button" onClick={() => send.mutate(o)} className="rounded-full border border-brand/40 px-3 py-1.5 text-sm text-brand-fg">
                {o}
              </button>
            ))}
          </div>
        )}
        {send.error && <p className="text-sm text-risk-crit-fg">{send.error.message}</p>}
        <div ref={end} />
      </div>
      <form
        className="sticky bottom-3 flex items-end gap-2 rounded-2xl border border-line-strong bg-surface p-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) send.mutate(text.trim())
        }}
      >
        <textarea
          aria-label="Sua mensagem"
          rows={1}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              if (text.trim()) send.mutate(text.trim())
            }
          }}
          placeholder="Escreva aqui…"
          className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none"
        />
        <Button type="submit" size="sm" className="h-10" disabled={!text.trim() || send.isPending}>
          Enviar
        </Button>
      </form>
    </div>
  )
}
