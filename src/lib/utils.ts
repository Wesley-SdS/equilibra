import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Conhece as cores do tema, para que `text-brand-fg` não seja tratado como tamanho de fonte.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: ["bg", "surface", "surface-2", "line", "line-strong", "fg", "muted", "subtle", "tint", "brand", "brand-strong", "brand-ink", "brand-fg", "risk-low", "risk-low-fg", "risk-mod", "risk-mod-fg", "risk-high", "risk-high-fg", "risk-crit", "risk-crit-fg"],
    },
  },
})

/** Junta classes e resolve conflitos do Tailwind (a última vence: `w-full` + `w-40` → `w-40`). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

export function formatCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
}

export function formatDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${y}`
}
