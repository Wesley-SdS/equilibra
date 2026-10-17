import Link from "next/link"
import { ThemeToggle } from "@/components/theme"
import { Logo } from "@/components/ui/primitives"
import { renderLegal, type LegalDoc } from "@/lib/legal-render"

const DOCS: { doc: LegalDoc; href: string; label: string }[] = [
  { doc: "termos-de-uso", href: "/termos", label: "Termos de Uso" },
  { doc: "politica-de-privacidade", href: "/privacidade", label: "Política de Privacidade" },
  { doc: "dpa", href: "/dpa", label: "Acordo de Tratamento de Dados (DPA)" },
]

/** Página pública de documento jurídico (renderizada no build a partir de docs/legal/*.md). */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { title, html, toc } = renderLegal(doc)
  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" aria-label="Equilibra, página inicial">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="no-print lg:sticky lg:top-24 lg:self-start">
          <nav aria-label="Documentos" className="flex flex-col gap-1 text-sm">
            {DOCS.map((d) => (
              <Link
                key={d.doc}
                href={d.href}
                aria-current={d.doc === doc ? "page" : undefined}
                className={
                  d.doc === doc ? "rounded-lg bg-tint/[0.06] px-3 py-2 font-medium text-fg" : "rounded-lg px-3 py-2 text-muted hover:bg-tint/[0.04] hover:text-fg"
                }
              >
                {d.label}
              </Link>
            ))}
          </nav>
          <nav aria-label="Nesta página" className="mt-6 hidden flex-col gap-1.5 border-t border-line pt-5 text-[13px] lg:flex">
            <span className="mb-1 text-[11px] font-medium uppercase tracking-wider text-subtle">Nesta página</span>
            {toc.map((t) => (
              <a key={t.id} href={`#${t.id}`} className="text-muted hover:text-fg">
                {t.text}
              </a>
            ))}
          </nav>
        </aside>
        <article className="print-sheet legal min-w-0">
          <h1>{title}</h1>
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </article>
      </div>
    </div>
  )
}
