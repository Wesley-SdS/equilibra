"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { use, useState } from "react"
import { AuthShell } from "@/components/auth-shell"
import { Button, ButtonLink, Field, Input, Spinner } from "@/components/ui/primitives"
import { client } from "@/lib/client"

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [mismatch, setMismatch] = useState(false)

  const check = useQuery({
    queryKey: ["reset", token],
    queryFn: async () => (await client.auth.checkResetToken.$get({ token })).json(),
    retry: false,
  })
  const reset = useMutation({
    mutationFn: async () => (await client.auth.resetPassword.$post({ token, password })).json(),
    onSuccess: () => router.push("/app"),
  })

  if (check.isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center text-muted">
        <Spinner className="size-6" />
      </div>
    )
  }
  if (!check.data?.valid) {
    return (
      <AuthShell title="Link expirado" subtitle="Este link de redefinição já foi usado ou passou dos 30 minutos.">
        <ButtonLink href="/esqueci-senha" className="w-full">
          Pedir um novo link
        </ButtonLink>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Crie uma nova senha" subtitle="Depois de salvar, você já entra no painel.">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (password !== confirm) return setMismatch(true)
          setMismatch(false)
          reset.mutate()
        }}
      >
        <Field label="Nova senha" htmlFor="rpass" hint="Mínimo de 8 caracteres">
          <Input id="rpass" type="password" autoComplete="new-password" autoFocus required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirmar senha" htmlFor="rconf" error={mismatch ? "As senhas não conferem" : undefined}>
          <Input id="rconf" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {reset.error && <p className="rounded-xl bg-risk-crit/10 px-3 py-2 text-sm text-risk-crit-fg">{reset.error.message}</p>}
        <Button type="submit" loading={reset.isPending} className="mt-2">
          Salvar e entrar
        </Button>
        <Link href="/entrar" className="text-center text-sm text-muted hover:text-fg">
          Voltar para o login
        </Link>
      </form>
    </AuthShell>
  )
}
