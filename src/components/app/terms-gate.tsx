"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { useState } from "react"
import { TermsCheckbox } from "@/components/terms-checkbox"
import { Button } from "@/components/ui/primitives"
import { client } from "@/lib/client"
import { useMe } from "@/lib/hooks"

/** Pede o aceite da versão vigente dos documentos a quem aceitou uma versão anterior (ou nenhuma). */
export function TermsGate() {
  const me = useMe()
  const qc = useQueryClient()
  const [checked, setChecked] = useState(false)
  const accept = useMutation({
    mutationFn: async () => (await client.auth.acceptTerms.$post()).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  })
  const open = !!me.data?.termsOutdated

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="no-print fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="terms-title"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            className="ring-gradient w-full max-w-md rounded-3xl bg-surface p-7 shadow-2xl shadow-[var(--shadow)]"
          >
            <h2 id="terms-title" className="text-xl font-semibold tracking-tight">
              Atualizamos nossos documentos
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Para continuar usando o Equilibra, leia e aceite a versão atual dos Termos de Uso, da Política de Privacidade e do Acordo de Tratamento de Dados.
            </p>
            <form
              className="mt-5 flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault()
                accept.mutate()
              }}
            >
              <TermsCheckbox checked={checked} onChange={setChecked} />
              {accept.error && <p className="text-sm text-risk-crit-fg">{accept.error.message}</p>}
              <Button type="submit" disabled={!checked} loading={accept.isPending}>
                Aceitar e continuar
              </Button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
