"use client"

import { useMutation, useQuery } from "@tanstack/react-query"
import { motion } from "motion/react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { CommandPalette } from "@/components/app/command-palette"
import { CompanySwitcher } from "@/components/app/company-switcher"
import { ThemeToggle } from "@/components/theme"
import { BillingBanner } from "@/components/app/billing-banner"
import { TermsGate } from "@/components/app/terms-gate"
import { Logo, Spinner } from "@/components/ui/primitives"
import { client } from "@/lib/client"
import { ROLE_LABEL, useMe } from "@/lib/hooks"
import { cn } from "@/lib/utils"

const NAV = [
  {
    group: "Diagnóstico",
    items: [
      { href: "/app", label: "Visão geral", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
      { href: "/app/evolucao", label: "Evolução", icon: "M3 17l6-6 4 4 8-8M15 7h6v6" },
      { href: "/app/campanhas", label: "Campanhas", icon: "M4 6h16M4 12h16M4 18h10" },
      { href: "/app/setores", label: "Setores", icon: "M4 20V10l8-6 8 6v10M9 20v-6h6v6" },
      { href: "/app/pessoas", label: "Pessoas", icon: "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8" },
      { href: "/app/metodologia", label: "Metodologia", icon: "M4 19V5M4 19h16M8 15l3-4 3 2 5-6" },
      { href: "/app/questionario", label: "Questionários", icon: "M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.6V14M12 17.5v.01M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" },
    ],
  },
  {
    group: "Gestão",
    items: [
      { href: "/app/plano", label: "Plano de ação", icon: "M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11" },
      { href: "/app/relatorio", label: "Relatório PGR", icon: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" },
      { href: "/app/canal", label: "Canal de relato", icon: "M21 12a8 8 0 0 1-11.8 7L4 20l1-4.6A8 8 0 1 1 21 12z" },
      { href: "/app/escuta", label: "Espaço de escuta", icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 10h.01M12 10h.01M16 10h.01" },
    ],
  },
  {
    group: "Conta",
    items: [
      { href: "/app/carteira", label: "Carteira", icon: "M3 7h18v13H3zM8 7V4h8v3" },
      { href: "/app/assinatura", label: "Assinatura", icon: "M3 6h18v12H3zM3 10h18M7 15h4" },
      { href: "/app/configuracoes", label: "Configurações", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" },
    ],
  },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const me = useMe()
  const [menuOpen, setMenuOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const logout = useMutation({
    mutationFn: async () => (await client.auth.logout.$post()).json(),
    onSuccess: () => router.push("/entrar"),
  })

  useEffect(() => {
    if (me.isError) router.replace("/entrar")
  }, [me.isError, router])
  useEffect(() => setMenuOpen(false), [pathname])
  // Ações do plano atrasadas ou vencendo.
  const deadlines = useQuery({
    queryKey: ["deadlines"],
    queryFn: async () => (await client.actions.deadlines.$get()).json(),
    enabled: !!me.data,
    refetchInterval: 5 * 60_000,
  })
  // Mensagens novas de quem relatou pelo protocolo: indicador no menu, atualizado a cada minuto.
  const unread = useQuery({
    queryKey: ["channel-unread"],
    queryFn: async () => (await client.channelAdmin.unreadCount.$get()).json(),
    enabled: !!me.data,
    refetchInterval: 60_000,
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

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
      <aside className="no-print border-b border-line bg-surface/60 backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[268px] lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-4 py-4 lg:px-5 lg:pb-4 lg:pt-6">
          <Link href="/app" aria-label="Visão geral">
            <Logo />
          </Link>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-lg text-muted hover:bg-tint/[0.05] lg:hidden"
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d={menuOpen ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className={cn("flex-col gap-3 pb-4 lg:flex lg:min-h-0 lg:flex-1", menuOpen ? "flex" : "hidden")}>
          <CompanySwitcher />
          <div className="px-3">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex h-10 w-full items-center gap-2.5 rounded-lg border border-line px-3 text-sm text-subtle transition-colors hover:border-line-strong hover:text-muted"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
              </svg>
              Buscar
              <kbd className="ml-auto rounded border border-line-strong px-1.5 font-mono text-[11px]">Ctrl K</kbd>
            </button>
          </div>

          <nav className="flex flex-col gap-4 overflow-y-auto px-3 lg:flex-1">
            {NAV.map((section) => (
              <div key={section.group} className="flex flex-col gap-0.5">
                <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-subtle">{section.group}</p>
                {section.items.map((item) => {
                  const active = isActive(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "relative flex h-9 items-center gap-3 rounded-lg px-3 text-[14px] transition-colors",
                        active ? "text-fg" : "text-muted hover:bg-tint/[0.04] hover:text-fg"
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="nav-active"
                          className="absolute inset-0 rounded-lg border border-line-strong bg-tint/[0.06]"
                          transition={{ type: "spring", stiffness: 500, damping: 38 }}
                        />
                      )}
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={cn("relative shrink-0", active && "text-brand-fg")} aria-hidden="true">
                        <path d={item.icon} />
                      </svg>
                      <span className="relative">{item.label}</span>
                      {item.href === "/app/plano" && !!deadlines.data && deadlines.data.overdue + deadlines.data.soon > 0 && (
                        <span
                          className={cn("relative ml-auto grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold", deadlines.data.overdue ? "bg-risk-crit text-white" : "bg-risk-mod-fg text-white")}
                          aria-label={`${deadlines.data.overdue} ações atrasadas e ${deadlines.data.soon} vencendo`}
                        >
                          {deadlines.data.overdue + deadlines.data.soon}
                        </span>
                      )}
                      {item.href === "/app/canal" && !!unread.data?.n && (
                        <span className="relative ml-auto grid min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-ink" aria-label={`${unread.data.n} mensagens novas`}>
                          {unread.data.n}
                        </span>
                      )}
                    </Link>
                  )
                })}
              </div>
            ))}
          </nav>

          <div className="mx-3 flex items-center justify-between border-t border-line pt-4 text-xs text-subtle">
            Tema
            <ThemeToggle />
          </div>
          <div className="mx-3 flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/15 text-sm font-semibold text-brand-fg">
              {me.data.user.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{me.data.user.name}</p>
              <p className="truncate text-xs text-subtle">{ROLE_LABEL[me.data.role]}</p>
            </div>
            <button
              type="button"
              onClick={() => logout.mutate()}
              aria-label="Sair"
              title="Sair"
              className="grid size-9 place-items-center rounded-lg text-subtle transition-colors hover:bg-tint/[0.05] hover:text-fg"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <BillingBanner />
        {me.data.role === "viewer" && (
          <div className="no-print border-b border-line bg-tint/[0.02] px-4 py-2 text-center text-xs text-muted">
            Você tem acesso de leitura nesta empresa.
          </div>
        )}
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
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <TermsGate />
    </div>
  )
}
