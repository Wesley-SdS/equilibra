"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { PageHeader } from "@/components/app/page-header"
import { Button, Card, EmptyState, Field, Input, Select, Spinner, Textarea } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { client } from "@/lib/client"
import { useCan } from "@/lib/hooks"
import { cn } from "@/lib/utils"

const EMPTY = { name: "", email: "", phone: "", sectorId: "" }

export default function PeoplePage() {
  const can = useCan()
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState(EMPTY)
  const [bulk, setBulk] = useState("")
  const [showBulk, setShowBulk] = useState(false)
  const [search, setSearch] = useState("")

  const people = useQuery({ queryKey: ["employees"], queryFn: async () => (await client.employees.list.$get()).json() })
  const sectors = useQuery({ queryKey: ["sectors"], queryFn: async () => (await client.sectors.list.$get()).json() })
  const refresh = () => qc.invalidateQueries({ queryKey: ["employees"] })

  const create = useMutation({
    mutationFn: async () => (await client.employees.create.$post({ name: form.name, email: form.email || null, phone: form.phone || null, sectorId: form.sectorId || null })).json(),
    onSuccess: () => {
      setForm(EMPTY)
      refresh()
      toast("Pessoa cadastrada")
    },
    onError: (e) => toast(e.message, "error"),
  })
  const addBulk = useMutation({
    mutationFn: async () => (await client.employees.bulk.$post({ text: bulk })).json(),
    onSuccess: (r) => {
      setBulk("")
      setShowBulk(false)
      refresh()
      toast(`${r.added} pessoas cadastradas${r.duplicates ? `, ${r.duplicates} já existiam` : ""}${r.invalid ? `, ${r.invalid} linhas inválidas` : ""}`)
    },
    onError: (e) => toast(e.message, "error"),
  })
  const update = useMutation({
    mutationFn: async (v: { id: string; active?: boolean; sectorId?: string | null }) => (await client.employees.update.$post(v)).json(),
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: async (id: string) => (await client.employees.remove.$post({ id })).json(),
    onSuccess: () => {
      refresh()
      toast("Pessoa excluída")
    },
  })

  const rows = (people.data ?? []).filter((p) => !search || `${p.name} ${p.email ?? ""} ${p.sectorName ?? ""}`.toLowerCase().includes(search.toLowerCase()))

  return (
    <>
      <PageHeader
        title="Pessoas"
        description="Cadastro usado só em questionários identificados (pulsos de equipe, acompanhamento de ações) e para endereçar ações a um grupo. A avaliação NR-1 continua anônima e não usa esta lista."
        actions={can.edit ? <Button variant="secondary" onClick={() => setShowBulk((v) => !v)}>{showBulk ? "Fechar" : "Colar lista"}</Button> : undefined}
      />

      {showBulk && can.edit && (
        <Card className="mb-4 flex flex-col gap-3">
          <Field label="Uma pessoa por linha: nome; e-mail ou telefone; setor (opcional)" htmlFor="bulk" hint="O setor precisa ter o mesmo nome de um setor cadastrado. Quem já existe (mesmo e-mail ou telefone) é ignorado.">
            <Textarea id="bulk" className="min-h-40 font-mono text-sm" value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={"Ana Souza; ana@empresa.com; Produção\nBruno Lima; (11) 98765-4321; Entregas"} />
          </Field>
          <Button className="self-start" disabled={!bulk.trim()} loading={addBulk.isPending} onClick={() => addBulk.mutate()}>
            Cadastrar lista
          </Button>
        </Card>
      )}

      {can.edit && (
        <Card className="mb-4">
          <form
            className="grid gap-3 md:grid-cols-[1.4fr_1.2fr_1fr_1fr_auto] md:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              create.mutate()
            }}
          >
            <Field label="Nome" htmlFor="pname">
              <Input id="pname" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="E-mail" htmlFor="pemail">
              <Input id="pemail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="WhatsApp" htmlFor="pphone">
              <Input id="pphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 98765-4321" />
            </Field>
            <Field label="Setor" htmlFor="psector">
              <Select id="psector" value={form.sectorId} onChange={(e) => setForm({ ...form, sectorId: e.target.value })}>
                <option value="">Sem setor</option>
                {sectors.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" loading={create.isPending}>
              Adicionar
            </Button>
          </form>
        </Card>
      )}

      {people.isLoading ? (
        <div className="grid h-40 place-items-center text-muted">
          <Spinner />
        </div>
      ) : !people.data?.length ? (
        <EmptyState title="Nenhuma pessoa cadastrada" text="Cadastre as pessoas para lançar questionários identificados e acompanhar quem respondeu." />
      ) : (
        <Card className="overflow-x-auto">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-sm text-muted">
              {people.data.filter((p) => p.active).length} ativas · {people.data.length} no total
            </span>
            <Input aria-label="Buscar pessoa" className="h-9 w-60" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-line text-subtle">
              <tr>
                <th className="py-2 pr-4 font-medium">Nome</th>
                <th className="py-2 pr-4 font-medium">Contato</th>
                <th className="py-2 pr-4 font-medium">Setor</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((p) => (
                <tr key={p.id} className={cn(!p.active && "opacity-50")}>
                  <td className="py-2.5 pr-4">{p.name}</td>
                  <td className="py-2.5 pr-4 text-muted">{[p.email, p.phone && `+${p.phone}`].filter(Boolean).join(" · ")}</td>
                  <td className="py-2.5 pr-4">
                    <Select aria-label={`Setor de ${p.name}`} className="h-8 w-44 text-sm" disabled={!can.edit} value={p.sectorId ?? ""} onChange={(e) => update.mutate({ id: p.id, sectorId: e.target.value || null })}>
                      <option value="">Sem setor</option>
                      {sectors.data?.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="py-2.5 text-right">
                    {can.edit && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: p.id, active: !p.active })}>
                          {p.active ? "Desativar" : "Reativar"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => confirm(`Excluir ${p.name}? As respostas identificadas dessa pessoa deixam de ter nome.`) && remove.mutate(p.id)}>
                          Excluir
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}
