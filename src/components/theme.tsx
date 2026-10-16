"use client"

import { motion } from "motion/react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export type ThemePref = "system" | "light" | "dark"
const KEY = "eq-theme"

/**
 * Roda antes da primeira pintura (inline no <head>) para aplicar o tema salvo
 * e evitar o "flash" do tema errado.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem('${KEY}')||'system';var d=t==='system'?(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'):t;document.documentElement.dataset.theme=d;}catch(e){document.documentElement.dataset.theme='dark';}})();`

function resolve(pref: ThemePref): "light" | "dark" {
  if (pref !== "system") return pref
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"
}

function apply(pref: ThemePref) {
  document.documentElement.dataset.theme = resolve(pref)
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>("system")
  useEffect(() => {
    try {
      setPref((localStorage.getItem(KEY) as ThemePref) ?? "system")
    } catch {}
  }, [])
  // Acompanha a troca de tema do sistema operacional quando a preferência é "Sistema".
  useEffect(() => {
    if (pref !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: light)")
    const onChange = () => apply("system")
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [pref])

  function choose(next: ThemePref) {
    setPref(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {}
    apply(next)
  }
  return { pref, choose }
}

const OPTIONS: { id: ThemePref; label: string; icon: string }[] = [
  { id: "system", label: "Tema do sistema", icon: "M4 5h16v11H4zM8 20h8M12 16v4" },
  { id: "light", label: "Tema claro", icon: "M12 4V2M12 22v-2M4.9 4.9 3.5 3.5M20.5 20.5l-1.4-1.4M4 12H2M22 12h-2M4.9 19.1l-1.4 1.4M20.5 3.5l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z" },
  { id: "dark", label: "Tema escuro", icon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" },
]

/** Seletor segmentado Sistema / Claro / Escuro. */
export function ThemeToggle({ className }: { className?: string }) {
  const { pref, choose } = useTheme()
  return (
    <div role="radiogroup" aria-label="Tema" className={cn("inline-flex items-center gap-0.5 rounded-full border border-line p-0.5", className)}>
      {OPTIONS.map((o) => {
        const active = pref === o.id
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            title={o.label}
            onClick={() => choose(o.id)}
            className={cn("relative grid size-7 place-items-center rounded-full transition-colors", active ? "text-fg" : "text-subtle hover:text-fg")}
          >
            {active && <motion.span layoutId="theme-pill" className="absolute inset-0 rounded-full bg-tint/[0.09]" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="relative" aria-hidden="true">
              <path d={o.icon} />
            </svg>
          </button>
        )
      })}
    </div>
  )
}
