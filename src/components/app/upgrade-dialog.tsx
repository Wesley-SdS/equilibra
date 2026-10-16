"use client"

import { AnimatePresence, motion } from "motion/react"
import { useEffect, useState } from "react"
import { Button, ButtonLink } from "@/components/ui/primitives"

const EVENT = "eq:upgrade"

/** Dispara o diálogo de upgrade (chamado pelo QueryClient quando a API responde 402). */
export function requestUpgrade(message: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: message }))
}

export function UpgradeDialog() {
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => {
    const on = (e: Event) => setMessage((e as CustomEvent<string>).detail)
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          className="no-print fixed inset-0 z-50 grid place-items-center bg-black/60 px-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && setMessage(null)}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="upgrade-title"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="ring-gradient w-full max-w-md rounded-3xl bg-surface p-7 shadow-2xl shadow-[var(--shadow)]"
          >
            <span className="grid size-11 place-items-center rounded-2xl bg-brand/15 text-brand-fg">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </span>
            <h2 id="upgrade-title" className="mt-4 text-xl font-semibold tracking-tight">
              Hora de subir de plano
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">{message}</p>
            <div className="mt-6 flex gap-2">
              <Button variant="secondary" onClick={() => setMessage(null)}>
                Agora não
              </Button>
              <ButtonLink href="/app/assinatura" className="flex-1">
                Ver planos
              </ButtonLink>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
