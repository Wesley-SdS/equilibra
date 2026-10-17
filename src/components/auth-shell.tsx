"use client"

import { motion } from "motion/react"
import Link from "next/link"
import { ThemeToggle } from "@/components/theme"
import { LegalLinks } from "@/components/legal-links"
import { Logo } from "@/components/ui/primitives"

export function AuthShell({
  title,
  subtitle,
  children,
  aside,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  aside?: React.ReactNode
}) {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div aria-hidden="true" className="bg-grid absolute inset-0" />
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-[-300px] h-[640px] w-[1000px] -translate-x-1/2 rounded-full bg-glow"
      />
      <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col px-4 py-6 sm:px-6">
        <div className="flex items-center justify-between">
          <Link href="/" aria-label="Voltar para a página inicial">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="ring-gradient w-full max-w-md rounded-3xl bg-surface/80 p-6 shadow-2xl shadow-[var(--shadow)] backdrop-blur-xl sm:p-8"
          >
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1.5 text-[15px] text-muted">{subtitle}</p>
            <div className="mt-7">{children}</div>
          </motion.div>
        </div>
        {aside}
        <LegalLinks className="justify-center" />
      </div>
    </div>
  )
}
