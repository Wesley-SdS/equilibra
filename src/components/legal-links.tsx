import Link from "next/link"
import { cn } from "@/lib/utils"

/** Links para os documentos jurídicos, usados nos rodapés das páginas públicas. */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Documentos legais" className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-subtle", className)}>
      <Link href="/termos" className="hover:text-fg">
        Termos de Uso
      </Link>
      <Link href="/privacidade" className="hover:text-fg">
        Privacidade
      </Link>
      <Link href="/dpa" className="hover:text-fg">
        DPA
      </Link>
    </nav>
  )
}
