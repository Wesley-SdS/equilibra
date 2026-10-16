"use client"

import { useMutation } from "@tanstack/react-query"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"
import { AuthShell } from "@/components/auth-shell"
import { Button, Field, Input } from "@/components/ui/primitives"
import { client } from "@/lib/client"

// Conta de demonstração criada por `npm run db:seed` (somente ambiente local).
const DEMO = { email: "demo@equilibra.app", password: "equilibra-demo" }

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const isDemo = params.get("demo") === "1"
  const [email, setEmail] = useState(isDemo ? DEMO.email : "")
  const [password, setPassword] = useState(isDemo ? DEMO.password : "")

  const login = useMutation({
    mutationFn: async () => {
      const res = await client.auth.login.$post({ email, password })
      return res.json()
    },
    onSuccess: () => router.push("/app"),
  })

  return (
    <AuthShell title="Entrar no Equilibra" subtitle="Acesse o painel da sua empresa.">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          login.mutate()
        }}
      >
        <Field label="E-mail" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {login.error && <p className="rounded-xl bg-risk-crit/10 px-3 py-2 text-sm text-risk-crit-fg">{login.error.message}</p>}
        <Button type="submit" loading={login.isPending} className="mt-2">
          Entrar
        </Button>
        {!isDemo && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setEmail(DEMO.email)
              setPassword(DEMO.password)
            }}
          >
            Usar conta de demonstração
          </Button>
        )}
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Ainda não tem conta?{" "}
        <Link href="/comecar" className="font-medium text-brand-fg hover:text-brand-fg">
          Criar agora
        </Link>
      </p>
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
