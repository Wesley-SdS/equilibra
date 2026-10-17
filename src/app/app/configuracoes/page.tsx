"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import { PageHeader } from "@/components/app/page-header"
import { Button, Card, Field, Input, Select, Spinner } from "@/components/ui/primitives"
import { useToast } from "@/components/ui/toast"
import { JevBadge } from "@/components/app/jev-badge"
import { client } from "@/lib/client"
import { ROLE_LABEL, useCan, useMe } from "@/lib/hooks"
import { cn, formatCnpj } from "@/lib/utils"
import { formatLegalVersion } from "@/lib/legal"
import Link from "next/link"

const TABS = [
  { id: "empresa", label: "Empresa" },
  { id: "equipe", label: "Equipe" },
  { id: "seguranca", label: "Segurança" },
  { id: "auditoria", label: "Auditoria" },
  { id: "privacidade", label: "Privacidade e dados" },
] as const
type Tab = (typeof TABS)[number]["id"]

function SettingsContent() {
  const params = useSearchParams()
  const router = useRouter()
  const initial = (params.get("aba") as Tab) ?? "empresa"
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.id === initial) ? initial : "empresa")

  return (
    <>
      <PageHeader title="Configurações" description="Dados da empresa, pessoas com acesso, segurança da conta e histórico de alterações." />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id)
              router.replace(`/app/configuracoes?aba=${t.id}`, { scroll: false })
            }}
            className={cn("relative px-4 py-3 text-sm font-medium transition-colors", tab === t.id ? "text-fg" : "text-muted hover:text-fg")}
          >
            {t.label}
            {tab === t.id && <motion.span layoutId="settings-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
          {tab === "empresa" && <CompanyTab />}
          {tab === "equipe" && <TeamTab />}
          {tab === "seguranca" && <SecurityTab />}
          {tab === "auditoria" && <AuditTab />}
          {tab === "privacidade" && <PrivacyTab />}
        </motion.div>
      </AnimatePresence>
    </>
  )
}

function CompanyTab() {
  const me = useMe()
  const can = useCan()
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState({ name: "", cnpj: "", employees: "" })
  useEffect(() => {
    if (me.data) setForm({ name: me.data.company.name, cnpj: formatCnpj(me.data.company.cnpj), employees: String(me.data.company.employees) })
  }, [me.data])
  const save = useMutation({
    mutationFn: async () => (await client.company.update.$post({ ...form, employees: Number(form.employees) })).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] })
      toast("Dados da empresa salvos")
    },
  })
  const channelUrl = me.data && typeof window !== "undefined" ? `${window.location.origin}/canal/${me.data.company.slug}` : ""

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <h2 className="mb-5 text-lg font-semibold">Dados da empresa</h2>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <Field label="Razão social" htmlFor="cname">
            <Input id="cname" disabled={!can.manage} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="CNPJ" htmlFor="ccnpj">
              <Input id="ccnpj" disabled={!can.manage} value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: formatCnpj(e.target.value) })} />
            </Field>
            <Field label="Funcionários" htmlFor="cemp">
              <Input id="cemp" type="number" min={1} disabled={!can.manage} value={form.employees} onChange={(e) => setForm({ ...form, employees: e.target.value })} />
            </Field>
          </div>
          {save.error && <p className="text-sm text-risk-crit-fg">{save.error.message}</p>}
          {can.manage ? (
            <Button type="submit" loading={save.isPending} className="self-start">
              Salvar alterações
            </Button>
          ) : (
            <p className="text-sm text-subtle">Apenas o dono da conta pode alterar estes dados.</p>
          )}
        </form>
      </Card>
      <div className="flex flex-col gap-4 self-start">
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Decisões automáticas</h2>
          <JevBadge decision={{ engine: me.data?.jev ? "jev" : "regras" }} label={me.data?.jev ? "Jev ativo" : "Regras locais"} />
        </div>
        <p className="text-sm text-muted">
          Triagem do canal de relato, escolha das ações do plano e classificação das perguntas da empresa usam o <strong className="text-fg">Jev</strong>, modelo de decisão da
          TypeSafe, pelo Vercel AI Gateway. O score de risco da NR-1 não usa IA: é calculado pela metodologia, de forma auditável.
        </p>
        {!me.data?.jev && <p className="text-xs text-subtle">Configure AI_GATEWAY_API_KEY (ou faça o deploy na Vercel) para ativar.</p>}
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Links públicos</h2>
        <p className="text-sm text-muted">O canal de relato fica disponível o tempo todo, independente de campanha.</p>
        <code className="break-all rounded-lg bg-tint/[0.04] px-3 py-2 font-mono text-xs text-muted">{channelUrl}</code>
        <Button
          variant="secondary"
          onClick={() => {
            navigator.clipboard.writeText(channelUrl)
            toast("Link do canal copiado")
          }}
        >
          Copiar link do canal
        </Button>
      </Card>
      </div>
    </div>
  )
}

function TeamTab() {
  const can = useCan()
  const qc = useQueryClient()
  const toast = useToast()
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"admin" | "viewer">("viewer")
  const [lastLink, setLastLink] = useState<string | null>(null)
  const [lastSent, setLastSent] = useState(false)
  const team = useQuery({ queryKey: ["team"], queryFn: async () => (await client.team.list.$get()).json() })
  const refresh = () => qc.invalidateQueries({ queryKey: ["team"] })

  const invite = useMutation({
    mutationFn: async () => (await client.team.invite.$post({ email, role })).json(),
    onSuccess: (r) => {
      const link = `${window.location.origin}/convite/${r.token}`
      setLastLink(link)
      setLastSent(r.emailSent)
      navigator.clipboard?.writeText(link).catch(() => {})
      setEmail("")
      refresh()
      toast(r.emailSent ? "Convite enviado por e-mail" : "Convite criado. Link copiado.")
    },
  })
  const setMemberRole = useMutation({
    mutationFn: async (v: { userId: string; role: "owner" | "admin" | "viewer" }) => (await client.team.setRole.$post(v)).json(),
    onSuccess: () => {
      refresh()
      toast("Permissão atualizada")
    },
    onError: (e) => toast(e.message, "error"),
  })
  const remove = useMutation({
    mutationFn: async (userId: string) => (await client.team.remove.$post({ userId })).json(),
    onSuccess: () => {
      refresh()
      toast("Pessoa removida da equipe")
    },
  })
  const revoke = useMutation({
    mutationFn: async (id: string) => (await client.team.revokeInvite.$post({ id })).json(),
    onSuccess: refresh,
  })

  return (
    <div className="flex flex-col gap-4">
      {can.manage && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Convidar pessoa</h2>
          <p className="mb-5 text-sm text-muted">Admins podem lançar campanhas e editar o plano. Leitores só visualizam.</p>
          <form
            className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              invite.mutate()
            }}
          >
            <Field label="E-mail" htmlFor="iemail">
              <Input id="iemail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com.br" />
            </Field>
            <Field label="Permissão" htmlFor="irole">
              <Select id="irole" value={role} onChange={(e) => setRole(e.target.value as "admin" | "viewer")}>
                <option value="viewer">Leitor</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <Button type="submit" loading={invite.isPending}>
              Gerar convite
            </Button>
          </form>
          {invite.error && <p className="mt-3 text-sm text-risk-crit-fg">{invite.error.message}</p>}
          {lastLink && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-xl border border-brand/25 bg-brand/[0.06] p-3 text-sm">
              {lastSent ? "Enviamos o convite por e-mail. Se preferir, mande também este link (já copiado): " : "Envie este link para a pessoa (já copiado): "}
              <code className="break-all font-mono text-xs text-brand-fg">{lastLink}</code>
            </motion.div>
          )}
        </Card>
      )}

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Pessoas com acesso</h2>
        {team.isLoading ? (
          <div className="grid h-24 place-items-center text-muted">
            <Spinner />
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {team.data?.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-full bg-tint/[0.06] text-sm font-semibold">{m.name.slice(0, 1)}</span>
                  <div>
                    <p className="font-medium">
                      {m.name} {m.id === team.data.me && <span className="text-xs text-subtle">(você)</span>}
                    </p>
                    <p className="text-sm text-subtle">{m.email}</p>
                  </div>
                </div>
                {can.manage ? (
                  <div className="flex items-center gap-2">
                    <Select
                      aria-label={`Permissão de ${m.name}`}
                      className="h-9 w-32 text-sm"
                      value={m.role}
                      onChange={(e) => setMemberRole.mutate({ userId: m.id, role: e.target.value as "owner" | "admin" | "viewer" })}
                    >
                      {Object.entries(ROLE_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                    {m.id !== team.data.me && (
                      <Button size="sm" variant="ghost" onClick={() => confirm(`Remover ${m.name} da equipe?`) && remove.mutate(m.id)}>
                        Remover
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="rounded-full bg-tint/[0.06] px-2.5 py-1 text-xs text-muted">{ROLE_LABEL[m.role]}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {!!team.data?.pending.length && (
          <>
            <h3 className="mb-2 mt-6 text-sm font-medium text-subtle">Convites pendentes</h3>
            <ul className="flex flex-col divide-y divide-line">
              {team.data.pending.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <span>
                    {p.email} · <span className="text-subtle">{ROLE_LABEL[p.role]}</span>
                  </span>
                  {can.manage && (
                    <span className="flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/convite/${p.token}`)
                          toast("Link do convite copiado")
                        }}
                      >
                        Copiar link
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => revoke.mutate(p.id)}>
                        Cancelar
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  )
}

function SecurityTab() {
  const toast = useToast()
  const [form, setForm] = useState({ current: "", next: "", confirm: "" })
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: async () => (await client.auth.changePassword.$post({ current: form.current, next: form.next })).json(),
    onSuccess: () => {
      setForm({ current: "", next: "", confirm: "" })
      toast("Senha alterada")
    },
  })
  return (
    <Card className="max-w-lg">
      <h2 className="mb-5 text-lg font-semibold">Alterar senha</h2>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (form.next !== form.confirm) return setError("As senhas não conferem")
          setError(null)
          save.mutate()
        }}
      >
        <Field label="Senha atual" htmlFor="pcur">
          <Input id="pcur" type="password" autoComplete="current-password" required value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
        </Field>
        <Field label="Nova senha" htmlFor="pnew" hint="Mínimo de 8 caracteres">
          <Input id="pnew" type="password" autoComplete="new-password" required minLength={8} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
        </Field>
        <Field label="Confirmar nova senha" htmlFor="pconf" error={error ?? undefined}>
          <Input id="pconf" type="password" autoComplete="new-password" required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        </Field>
        {save.error && <p className="text-sm text-risk-crit-fg">{save.error.message}</p>}
        <Button type="submit" loading={save.isPending} className="self-start">
          Alterar senha
        </Button>
      </form>
    </Card>
  )
}

const ACTION_DOT: Record<string, string> = {
  create: "bg-brand",
  update: "bg-risk-mod-fg",
  status: "bg-risk-mod-fg",
  delete: "bg-risk-crit-fg",
  invite: "bg-tint/60",
  access: "bg-tint/60",
}

function AuditTab() {
  const log = useQuery({ queryKey: ["audit"], queryFn: async () => (await client.company.auditLog.$get()).json() })
  if (log.isLoading) {
    return (
      <div className="grid h-40 place-items-center text-muted">
        <Spinner />
      </div>
    )
  }
  return (
    <Card>
      <h2 className="mb-1 text-lg font-semibold">Trilha de auditoria</h2>
      <p className="mb-6 text-sm text-muted">Registro de quem alterou o quê e quando. Evidência útil para a fiscalização.</p>
      {!log.data?.length ? (
        <p className="py-8 text-center text-sm text-muted">Nenhum registro ainda.</p>
      ) : (
        <ol className="relative flex flex-col gap-5 border-l border-line pl-6">
          {log.data.map((e, i) => (
            <motion.li key={e.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.025 }} className="relative">
              <span className={cn("absolute -left-[29px] top-1.5 size-2.5 rounded-full ring-4 ring-surface", ACTION_DOT[e.action] ?? "bg-subtle")} />
              <p className="text-[15px]">{e.summary}</p>
              <p className="text-xs text-subtle">
                {e.user ?? "Sistema"} · {new Date(e.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {e.entity}
              </p>
            </motion.li>
          ))}
        </ol>
      )}
    </Card>
  )
}

function PrivacyTab() {
  const me = useMe()
  const can = useCan()
  const toast = useToast()
  const router = useRouter()
  const qc = useQueryClient()
  const [companyName, setCompanyName] = useState("")
  const [confirmMe, setConfirmMe] = useState("")
  const [exporting, setExporting] = useState(false)

  async function exportData() {
    setExporting(true)
    try {
      const data = await (await client.account.exportData.$get()).json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `equilibra-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast("Exportação gerada")
    } catch (e) {
      toast(e instanceof Error ? e.message : "Falha ao exportar", "error")
    } finally {
      setExporting(false)
    }
  }

  const deleteCompany = useMutation({
    mutationFn: async () => (await client.account.deleteCompany.$post({ confirmName: companyName })).json(),
    onSuccess: (r) => {
      qc.clear()
      router.push(r.hasOtherCompany ? "/app" : "/")
    },
  })
  const deleteMe = useMutation({
    mutationFn: async () => (await client.account.deleteMe.$post({ confirm: "EXCLUIR" })).json(),
    onSuccess: () => {
      qc.clear()
      router.push("/")
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Seus documentos</h2>
        <p className="text-sm text-muted">
          Versão aceita: <span className="font-mono">{formatLegalVersion()}</span>. Releia quando quiser:
        </p>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/termos" target="_blank" className="rounded-lg border border-line px-3 py-1.5 hover:border-line-strong">Termos de Uso</Link>
          <Link href="/privacidade" target="_blank" className="rounded-lg border border-line px-3 py-1.5 hover:border-line-strong">Política de Privacidade</Link>
          <Link href="/dpa" target="_blank" className="rounded-lg border border-line px-3 py-1.5 hover:border-line-strong">Acordo de Tratamento de Dados</Link>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Exportar dados da empresa</h2>
        <p className="text-sm text-muted">
          Baixe um arquivo JSON com setores, campanhas, respostas (anônimas), plano de ação, relatos do canal, equipe e trilha de auditoria. Direito de portabilidade (LGPD, art. 18, V).
        </p>
        {can.manage ? (
          <Button variant="secondary" loading={exporting} onClick={exportData} className="self-start">
            Exportar JSON
          </Button>
        ) : (
          <p className="text-xs text-subtle">Apenas o dono da conta pode exportar.</p>
        )}
      </Card>

      {can.manage && (
        <Card className="flex flex-col gap-3 border-risk-crit/30">
          <h2 className="text-lg font-semibold text-risk-crit-fg">Excluir a empresa</h2>
          <p className="text-sm text-muted">
            Apaga de forma definitiva <strong className="text-fg">{me.data?.company.name}</strong> e todos os dados dela: setores, campanhas, respostas, plano, relatos e auditoria. Exporte antes se precisar guardar o histórico do PGR.
          </p>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault()
              if (confirm("Esta ação não pode ser desfeita. Excluir a empresa e todos os dados?")) deleteCompany.mutate()
            }}
          >
            <div className="flex-1">
              <Field label="Digite o nome da empresa para confirmar" htmlFor="delco">
                <Input id="delco" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={me.data?.company.name} />
              </Field>
            </div>
            <Button type="submit" variant="danger" disabled={companyName.trim() !== me.data?.company.name} loading={deleteCompany.isPending}>
              Excluir empresa
            </Button>
          </form>
          {deleteCompany.error && <p className="text-sm text-risk-crit-fg">{deleteCompany.error.message}</p>}
        </Card>
      )}

      <Card className="flex flex-col gap-3 border-risk-crit/30">
        <h2 className="text-lg font-semibold text-risk-crit-fg">Excluir minha conta</h2>
        <p className="text-sm text-muted">
          Remove seu usuário e seus acessos. Empresas em que você é a única pessoa também são excluídas. Se for o único dono de uma empresa com outras pessoas, torne alguém dono antes.
        </p>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault()
            deleteMe.mutate()
          }}
        >
          <div className="flex-1">
            <Field label="Digite EXCLUIR para confirmar" htmlFor="delme">
              <Input id="delme" value={confirmMe} onChange={(e) => setConfirmMe(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" variant="danger" disabled={confirmMe !== "EXCLUIR"} loading={deleteMe.isPending}>
            Excluir conta
          </Button>
        </form>
        {deleteMe.error && <p className="text-sm text-risk-crit-fg">{deleteMe.error.message}</p>}
      </Card>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  )
}
