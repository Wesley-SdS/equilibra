"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { PageHeader } from "@/components/app/page-header"
import { Button, Card, Field, Input, RiskBadge, Spinner } from "@/components/ui/primitives"
import { client } from "@/lib/client"
import { ROLE_LABEL, useMe } from "@/lib/hooks"
import { cn, formatCnpj, formatDate } from "@/lib/utils"

function PortfolioContent() {
  const qc = useQueryClient()
  const router = useRouter()
  const me = useMe()
  const [open, setOpen] = useState(useSearchParams().get("nova") === "1")
  const [form, setForm] = useState({ companyName: "", cnpj: "", employees: "" })
  const [sort, setSort] = useState<"risk" | "name">("risk")

  const portfolio = useQuery({ queryKey: ["portfolio"], queryFn: async () => (await client.insights.portfolio.$get()).json() })
  const switchCompany = useMutation({
    mutationFn: async (companyId: string) => (await client.auth.switchCompany.$post({ companyId })).json(),
    onSuccess: () => {
      qc.clear()
      router.push("/app")
    },
  })
  const create = useMutation({
    mutationFn: async () => (await client.auth.createCompany.$post({ ...form, employees: Number(form.employees) })).json(),
    onSuccess: () => {
      qc.clear()
      router.push("/app/setores?novo=1")
    },
  })

  const rows = [...(portfolio.data ?? [])].sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : (b.index ?? -1) - (a.index ?? -1)))
  const total = rows.length
  const withAlerts = rows.filter((r) => r.alerts > 0).length
  const noCampaign = rows.filter((r) => !r.campaign).length
  const openActions = rows.reduce((s, r) => s + r.openActions, 0)

  return (
    <>
      <PageHeader
        title="Carteira"
        description="Todas as empresas que você acompanha. Ideal para contadores e consultorias de SST."
        actions={<Button onClick={() => setOpen((v) => !v)}>{open ? "Cancelar" : "Adicionar empresa"}</Button>}
      />

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Card className="mb-4">
              <form
                className="grid gap-4 md:grid-cols-[2fr_1.2fr_1fr_auto] md:items-end"
                onSubmit={(e) => {
                  e.preventDefault()
                  create.mutate()
                }}
              >
                <Field label="Nome da empresa cliente" htmlFor="pname">
                  <Input id="pname" required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
                </Field>
                <Field label="CNPJ" htmlFor="pcnpj">
                  <Input id="pcnpj" required inputMode="numeric" placeholder="00.000.000/0000-00" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: formatCnpj(e.target.value) })} />
                </Field>
                <Field label="Funcionários" htmlFor="pemp">
                  <Input id="pemp" required type="number" min={1} value={form.employees} onChange={(e) => setForm({ ...form, employees: e.target.value })} />
                </Field>
                <Button type="submit" loading={create.isPending}>
                  Adicionar e abrir
                </Button>
              </form>
              {create.error && <p className="mt-3 text-sm text-risk-crit-fg">{create.error.message}</p>}
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Empresas", value: total, note: "na carteira" },
          { label: "Com risco alto/crítico", value: withAlerts, note: "precisam de ação", tone: withAlerts ? "text-risk-high-fg" : "" },
          { label: "Sem avaliação", value: noCampaign, note: "ainda não começaram", tone: noCampaign ? "text-risk-mod-fg" : "" },
          { label: "Ações em aberto", value: openActions, note: "somando todas" },
        ].map((k, i) => (
          <motion.div key={k.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="flex flex-col gap-1">
              <span className="text-sm text-subtle">{k.label}</span>
              <span className={cn("text-4xl font-semibold tracking-tight", k.tone)}>{k.value}</span>
              <span className="text-sm text-muted">{k.note}</span>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="mt-4 overflow-x-auto p-0 sm:p-0">
        <div className="flex items-center justify-between gap-3 px-5 pt-5 sm:px-6">
          <h2 className="text-lg font-semibold">Empresas</h2>
          <div className="flex gap-1 rounded-lg border border-line p-1 text-xs" role="group" aria-label="Ordenar">
            {(["risk", "name"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={sort === s} onClick={() => setSort(s)} className={cn("rounded-md px-2.5 py-1", sort === s ? "bg-tint/[0.08] text-fg" : "text-muted")}>
                {s === "risk" ? "Maior risco" : "Nome"}
              </button>
            ))}
          </div>
        </div>
        {portfolio.isLoading ? (
          <div className="grid h-40 place-items-center text-muted">
            <Spinner />
          </div>
        ) : (
          <table className="mt-4 w-full min-w-[820px] text-left text-sm">
            <thead className="border-y border-line text-subtle">
              <tr>
                <th className="px-6 py-3 font-medium">Empresa</th>
                <th className="py-3 pr-4 font-medium">Última campanha</th>
                <th className="py-3 pr-4 font-medium">Resposta</th>
                <th className="py-3 pr-4 font-medium">Índice</th>
                <th className="py-3 pr-4 font-medium">Alertas</th>
                <th className="py-3 pr-4 font-medium">Ações abertas</th>
                <th className="py-3 pr-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const current = r.id === me.data?.company.id
                return (
                  <tr key={r.id} className="transition-colors hover:bg-tint/[0.02]">
                    <td className="px-6 py-3.5">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-subtle">
                        {r.employees} funcionários · {ROLE_LABEL[r.role]}
                      </p>
                    </td>
                    <td className="py-3.5 pr-4">
                      {r.campaign ? (
                        <>
                          <p className="truncate">{r.campaign.name}</p>
                          <p className="text-xs text-subtle">
                            {r.campaign.status === "active" ? "Ativa" : "Encerrada"} · até {formatDate(r.campaign.endsAt)}
                          </p>
                        </>
                      ) : (
                        <span className="text-subtle">Nenhuma</span>
                      )}
                    </td>
                    <td className="py-3.5 pr-4 font-mono">{r.campaign ? `${r.rate}%` : "—"}</td>
                    <td className="py-3.5 pr-4">
                      {r.index === null ? (
                        <span className="text-subtle">—</span>
                      ) : (
                        <span className="flex items-center gap-2 font-mono">
                          {r.index} <RiskBadge score={r.index} />
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 pr-4 font-mono">{r.alerts}</td>
                    <td className="py-3.5 pr-4 font-mono">{r.openActions}</td>
                    <td className="py-3.5 pr-6 text-right">
                      {current ? (
                        <span className="text-xs text-brand-fg">Empresa atual</span>
                      ) : (
                        <Button size="sm" variant="secondary" loading={switchCompany.isPending && switchCompany.variables === r.id} onClick={() => switchCompany.mutate(r.id)}>
                          Abrir
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}

export default function PortfolioPage() {
  return (
    <Suspense>
      <PortfolioContent />
    </Suspense>
  )
}
