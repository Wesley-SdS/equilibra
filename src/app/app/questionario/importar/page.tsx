"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useRef, useState } from "react"
import { PageHeader } from "@/components/app/page-header"
import { Button, ButtonLink, Card, Field, Input, Select, Spinner, Textarea } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { client } from "@/lib/client"
import { useCan } from "@/lib/hooks"
import { DIMENSIONS, type DimensionId } from "@/lib/methodology"
import { QUESTIONNAIRE_KINDS, type QuestionnaireKind } from "@/lib/questionnaire"
import { cn, formatDate } from "@/lib/utils"

const MAX_BYTES = 3 * 1024 * 1024

const DETECTED: Record<string, { label: string; cls: string }> = {
  likert5: { label: "Escala 1–5", cls: "bg-brand/10 text-brand-fg" },
  likert3: { label: "3 pontos → 1–5", cls: "bg-risk-mod/50 text-risk-mod-fg" },
  yesno: { label: "Sim/não → 1–5", cls: "bg-risk-mod/50 text-risk-mod-fg" },
  numeric: { label: "Numérica → 1–5", cls: "bg-risk-mod/50 text-risk-mod-fg" },
  question: { label: "Pergunta", cls: "bg-tint/[0.06] text-muted" },
  open: { label: "Aberta (ignorada)", cls: "bg-tint/[0.06] text-subtle" },
  sector: { label: "Setor", cls: "bg-brand/10 text-brand-fg" },
  identifier: { label: "Identifica pessoas", cls: "bg-risk-crit/15 text-risk-crit-fg" },
  timestamp: { label: "Data/hora (ignorada)", cls: "bg-tint/[0.06] text-subtle" },
}

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "")
    r.onerror = () => reject(new Error("Não foi possível ler o arquivo"))
    r.readAsDataURL(file)
  })
}

/** Passo 1: enviar arquivo ou colar texto. Também lista rascunhos para retomar. */
function Upload() {
  const router = useRouter()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [text, setText] = useState("")
  const [googleUrl, setGoogleUrl] = useState("")
  const params = useSearchParams()
  const google = useQuery({ queryKey: ["google-status"], queryFn: async () => (await client.imports.googleStatus.$get()).json() })
  useEffect(() => {
    const g = params.get("google")
    if (g === "conectado") toast("Conta Google conectada. Cole o link de edição do formulário.")
    else if (g === "negado" || g === "erro") toast("Não foi possível conectar a conta Google.", "error")
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avisa uma vez ao voltar do Google
  }, [])
  const isForms = googleUrl.includes("/forms/")
  const drafts = useQuery({ queryKey: ["imports"], queryFn: async () => (await client.imports.list.$get()).json() })
  const upload = useMutation({
    mutationFn: async (v: { filename: string; data?: string; text?: string; googleUrl?: string }) => (await client.imports.upload.$post(v)).json(),
    onSuccess: (r) => router.replace(`/app/questionario/importar?id=${r.id}`),
    onError: (e) => toast(e.message, "error"),
  })
  const send = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_BYTES) return toast("Arquivo grande demais (máximo de 3 MB).", "error")
    upload.mutate({ filename: file.name, data: await toBase64(file) })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr] [&>*]:min-w-0">
      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Enviar arquivo</h2>
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            send(e.dataTransfer.files[0])
          }}
          className={cn("flex min-h-44 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 text-center transition-colors", drag ? "border-brand bg-brand/5" : "border-line-strong hover:border-tint/30")}
        >
          {upload.isPending ? (
            <>
              <Spinner className="size-6" />
              <span className="text-sm text-muted">Lendo e classificando as perguntas…</span>
            </>
          ) : (
            <>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-brand-fg" aria-hidden="true">
                <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="font-medium">Arraste aqui ou clique para escolher</span>
              <span className="text-xs text-subtle">XLSX, CSV, PDF (inclusive escaneado) ou foto do questionário em papel · até 3 MB</span>
            </>
          )}
        </button>
        <input ref={input} type="file" accept=".xlsx,.xls,.ods,.csv,.tsv,.pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => send(e.target.files?.[0])} />
        <ul className="flex flex-col gap-1.5 text-xs text-muted">
          <li>• Planilha: a primeira linha deve ter as perguntas; as demais linhas, as respostas (opcional).</li>
          <li>• Colunas com nome, e-mail, CPF, matrícula ou telefone são descartadas na leitura e nunca gravadas.</li>
          <li>• Nada vira questionário antes de você revisar, corrigir e confirmar.</li>
          <li>• PDF escaneado e foto são lidos pelo copiloto de IA (contam na cota do plano).</li>
        </ul>
      </Card>

      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Importar do Google</h2>
          <Input aria-label="Link do Google Sheets ou do Google Forms" value={googleUrl} onChange={(e) => setGoogleUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/… ou /forms/d/…/edit" />
          <p className="text-xs text-subtle">
            {isForms
              ? google.data?.formsEnabled
                ? google.data.connected
                  ? "Conta Google conectada (somente leitura, por até 1 hora)."
                  : "Para ler o formulário e as respostas, conecte a conta Google dona do formulário (somente leitura)."
                : "A conexão direta com o Forms não está configurada. No Forms, abra Respostas → Vincular ao Planilhas e cole aqui o link da planilha."
              : "Planilha do Google Sheets compartilhada como “Qualquer pessoa com o link: leitor”. Também serve a planilha de respostas do Google Forms."}
          </p>
          <div className="flex flex-wrap gap-2">
            {isForms && google.data?.formsEnabled && !google.data.connected ? (
              <Button variant="secondary" size="sm" onClick={() => window.location.assign("/api/google/start")}>
                Conectar conta Google
              </Button>
            ) : (
              <Button variant="secondary" size="sm" disabled={!googleUrl.trim() || (isForms && !google.data?.connected)} loading={upload.isPending && !!googleUrl} onClick={() => upload.mutate({ filename: isForms ? "google-forms" : "google-sheets.csv", googleUrl: googleUrl.trim() })}>
                Importar do Google
              </Button>
            )}
          </div>
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Ou cole as perguntas</h2>
          <Textarea aria-label="Texto das perguntas" className="min-h-36" value={text} onChange={(e) => setText(e.target.value)} placeholder={"1. Recebo retorno claro sobre o meu trabalho.\n2. Tenho voz nas decisões que afetam a minha rotina."} />
          <Button variant="secondary" disabled={text.trim().length < 12} loading={upload.isPending && !!text} onClick={() => upload.mutate({ filename: "texto-colado.txt", text })}>
            Ler perguntas do texto
          </Button>
        </Card>
        {!!drafts.data?.length && (
          <Card className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Rascunhos em andamento</h2>
            {drafts.data.map((d) => (
              <Link key={d.id} href={`/app/questionario/importar?id=${d.id}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-tint/[0.04]">
                <span className="truncate">{d.filename}</span>
                <span className="shrink-0 text-xs text-subtle">{formatDate(new Date(d.createdAt).toISOString().slice(0, 10))}</span>
              </Link>
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}

type Imp = Awaited<ReturnType<Awaited<ReturnType<typeof client.imports.get.$get>>["json"]>>
type Row = Imp["rows"][number]

function ReviewRow({ row, editable, onChange }: { row: Row; editable: boolean; onChange: (v: { action?: "pending" | "accept" | "ignore"; final?: Row["final"] }) => void }) {
  const [text, setText] = useState(row.final.text)
  useEffect(() => setText(row.final.text), [row.final.text])
  const isQuestion = !["identifier", "timestamp", "sector", "open"].includes(row.detected)
  const det = DETECTED[row.detected] ?? DETECTED.question!
  const save = (patch: Partial<Row["final"]>, action?: "accept") => onChange({ final: { ...row.final, text, ...patch }, ...(action ? { action } : {}) })

  return (
    <tr className={cn(row.action === "ignore" && "opacity-55", row.action === "pending" && "bg-risk-mod/[0.06]", row.detected === "identifier" && "bg-risk-crit/[0.05]")}>
      <td className="py-3 pr-2 align-top font-mono text-xs text-subtle">{String(row.position + 1).padStart(2, "0")}</td>
      <td className="max-w-[220px] py-3 pr-3 align-top text-[13px] text-subtle">
        “{row.raw}”
        <span className={cn("mt-1.5 block w-fit rounded-full px-2 py-0.5 text-[11px]", det.cls)}>{det.label}</span>
      </td>
      <td className="py-3 pr-3 align-top">
        {isQuestion ? (
          <div className="flex flex-col gap-2">
            {editable ? (
              <Input aria-label={`Texto da pergunta ${row.position + 1}`} value={text} maxLength={200} onChange={(e) => setText(e.target.value)} onBlur={() => text !== row.final.text && save({ text })} />
            ) : (
              <p className="text-sm">{row.final.text}</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Select aria-label="Dimensão" className="h-9 w-52 text-sm" disabled={!editable} value={row.final.dimension ?? ""} onChange={(e) => save({ dimension: (e.target.value || null) as DimensionId | null })}>
                <option value="">Fora do score</option>
                {DIMENSIONS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
              {row.final.dimension && (
                <div className="flex overflow-hidden rounded-lg border border-line text-xs">
                  {[
                    { v: true, l: "Risco" },
                    { v: false, l: "Proteção" },
                  ].map((o) => (
                    <button key={o.l} type="button" disabled={!editable} onClick={() => save({ risk: o.v })} className={cn("px-2.5 py-1.5", row.final.risk === o.v ? "bg-tint/[0.1] text-fg" : "text-muted hover:text-fg")}>
                      {o.l}
                    </button>
                  ))}
                </div>
              )}
              <span className="font-mono text-xs text-subtle" title={`Classificado por ${row.engine === "jev" ? "Jev" : row.engine === "metodologia" ? "semelhança com a metodologia" : "regras"}`}>
                <span className="mr-1.5 inline-block h-1.5 w-10 overflow-hidden rounded-full bg-tint/[0.08] align-middle">
                  <span className={cn("block h-full rounded-full", row.confidence >= 70 ? "bg-brand" : "bg-risk-mod-fg")} style={{ width: `${row.confidence}%` }} />
                </span>
                {row.confidence}%
              </span>
            </div>
          </div>
        ) : null}
        {row.issues.map((i) => (
          <p key={i} className={cn("mt-1.5 text-xs", row.detected === "identifier" ? "text-risk-crit-fg" : "text-risk-mod-fg")}>
            {i}
          </p>
        ))}
      </td>
      <td className="py-3 align-top">
        {isQuestion && editable && (
          <div className="flex flex-col gap-1.5">
            <Button size="sm" variant={row.action === "accept" ? "primary" : "secondary"} onClick={() => onChange({ action: "accept", final: { ...row.final, text } })}>
              {row.action === "accept" ? "Aceita" : "Aceitar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onChange({ action: row.action === "ignore" ? "pending" : "ignore" })}>
              {row.action === "ignore" ? "Desfazer" : "Ignorar"}
            </Button>
          </div>
        )}
      </td>
    </tr>
  )
}

function Review({ id }: { id: string }) {
  const can = useCan()
  const qc = useQueryClient()
  const toast = useToast()
  const router = useRouter()
  const imp = useQuery({ queryKey: ["import", id], queryFn: async () => (await client.imports.get.$get({ id })).json() })
  const refresh = () => qc.invalidateQueries({ queryKey: ["import", id] })
  const updateRow = useMutation({
    mutationFn: async (v: { id: string; action?: "pending" | "accept" | "ignore"; final?: Row["final"] }) => (await client.imports.updateRow.$post(v)).json(),
    onSuccess: refresh,
    onError: (e) => toast(e.message, "error"),
  })
  const update = useMutation({
    mutationFn: async (v: Omit<Parameters<typeof client.imports.update.$post>[0], "importId">) => (await client.imports.update.$post({ importId: id, ...v })).json(),
    onSuccess: refresh,
    onError: (e) => toast(e.message, "error"),
  })
  const acceptAll = useMutation({
    mutationFn: async (min: number) => (await client.imports.acceptAll.$post({ importId: id, min })).json(),
    onSuccess: (r) => {
      refresh()
      toast(r.accepted ? `${r.accepted} perguntas aceitas` : "Nenhuma pendente acima desse nível de confiança")
    },
  })
  const confirm = useMutation({
    mutationFn: async () => (await client.imports.confirm.$post({ importId: id })).json(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["questionnaires"] })
      qc.invalidateQueries({ queryKey: ["campaigns"] })
      toast(r.campaignId ? `Questionário criado e ${r.responses} respostas importadas` : "Questionário criado")
      router.push("/app/questionario")
    },
    onError: (e) => toast(e.message, "error"),
  })
  const discard = useMutation({
    mutationFn: async () => (await client.imports.discard.$post({ importId: id })).json(),
    onSuccess: () => router.push("/app/questionario"),
  })

  if (imp.isLoading) {
    return (
      <div className="grid h-60 place-items-center text-muted">
        <Spinner className="size-6" />
      </div>
    )
  }
  if (!imp.data) return <p className="text-muted">Importação não encontrada.</p>
  const d = imp.data
  const editable = can.edit && d.status === "draft"
  const questions = d.rows.filter((r) => !["identifier", "timestamp", "sector", "open"].includes(r.detected))
  const accepted = questions.filter((r) => r.action === "accept").length
  const pending = questions.filter((r) => r.action === "pending").length
  const hasSectorColumn = d.rows.some((r) => r.action === "sector")
  const withResponses = d.responseCount > 0

  return (
    <>
      {d.status !== "draft" && (
        <Card className="mb-4 border-brand/30">
          <p className="text-sm">Esta importação já foi {d.status === "confirmed" ? "confirmada" : "descartada"}.</p>
        </Card>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{d.filename}</span>
        <span className="text-subtle">· {d.rows.length} colunas · {d.responseCount} respostas</span>
        <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs text-brand-fg">{accepted} aceitas</span>
        {pending > 0 && <span className="rounded-full bg-risk-mod/50 px-2.5 py-0.5 text-xs text-risk-mod-fg">{pending} para conferir</span>}
        {d.dropped.length > 0 && <span className="rounded-full bg-risk-crit/15 px-2.5 py-0.5 text-xs text-risk-crit-fg">{d.dropped.length} colunas identificáveis descartadas</span>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="overflow-x-auto">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">1. Revisar e corrigir</h2>
                <p className="text-sm text-muted">Original à esquerda, resultado à direita. Corrija o texto, a dimensão e a polaridade na hora.</p>
              </div>
              {editable && (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" loading={acceptAll.isPending} onClick={() => acceptAll.mutate(90)}>
                    Aceitar todas ≥ 90%
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => acceptAll.mutate(0)}>
                    Aceitar todas
                  </Button>
                </div>
              )}
            </div>
            <table className="w-full min-w-[720px] text-left">
              <thead className="border-b border-line text-xs text-subtle">
                <tr>
                  <th className="py-2 pr-2 font-medium">#</th>
                  <th className="py-2 pr-3 font-medium">Coluna original</th>
                  <th className="py-2 pr-3 font-medium">Pergunta no questionário</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.rows.map((r) => (
                  <ReviewRow key={r.id} row={r} editable={editable} onChange={(v) => updateRow.mutate({ id: r.id, ...v })} />
                ))}
              </tbody>
            </table>
          </Card>

          {withResponses && (
            <Card className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">2. Respostas, setores e período</h2>
                  <p className="text-sm text-muted">As {d.responseCount} respostas viram uma campanha histórica encerrada, marcada como importada.</p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={!editable} checked={d.importResponses} onChange={(e) => update.mutate({ importResponses: e.target.checked })} />
                  Importar as respostas
                </label>
              </div>
              {d.importResponses && (
                <>
                  {hasSectorColumn ? (
                    <div className="flex flex-col gap-2">
                      {d.sectorValues.map((v) => {
                        const current = d.sectorMap[v.value] ?? null
                        return (
                          <div key={v.value} className="grid items-center gap-3 sm:grid-cols-[1fr_auto_260px]">
                            <span className="text-sm">
                              “{v.value}” <span className="text-subtle">· {v.count} respostas</span>
                            </span>
                            <span className="text-subtle">→</span>
                            <Select aria-label={`Setor para ${v.value}`} disabled={!editable} className={cn("h-9 text-sm", !current && "border-risk-mod-fg")} value={current ?? ""} onChange={(e) => update.mutate({ sectorMap: { [v.value]: e.target.value || null } })}>
                              <option value="">Escolha…</option>
                              {d.sectors.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                              <option value="new">Criar setor “{v.value}”</option>
                              <option value="skip">Não importar estas respostas</option>
                            </Select>
                          </div>
                        )
                      })}
                      {editable && d.sectorValues.some((v) => v.guess && !d.sectorMap[v.value]) && (
                        <Button size="sm" variant="ghost" className="self-start" onClick={() => update.mutate({ sectorMap: Object.fromEntries(d.sectorValues.filter((v) => v.guess && !d.sectorMap[v.value]).map((v) => [v.value, v.guess])) })}>
                          Usar os setores com o mesmo nome
                        </Button>
                      )}
                    </div>
                  ) : null}
                  {(!hasSectorColumn || d.noSectorCount > 0) && (
                    <Field label={hasSectorColumn ? `Setor das ${d.noSectorCount} respostas sem setor` : "O arquivo não tem coluna de setor. Setor das respostas"} htmlFor="isector">
                      <Select id="isector" disabled={!editable} value={d.defaultSectorId ?? ""} onChange={(e) => update.mutate({ defaultSectorId: e.target.value || null })}>
                        <option value="">Escolha…</option>
                        {d.sectors.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="A pesquisa original começou em" htmlFor="istart">
                      <Input id="istart" type="date" disabled={!editable} value={d.startsAt ?? ""} onChange={(e) => update.mutate({ startsAt: e.target.value || null })} />
                    </Field>
                    <Field label="E terminou em" htmlFor="iend">
                      <Input id="iend" type="date" disabled={!editable} value={d.endsAt ?? ""} onChange={(e) => update.mutate({ endsAt: e.target.value || null })} />
                    </Field>
                  </div>
                </>
              )}
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4 xl:sticky xl:top-6 xl:self-start">
          <Card className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">{withResponses ? "3." : "2."} O que vai nascer</h2>
            <Field label="Nome do questionário" htmlFor="iname">
              <Input id="iname" disabled={!editable} defaultValue={d.name} key={d.name} maxLength={80} onBlur={(e) => e.target.value.trim() !== d.name && e.target.value.trim().length >= 3 && update.mutate({ name: e.target.value.trim() })} />
            </Field>
            <Field label="Tipo" htmlFor="ikind" hint={QUESTIONNAIRE_KINDS.find((k) => k.id === d.kind)?.description}>
              <Select id="ikind" disabled={!editable} value={d.kind} onChange={(e) => update.mutate({ kind: e.target.value as QuestionnaireKind })}>
                {QUESTIONNAIRE_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Itens</span>
                <span className="font-mono">
                  {accepted} · {questions.filter((r) => r.action === "accept" && r.final.dimension).length} no score
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Anonimato</span>
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand-fg">Anônimo</span>
              </div>
              {withResponses && d.importResponses && (
                <div className="flex justify-between">
                  <span className="text-muted">Respostas importáveis</span>
                  <span className="font-mono">
                    {d.importable}
                    {d.skipped > 0 && <span className="text-subtle"> (+{d.skipped} vazias)</span>}
                  </span>
                </div>
              )}
            </div>
          </Card>
          <Card className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Validações</h2>
            {d.validation.blocking.length === 0 && <p className="text-sm text-risk-low-fg">Tudo certo para confirmar.</p>}
            <ul className="flex flex-col gap-1.5 text-sm">
              {d.validation.blocking.map((b) => (
                <li key={b} className="text-risk-mod-fg">
                  • {b}
                </li>
              ))}
              {d.validation.warnings.map((w) => (
                <li key={w} className="text-muted">
                  • {w}
                </li>
              ))}
            </ul>
            {editable && (
              <div className="mt-2 flex flex-col gap-2">
                <Button disabled={d.validation.blocking.length > 0} loading={confirm.isPending} onClick={() => confirm.mutate()}>
                  Confirmar importação
                </Button>
                <Button variant="ghost" size="sm" onClick={() => window.confirm("Descartar esta importação? Os dados lidos do arquivo serão apagados.") && discard.mutate()}>
                  Descartar
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}

function ImportContent() {
  const id = useSearchParams().get("id")
  return (
    <>
      <Link href="/app/questionario" className="mb-4 inline-block text-sm text-muted hover:text-fg">
        ← Questionários
      </Link>
      <PageHeader
        title="Importar formulário"
        description="Traga o questionário que a empresa já usa: planilha, exportação do Google Forms, PDF ou texto. Confira o que foi reconhecido, corrija na hora e confirme."
        actions={id ? <ButtonLink href="/app/questionario/importar" variant="secondary">Novo arquivo</ButtonLink> : undefined}
      />
      {id ? <Review id={id} /> : <Upload />}
    </>
  )
}

export default function ImportPage() {
  return (
    <Suspense>
      <ImportContent />
    </Suspense>
  )
}
