"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "motion/react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { client } from "@/lib/client"
import { useMe } from "@/lib/hooks"
import { DIMENSIONS } from "@/lib/methodology"
import { cn } from "@/lib/utils"

type Item = { id: string; label: string; group: string; hint?: string; run: () => void }

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter()
  const qc = useQueryClient()
  const me = useMe()
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const switchCompany = useMutation({
    mutationFn: async (companyId: string) => (await client.auth.switchCompany.$post({ companyId })).json(),
    onSuccess: () => {
      qc.clear()
      router.push("/app")
      router.refresh()
    },
  })

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => router.push(href)
    const list: Item[] = [
      { id: "home", group: "Navegar", label: "Visão geral", run: go("/app") },
      { id: "evo", group: "Navegar", label: "Evolução entre campanhas", run: go("/app/evolucao") },
      { id: "camp", group: "Navegar", label: "Campanhas", run: go("/app/campanhas") },
      { id: "set", group: "Navegar", label: "Setores", run: go("/app/setores") },
      { id: "plan", group: "Navegar", label: "Plano de ação", run: go("/app/plano") },
      { id: "rep", group: "Navegar", label: "Relatório PGR", run: go("/app/relatorio") },
      { id: "can", group: "Navegar", label: "Canal de relato", run: go("/app/canal") },
      { id: "cart", group: "Navegar", label: "Carteira de empresas", run: go("/app/carteira") },
      { id: "cfg", group: "Navegar", label: "Configurações", run: go("/app/configuracoes") },
      { id: "team", group: "Navegar", label: "Equipe e convites", run: go("/app/configuracoes?aba=equipe") },
      { id: "audit", group: "Navegar", label: "Trilha de auditoria", run: go("/app/configuracoes?aba=auditoria") },
      ...DIMENSIONS.map((d) => ({ id: `dim-${d.id}`, group: "Dimensões", label: d.name, run: go(`/app/dimensao/${d.id}`) })),
      { id: "new-camp", group: "Ações", label: "Nova campanha", run: go("/app/campanhas?nova=1") },
      { id: "new-action", group: "Ações", label: "Nova ação no plano", run: go("/app/plano?nova=1") },
      { id: "print", group: "Ações", label: "Imprimir relatório PGR", run: go("/app/relatorio?imprimir=1") },
    ]
    for (const co of me.data?.companies ?? []) {
      if (co.id === me.data?.company.id) continue
      list.push({ id: `co-${co.id}`, group: "Trocar de empresa", label: co.name, run: () => switchCompany.mutate(co.id) })
    }
    return list
  }, [me.data, router, switchCompany])

  const filtered = useMemo(() => {
    const q = query
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim()
    if (!q) return items
    return items.filter((i) =>
      i.label
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .includes(q)
    )
  }, [items, query])

  useEffect(() => {
    if (open) {
      setQuery("")
      setActive(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [open])
  useEffect(() => setActive(0), [query])

  function run(item?: Item) {
    if (!item) return
    onOpenChange(false)
    item.run()
  }

  let lastGroup = ""
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="no-print fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onOpenChange(false)}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Paleta de comandos"
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 500, damping: 36 }}
            className="ring-gradient w-full max-w-xl overflow-hidden rounded-2xl bg-surface shadow-2xl shadow-[var(--shadow)]"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-subtle" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
              </svg>
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault()
                    setActive((a) => Math.min(filtered.length - 1, a + 1))
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault()
                    setActive((a) => Math.max(0, a - 1))
                  } else if (e.key === "Enter") {
                    e.preventDefault()
                    run(filtered[active])
                  } else if (e.key === "Escape") {
                    onOpenChange(false)
                  }
                }}
                placeholder="Buscar páginas, dimensões, empresas…"
                aria-label="Buscar comando"
                className="h-14 flex-1 bg-transparent text-[15px] placeholder:text-subtle focus:outline-none"
              />
              <kbd className="rounded-md border border-line-strong px-1.5 py-0.5 font-mono text-[11px] text-subtle">esc</kbd>
            </div>
            <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
              {filtered.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">Nada encontrado.</li>}
              {filtered.map((item, i) => {
                const header = item.group !== lastGroup ? item.group : null
                lastGroup = item.group
                return (
                  <li key={item.id}>
                    {header && <p className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-subtle">{header}</p>}
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => run(item)}
                      className={cn(
                        "relative flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm",
                        i === active ? "text-fg" : "text-muted"
                      )}
                    >
                      {i === active && <motion.span layoutId="cmd-active" className="absolute inset-0 rounded-lg bg-tint/[0.07]" transition={{ type: "spring", stiffness: 600, damping: 40 }} />}
                      <span className="relative">{item.label}</span>
                      {i === active && <span className="relative font-mono text-xs text-subtle">↵</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
