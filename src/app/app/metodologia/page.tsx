"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { PageHeader } from "@/components/app/page-header"
import { Button, Card, Field, Select, Spinner, Textarea } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { client } from "@/lib/client"
import { useCan } from "@/lib/hooks"
import { DIMENSIONS, type DimensionId } from "@/lib/methodology"
import type { MethodologyId } from "@/lib/methodologies"
import { cn } from "@/lib/utils"

export default function MethodologyPage() {
  const can = useCan()
  const qc = useQueryClient()
  const toast = useToast()
  const data = useQuery({ queryKey: ["methodology"], queryFn: async () => (await client.company.methodology.$get()).json() })
  const library = useQuery({ queryKey: ["questionnaires"], queryFn: async () => (await client.questionnaires.list.$get()).json() })
  const [selected, setSelected] = useState<MethodologyId>("equilibra")
  const [note, setNote] = useState("")
  const [questionnaireId, setQuestionnaireId] = useState<string>("")
  const [severity, setSeverity] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!data.data) return
    setSelected(data.data.current.id)
    setNote(data.data.current.note)
    setQuestionnaireId(data.data.current.customQuestionnaireId ?? "")
    setSeverity(data.data.current.severity)
  }, [data.data])

  const save = useMutation({
    mutationFn: async () => (await client.company.setMethodology.$post({ id: selected, note, questionnaireId: selected === "propria" ? questionnaireId || null : null, severity })).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["methodology"] })
      toast("Metodologia salva. Vale para as próximas campanhas NR-1.")
    },
    onError: (e) => toast(e.message, "error"),
  })

  if (data.isLoading || !data.data) {
    return (
      <div className="grid h-80 place-items-center text-muted">
        <Spinner className="size-6" />
      </div>
    )
  }
  const catalog = data.data.catalog
  const chosen = catalog.find((m) => m.id === selected)!
  const nr1Questionnaires = (library.data ?? []).filter((q) => q.kind === "nr1" && q.status === "active")

  return (
    <>
      <PageHeader
        title="Metodologia"
        description="A NR-1 não impõe um instrumento: a empresa escolhe uma metodologia tecnicamente fundamentada e registra a justificativa. A escolha define o questionário padrão das campanhas NR-1, a severidade do inventário e o texto da metodologia no relatório PGR."
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {catalog.map((m) => {
          const on = m.id === selected
          const current = m.id === data.data.current.id
          return (
            <button
              key={m.id}
              type="button"
              disabled={!can.edit || m.status !== "disponivel"}
              onClick={() => {
                setSelected(m.id)
                setSeverity(m.id === data.data.current.id ? data.data.current.severity : m.severity)
                if (m.id !== data.data.current.id) setNote(m.id === "propria" ? "" : m.justification)
              }}
              className={cn("flex flex-col gap-2 rounded-2xl border p-4 text-left transition-colors disabled:cursor-default", on ? "border-brand bg-brand/[0.06]" : "border-line bg-surface hover:border-line-strong", m.status !== "disponivel" && "opacity-60")}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold leading-snug">{m.name}</span>
                {current ? (
                  <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-[11px] text-brand-fg">Em uso</span>
                ) : m.status === "licenca" ? (
                  <span className="shrink-0 rounded-full bg-risk-mod/50 px-2 py-0.5 text-[11px] text-risk-mod-fg">Aguardando licença</span>
                ) : null}
              </div>
              <span className="text-xs text-subtle">{m.source}</span>
              <span className="text-sm leading-relaxed text-muted">{m.description}</span>
            </button>
          )
        })}
      </div>

      <Card className="mt-4 flex flex-col gap-5">
        <div>
          <h2 className="text-lg font-semibold">{chosen.name}</h2>
          <p className="text-sm text-muted">Ajuste a justificativa técnica e a severidade de cada dimensão. Campanhas já lançadas mantêm a metodologia com que foram criadas.</p>
        </div>
        {selected === "propria" && (
          <Field label="Questionário da metodologia" htmlFor="mq" hint="Crie ou importe o instrumento da sua consultoria em Questionários (tipo NR-1, anônimo) e escolha-o aqui.">
            <Select id="mq" disabled={!can.edit} value={questionnaireId} onChange={(e) => setQuestionnaireId(e.target.value)}>
              <option value="">Escolha…</option>
              {nr1Questionnaires.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name} · {q.itemCount} itens
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Justificativa técnica (vai para o relatório PGR)" htmlFor="mnote" hint={selected === "propria" ? "Descreva o instrumento, quem o desenvolveu, a validação e por que é adequado à empresa." : "Texto-base da metodologia; edite para refletir a realidade da empresa."}>
          <Textarea id="mnote" className="min-h-28" disabled={!can.edit} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div>
          <h3 className="mb-1 text-sm font-medium">Severidade por dimensão (1 a 5)</h3>
          <p className="mb-3 text-xs text-subtle">O inventário classifica cada risco como probabilidade (do score) × severidade. Ajuste com o responsável técnico conforme a realidade da empresa.</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {DIMENSIONS.map((d) => (
              <label key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                <span>{d.short}</span>
                <Select aria-label={`Severidade de ${d.name}`} className="h-8 w-16 text-sm" disabled={!can.edit} value={severity[d.id] ?? chosen.severity[d.id as DimensionId]} onChange={(e) => setSeverity((s) => ({ ...s, [d.id]: Number(e.target.value) }))}>
                  {[1, 2, 3, 4, 5].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              </label>
            ))}
          </div>
        </div>
        {can.edit && (
          <Button className="self-start" loading={save.isPending} onClick={() => save.mutate()}>
            Salvar metodologia
          </Button>
        )}
      </Card>
    </>
  )
}
