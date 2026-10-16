"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { client } from "@/lib/client"
import { ROLE_LABEL, useMe } from "@/lib/hooks"
import { cn } from "@/lib/utils"

export function CompanySwitcher() {
  const me = useMe()
  const qc = useQueryClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const switchCompany = useMutation({
    mutationFn: async (companyId: string) => (await client.auth.switchCompany.$post({ companyId })).json(),
    onSuccess: () => {
      setOpen(false)
      qc.clear()
      router.push("/app")
    },
  })

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [])

  if (!me.data) return null
  const { company, companies, role } = me.data

  return (
    <div ref={ref} className="relative px-3">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-xl border border-line bg-tint/[0.02] px-3 py-2.5 text-left transition-colors hover:border-line-strong"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-tint/[0.06] text-sm font-semibold">{company.name.slice(0, 1)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{company.name}</span>
          <span className="block text-xs text-subtle">
            {ROLE_LABEL[role]} · {companies.length} {companies.length === 1 ? "empresa" : "empresas"}
          </span>
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-subtle" aria-hidden="true">
          <path d="M8 9l4-4 4 4M8 15l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-x-3 top-full z-30 mt-2 overflow-hidden rounded-xl border border-line-strong bg-surface-2 p-1.5 shadow-2xl shadow-[var(--shadow)]"
          >
            <ul role="listbox" aria-label="Empresas">
              {companies.map((co) => (
                <li key={co.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={co.id === company.id}
                    disabled={switchCompany.isPending}
                    onClick={() => (co.id === company.id ? setOpen(false) : switchCompany.mutate(co.id))}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-tint/[0.06]",
                      co.id === company.id && "text-brand-fg"
                    )}
                  >
                    <span className="truncate">{co.name}</span>
                    <span className="shrink-0 text-xs text-subtle">{ROLE_LABEL[co.role]}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-1.5 border-t border-line pt-1.5">
              <Link href="/app/carteira" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-tint/[0.06] hover:text-fg">
                Ver carteira completa
              </Link>
              <Link href="/app/carteira?nova=1" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-tint/[0.06] hover:text-fg">
                + Adicionar empresa
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
