"use client"

import { useMutation } from "@tanstack/react-query"
import { motion } from "motion/react"
import Link from "next/link"
import { useState } from "react"
import { AuthShell } from "@/components/auth-shell"
import { Button, Field, Input } from "@/components/ui/primitives"
import { client } from "@/lib/client"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const request = useMutation({
    mutationFn: async () => (await client.auth.requestPasswordReset.$post({ email })).json(),
  })

  return (
    <AuthShell title="Esqueceu a senha?" subtitle="Enviamos um link para você criar uma nova senha.">
      {request.isSuccess ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
          <div className="rounded-2xl border border-brand/30 bg-brand/[0.08] p-4 text-[15px] leading-relaxed">
            Se existir uma conta para <strong>{email}</strong>, o link chega em alguns instantes. Ele vale por 30 minutos.
          </div>
          <p className="text-sm text-muted">Não chegou? Confira a caixa de spam ou tente de novo em alguns minutos.</p>
          <Link href="/entrar" className="text-sm font-medium text-brand-fg">
            ← Voltar para o login
          </Link>
        </motion.div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            request.mutate()
          }}
        >
          <Field label="E-mail da conta" htmlFor="femail">
            <Input id="femail" type="email" autoComplete="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {request.error && <p className="rounded-xl bg-risk-crit/10 px-3 py-2 text-sm text-risk-crit-fg">{request.error.message}</p>}
          <Button type="submit" loading={request.isPending} className="mt-2">
            Enviar link
          </Button>
          <Link href="/entrar" className="text-center text-sm text-muted hover:text-fg">
            Lembrei a senha
          </Link>
        </form>
      )}
    </AuthShell>
  )
}
