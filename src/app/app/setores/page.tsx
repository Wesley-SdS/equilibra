"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { PageHeader } from "@/components/app/page-header"
import { Button, ButtonLink, Card, Field, Input, Spinner } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { client } from "@/lib/client"
import { K_ANONYMITY } from "@/lib/methodology"

function SectorsContent() {
  const qc = useQueryClient()
  const toast = useToast()
  const isNew = useSearchParams().get("novo") === "1"
  const [name, setName] = useState("")
  const [headcount, setHeadcount] = useState("")

  const sectors = useQuery({
    queryKey: ["sectors"],
    queryFn: async () => (await client.sectors.list.$get()).json(),
  })
  const create = useMutation({
    mutationFn: async () => (await client.sectors.create.$post({ name, headcount: Number(headcount) })).json(),
    onSuccess: () => {
      setName("")
      setHeadcount("")
      qc.invalidateQueries({ queryKey: ["sectors"] })
    },
  })
  const remove = useMutation({
    mutationFn: async (id: string) => (await client.sectors.remove.$post({ id })).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sectors"] })
      toast("Setor removido")
    },
  })

  const total = sectors.data?.reduce((s, x) => s + x.headcount, 0) ?? 0

  return (
    <>
      <PageHeader
        title="Setores"
        description="Os resultados são calculados por setor. Use as áreas reais da empresa; setores pequenos são agrupados automaticamente."
      />
      {isNew && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6 rounded-2xl border border-brand/25 bg-brand/[0.06] p-4 text-sm">
          Conta criada. Passo 1 de 2: cadastre os setores da empresa. Depois, lance a primeira campanha.
        </motion.div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card className="self-start">
          <h2 className="mb-4 text-lg font-semibold">Novo setor</h2>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              create.mutate()
            }}
          >
            <Field label="Nome do setor" htmlFor="sname">
              <Input id="sname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Produção" required />
            </Field>
            <Field label="Pessoas no setor" htmlFor="shead" hint={`Setores com menos de ${K_ANONYMITY} respostas aparecem agrupados.`}>
              <Input id="shead" type="number" min={1} value={headcount} onChange={(e) => setHeadcount(e.target.value)} required />
            </Field>
            {create.error && <p className="text-sm text-risk-crit-fg">{create.error.message}</p>}
            <Button type="submit" loading={create.isPending}>
              Adicionar setor
            </Button>
          </form>
        </Card>
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Setores cadastrados</h2>
            <span className="font-mono text-sm text-muted">{total} pessoas</span>
          </div>
          {sectors.isLoading ? (
            <div className="grid h-32 place-items-center text-muted">
              <Spinner />
            </div>
          ) : sectors.data?.length ? (
            <ul className="flex flex-col divide-y divide-line">
              <AnimatePresence initial={false}>
                {sectors.data.map((s) => (
                  <motion.li
                    key={s.id}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-sm text-subtle">{s.headcount} pessoas</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Remover o setor “${s.name}”? As respostas dele também serão apagadas.`)) remove.mutate(s.id)
                      }}
                    >
                      Remover
                    </Button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-muted">Nenhum setor ainda.</p>
          )}
          {!!sectors.data?.length && (
            <ButtonLink href="/app/campanhas" variant="secondary" className="mt-4 w-full">
              Próximo: lançar campanha →
            </ButtonLink>
          )}
        </Card>
      </div>
    </>
  )
}

export default function SectorsPage() {
  return (
    <Suspense>
      <SectorsContent />
    </Suspense>
  )
}
