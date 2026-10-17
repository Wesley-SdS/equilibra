"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { use, useState } from "react"
import { AuthShell } from "@/components/auth-shell"
import { TermsCheckbox } from "@/components/terms-checkbox"
import { Button, Field, Input, Spinner } from "@/components/ui/primitives"
import { client } from "@/lib/client"
import { ROLE_LABEL } from "@/lib/hooks"

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [accepted, setAccepted] = useState(false)
  const info = useQuery({
    queryKey: ["invite", token],
    queryFn: async () => (await client.auth.inviteInfo.$get({ token })).json(),
    retry: false,
  })
  const accept = useMutation({
    mutationFn: async () => (await client.auth.acceptInvite.$post({ token, name: name || undefined, password, acceptTerms: accepted as true })).json(),
    onSuccess: () => router.push("/app"),
  })

  if (info.isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center text-muted">
        <Spinner className="size-6" />
      </div>
    )
  }
  if (!info.data) {
    return (
      <AuthShell title="Convite inválido" subtitle="Este convite não existe ou já foi utilizado. Peça um novo link ao responsável.">
        <span />
      </AuthShell>
    )
  }
  const d = info.data
  return (
    <AuthShell title={`Entrar em ${d.companyName}`} subtitle={`Você foi convidado como ${ROLE_LABEL[d.role]} (${d.email}).`}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          accept.mutate()
        }}
      >
        {!d.hasAccount && (
          <Field label="Seu nome" htmlFor="iname">
            <Input id="iname" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
        <Field label={d.hasAccount ? "Sua senha do Equilibra" : "Crie uma senha"} htmlFor="ipass" hint={d.hasAccount ? undefined : "Mínimo de 8 caracteres"}>
          <Input id="ipass" type="password" required minLength={8} autoComplete={d.hasAccount ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <TermsCheckbox checked={accepted} onChange={setAccepted} />
        {accept.error && <p className="rounded-xl bg-risk-crit/10 px-3 py-2 text-sm text-risk-crit-fg">{accept.error.message}</p>}
        <Button type="submit" loading={accept.isPending} className="mt-2">
          Aceitar convite
        </Button>
      </form>
    </AuthShell>
  )
}
