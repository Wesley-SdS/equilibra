"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { motion } from "motion/react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Logo, Spinner } from "@/components/ui/primitives"
import { client } from "@/lib/client"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/app", label: "Visão geral", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { href: "/app/campanhas", label: "Campanhas", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/app/setores", label: "Setores", icon: "M4 20V10l8-6 8 6v10M9 20v-6h6v6" },
  { href: "/app/plano", label: "Plano de ação", icon: "M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11" },
  { href: "/app/relatorio", label: "Relatório PGR", icon: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" },
  { href: "/app/canal", label: "Canal de relato", icon: "M21 12a8 8 0 0 1-11.8 7L4 20l1-4.6A8 8 0 1 1 21 12z" },
]

function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => (await client.auth.me.$get()).json(),
  })
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const me = useMe()
  const [menuOpen, setMenuOpen] = useState(false)
  const logout = useMutation({
    mutationFn: async () => (await client.auth.logout.$post()).json(),
    onSuccess: () => router.push("/entrar"),
  })

  useEffect(() => {
    if (me.isError) router.replace("/entrar")
  }, [me.isError, router])
  useEffect(() => setMenuOpen(false), [pathname])

  if (!me.data) {
    return (
      <div className="grid min-h-dvh place-items-center text-muted">
        <Spinner className="size-6" />
      </div>
    )
  }

  const isActive = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href))

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside
        className={cn(
          "no-print border-line bg-surface/60 backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:flex-col lg:border-r",
          "border-b lg:border-b-0"
        )}
      >
        <div className="flex items-center justify-between px-4 py-4 lg:px-5 lg:py-6">
          <Link href="/app" aria-label="Visão geral">
            <Logo />
          </Link>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-lg text-muted hover:bg-white/[0.05] lg:hidden"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d={menuOpen ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <nav className={cn("flex-col gap-0.5 px-3 pb-4 lg:flex lg:flex-1", menuOpen ? "flex" : "hidden")}>
          {NAV.map((item) => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex h-10 items-center gap-3 rounded-lg px-3 text-[14px] transition-colors",
                  active ? "text-fg" : "text-muted hover:bg-white/[0.04] hover:text-fg"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-lg border border-line-strong bg-white/[0.06]"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={cn("relative", active && "text-brand")} aria-hidden="true">
                  <path d={item.icon} />
                </svg>
                <span className="relative">{item.label}</span>
              </Link>
            )
          })}
          <div className="mt-auto flex flex-col gap-3 border-t border-line pt-4">
            <div className="flex items-center gap-3 px-2">
              <span className="grid size-9 place-items-center rounded-full bg-brand/15 text-sm font-semibold text-brand">
                {me.data.user.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{me.data.user.name}</p>
                <p className="truncate text-xs text-subtle">{me.data.company.name}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => logout.mutate()}
              className="h-9 rounded-lg px-3 text-left text-sm text-muted transition-colors hover:bg-white/[0.04] hover:text-fg"
            >
              Sair
            </button>
          </div>
        </nav>
      </aside>
      <main className="min-w-0 flex-1">
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-6xl px-4 py-8 sm:px-8 lg:py-10"
        >
          {children}
        </motion.div>
      </main>
    </div>
  )
}
