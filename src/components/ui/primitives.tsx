"use client"

import Link from "next/link"
import { forwardRef } from "react"
import { cn } from "@/lib/utils"
import { RISK_LEVELS, riskLevel, type RiskLevel } from "@/lib/methodology"

type Variant = "primary" | "secondary" | "ghost" | "danger"
type Size = "sm" | "md" | "lg"

const variants: Record<Variant, string> = {
  primary: "bg-brand text-brand-ink hover:bg-brand-strong shadow-[0_0_0_1px_rgba(198,245,111,0.4),0_8px_24px_-8px_rgba(198,245,111,0.5)]",
  secondary: "border border-line-strong bg-white/[0.03] text-fg hover:bg-white/[0.07]",
  ghost: "text-muted hover:text-fg hover:bg-white/[0.05]",
  danger: "border border-risk-crit/40 text-risk-crit-fg hover:bg-risk-crit/10",
}
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-lg",
  md: "h-11 px-4 text-[15px] rounded-xl",
  lg: "h-13 px-6 text-base rounded-xl",
}

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    variants[variant],
    sizes[size],
    className
  )
}

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }
>(function Button({ variant, size, loading, className, children, disabled, ...props }, ref) {
  return (
    <button ref={ref} className={buttonClass(variant, size, className)} disabled={disabled || loading} {...props}>
      {loading && <Spinner />}
      {children}
    </button>
  )
})

export function ButtonLink({
  href,
  variant,
  size,
  className,
  children,
}: {
  href: string
  variant?: Variant
  size?: Size
  className?: string
  children: React.ReactNode
}) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-xl border border-line-strong bg-white/[0.03] px-3.5 text-[15px] text-fg placeholder:text-subtle transition-colors focus:border-brand/60 focus:bg-white/[0.05] focus:outline-none focus:ring-4 focus:ring-brand/10",
        className
      )}
      {...props}
    />
  )
})

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-28 w-full rounded-xl border border-line-strong bg-white/[0.03] px-3.5 py-3 text-[15px] text-fg placeholder:text-subtle focus:border-brand/60 focus:outline-none focus:ring-4 focus:ring-brand/10",
          className
        )}
        {...props}
      />
    )
  }
)

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-11 w-full appearance-none rounded-xl border border-line-strong bg-surface-2 px-3.5 text-[15px] text-fg focus:border-brand/60 focus:outline-none focus:ring-4 focus:ring-brand/10",
        className
      )}
      {...props}
    />
  )
})

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-fg/90">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[13px] text-risk-crit-fg">{error}</p>
      ) : hint ? (
        <p className="text-[13px] text-subtle">{hint}</p>
      ) : null}
    </div>
  )
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-2xl border border-line bg-surface p-5 sm:p-6", className)}>{children}</div>
}

const levelStyle: Record<RiskLevel, string> = {
  baixo: "bg-risk-low/60 text-risk-low-fg",
  moderado: "bg-risk-mod/50 text-risk-mod-fg",
  alto: "bg-risk-high/15 text-risk-high-fg",
  critico: "bg-risk-crit/15 text-risk-crit-fg",
}

export function RiskBadge({ score, className }: { score: number; className?: string }) {
  const level = riskLevel(score)
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", levelStyle[level], className)}>
      <span className="size-1.5 rounded-full bg-current" />
      {RISK_LEVELS[level].label}
    </span>
  )
}

export const cellStyle: Record<RiskLevel, string> = {
  baixo: "bg-risk-low text-risk-low-fg",
  moderado: "bg-risk-mod text-risk-mod-fg",
  alto: "bg-risk-high text-black/80",
  critico: "bg-risk-crit text-white",
}

export const barStyle: Record<RiskLevel, string> = {
  baixo: "bg-risk-low-fg",
  moderado: "bg-risk-mod-fg",
  alto: "bg-risk-high",
  critico: "bg-risk-crit",
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="grid size-7 place-items-center rounded-lg bg-brand">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#07090a" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
          <path d="M3 13c3-6 6-6 9 0s6 6 9 0" />
        </svg>
      </span>
      <span className="text-[17px] font-semibold tracking-tight">equilibra</span>
    </span>
  )
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[13px] tracking-wide text-brand">{children}</span>
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-white/[0.04]">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-subtle" aria-hidden="true">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-muted">{text}</p>
      {action}
    </div>
  )
}
