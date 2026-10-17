"use client"

import { AnimatePresence, motion } from "motion/react"
import { useRef, useState } from "react"
import { Button, Spinner } from "@/components/ui/primitives"
import { prepareImage, type PreparedImage } from "@/lib/image-prep"
import { cn, formatDate } from "@/lib/utils"

export type ThreadMessage = {
  id: string
  author: "reporter" | "hr" | "note"
  body: string
  day: string
  attachments: { id: string; mime: string; size: number }[]
}

/** Quem "sou eu" na conversa: o autor do relato vê as mensagens dele à direita; o RH, as suas. */
type Viewer = "reporter" | "hr"

const LABEL: Record<ThreadMessage["author"], string> = { reporter: "Autor do relato", hr: "RH", note: "Nota interna" }

function Bubble({ m, viewer, protocol }: { m: ThreadMessage; viewer: Viewer; protocol?: string }) {
  const mine = m.author === viewer || (viewer === "hr" && m.author === "note")
  const note = m.author === "note"
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex max-w-[88%] flex-col gap-1", mine ? "self-end items-end" : "self-start items-start")}
    >
      <span className="px-1 text-[11px] text-subtle">
        {viewer === "reporter" ? (m.author === "reporter" ? "Você" : "RH da empresa") : LABEL[m.author]} · {formatDate(m.day)}
      </span>
      <div
        className={cn(
          "whitespace-pre-line rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed",
          note
            ? "border border-dashed border-risk-mod-fg/40 bg-risk-mod/30 text-risk-mod-fg"
            : mine
              ? "rounded-br-md bg-brand text-brand-ink"
              : "rounded-bl-md border border-line bg-tint/[0.05] text-fg"
        )}
      >
        {m.body}
      </div>
      {m.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {m.attachments.map((a) => {
            const src = `/api/canal/anexo/${a.id}${protocol ? `?protocolo=${encodeURIComponent(protocol)}` : ""}`
            return (
              <a key={a.id} href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-line-strong">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="Imagem anexada" loading="lazy" className="size-28 object-cover transition-transform hover:scale-105" />
              </a>
            )
          })}
        </div>
      )}
    </motion.li>
  )
}

export function MessageList({ messages, viewer, protocol, empty }: { messages: ThreadMessage[]; viewer: Viewer; protocol?: string; empty: string }) {
  if (!messages.length) return <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">{empty}</p>
  return (
    <ul className="flex flex-col gap-3" aria-label="Mensagens da conversa">
      <AnimatePresence initial={false}>
        {messages.map((m) => (
          <Bubble key={m.id} m={m} viewer={viewer} protocol={protocol} />
        ))}
      </AnimatePresence>
    </ul>
  )
}

/** Campo de resposta com até 3 imagens. `onSend` recebe o texto e as imagens já reduzidas. */
export function Composer({
  onSend,
  sending,
  placeholder,
  hint,
  allowInternal,
}: {
  onSend: (v: { body: string; attachments: { data: string }[]; internal: boolean }) => Promise<unknown>
  sending: boolean
  placeholder: string
  hint?: string
  allowInternal?: boolean
}) {
  const [body, setBody] = useState("")
  const [images, setImages] = useState<PreparedImage[]>([])
  const [internal, setInternal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preparing, setPreparing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function pick(files: FileList | null) {
    if (!files?.length) return
    setError(null)
    setPreparing(true)
    try {
      const next: PreparedImage[] = []
      for (const f of Array.from(files).slice(0, 3 - images.length)) next.push(await prepareImage(f))
      setImages((cur) => [...cur, ...next].slice(0, 3))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao preparar a imagem")
    } finally {
      setPreparing(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        try {
          await onSend({ body, attachments: images.map((i) => ({ data: i.data })), internal })
          setBody("")
          setImages([])
        } catch (err) {
          setError(err instanceof Error ? err.message : "Não foi possível enviar")
        }
      }}
    >
      <label htmlFor="thread-body" className="sr-only">
        Mensagem
      </label>
      <textarea
        id="thread-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        maxLength={5000}
        required
        className="min-h-24 w-full rounded-xl border border-line-strong bg-tint/[0.03] px-3.5 py-3 text-[15px] placeholder:text-subtle focus:border-brand/60 focus:outline-none focus:ring-4 focus:ring-brand/10"
      />
      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Imagens a enviar">
          {images.map((img, i) => (
            <li key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.preview} alt={`Prévia de ${img.name}`} className="size-20 rounded-xl border border-line-strong object-cover" />
              <button
                type="button"
                aria-label={`Remover ${img.name}`}
                onClick={() => setImages((cur) => cur.filter((_, j) => j !== i))}
                className="absolute -right-2 -top-2 grid size-6 place-items-center rounded-full border border-line-strong bg-surface text-xs hover:bg-surface-2"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" id="thread-files" onChange={(e) => pick(e.target.files)} />
        <label
          htmlFor="thread-files"
          className={cn(
            "inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-line-strong px-3 text-sm text-muted transition-colors hover:text-fg",
            images.length >= 3 && "pointer-events-none opacity-50"
          )}
        >
          {preparing ? <Spinner /> : <span aria-hidden="true">＋</span>} Imagem ({images.length}/3)
        </label>
        {allowInternal && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="size-4 accent-[var(--brand-fg)]" />
            Nota interna (o autor não vê)
          </label>
        )}
        <Button type="submit" loading={sending} disabled={!body.trim() || preparing} className="ml-auto">
          {internal ? "Salvar nota" : "Enviar"}
        </Button>
      </div>
      {hint && <p className="text-xs leading-relaxed text-subtle">{hint}</p>}
      {error && <p className="text-sm text-risk-crit-fg">{error}</p>}
    </form>
  )
}
