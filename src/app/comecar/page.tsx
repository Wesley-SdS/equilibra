"use client"

import { useMutation } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { AuthShell } from "@/components/auth-shell"
import { TermsCheckbox } from "@/components/terms-checkbox"
import { Button, Field, Input } from "@/components/ui/primitives"
import { client } from "@/lib/client"
import { formatCnpj } from "@/lib/utils"

type Form = {
  companyName: string
  cnpj: string
  employees: string
  name: string
  email: string
  password: string
}

export default function SignupPage() {
  const router = useRouter()
  const [step, setStep] = useState<0 | 1>(0)
  const [form, setForm] = useState<Form>({ companyName: "", cnpj: "", employees: "", name: "", email: "", password: "" })
  const [accepted, setAccepted] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({})
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: k === "cnpj" ? formatCnpj(e.target.value) : e.target.value }))

  const signup = useMutation({
    mutationFn: async () => {
      const res = await client.auth.signup.$post({ ...form, employees: Number(form.employees), acceptTerms: accepted as true })
      return res.json()
    },
    onSuccess: () => router.push("/app/setores?novo=1"),
  })

  function nextStep() {
    const e: typeof errors = {}
    if (form.companyName.trim().length < 2) e.companyName = "Informe o nome da empresa"
    if (form.cnpj.replace(/\D/g, "").length !== 14) e.cnpj = "CNPJ deve ter 14 dígitos"
    if (!Number(form.employees)) e.employees = "Informe o número de funcionários"
    setErrors(e)
    if (!Object.keys(e).length) setStep(1)
  }

  return (
    <AuthShell
      title={step === 0 ? "Comece pela empresa" : "Agora, o seu acesso"}
      subtitle={step === 0 ? "Leva menos de 2 minutos. Sem cartão de crédito." : "Você será o administrador da conta."}
    >
      <div className="mb-6 flex gap-2" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-tint/[0.08]">
            <motion.div className="h-full bg-brand" initial={false} animate={{ width: step >= i ? "100%" : "0%" }} transition={{ duration: 0.4 }} />
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (step === 0) nextStep()
          else signup.mutate()
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {step === 0 ? (
            <motion.div
              key="s0"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-4"
            >
              <Field label="Nome da empresa" htmlFor="companyName" error={errors.companyName}>
                <Input id="companyName" autoFocus value={form.companyName} onChange={set("companyName")} placeholder="Ex.: Padaria Pão Dourado" />
              </Field>
              <Field label="CNPJ" htmlFor="cnpj" error={errors.cnpj}>
                <Input id="cnpj" inputMode="numeric" value={form.cnpj} onChange={set("cnpj")} placeholder="00.000.000/0000-00" />
              </Field>
              <Field label="Número de funcionários" htmlFor="employees" error={errors.employees}>
                <Input id="employees" type="number" min={1} value={form.employees} onChange={set("employees")} placeholder="Ex.: 45" />
              </Field>
              <Button type="submit" className="mt-2">
                Continuar
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="s1"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col gap-4"
            >
              <Field label="Seu nome" htmlFor="name">
                <Input id="name" autoFocus autoComplete="name" required value={form.name} onChange={set("name")} />
              </Field>
              <Field label="E-mail de trabalho" htmlFor="email">
                <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={set("email")} />
              </Field>
              <Field label="Senha" htmlFor="password" hint="Mínimo de 8 caracteres">
                <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={set("password")} />
              </Field>
              <TermsCheckbox checked={accepted} onChange={setAccepted} />
              {signup.error && <p className="rounded-xl bg-risk-crit/10 px-3 py-2 text-sm text-risk-crit-fg">{signup.error.message}</p>}
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="secondary" onClick={() => setStep(0)}>
                  Voltar
                </Button>
                <Button type="submit" loading={signup.isPending} className="flex-1">
                  Criar conta
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-brand-fg hover:text-brand-fg">
          Entrar
        </Link>
      </p>
    </AuthShell>
  )
}
