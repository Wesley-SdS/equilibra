"use client"

import { AnimatePresence, motion } from "motion/react"
import { createContext, useCallback, useContext, useState } from "react"

type Toast = { id: number; message: string; tone: "ok" | "error" }

const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((message: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800)
  }, [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="no-print pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="pointer-events-auto flex items-center gap-3 rounded-xl border border-line-strong bg-surface-2/95 px-4 py-3 text-sm shadow-2xl shadow-[var(--shadow)] backdrop-blur"
            >
              <span className={t.tone === "ok" ? "size-2 rounded-full bg-brand" : "size-2 rounded-full bg-risk-crit"} />
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
