import Link from "next/link"

/** Aceite explícito (não pré-marcado) dos Termos e da Política — LGPD art. 8º. */
export function TermsCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line px-3 py-3 text-sm leading-snug text-muted transition-colors hover:border-line-strong">
      <input type="checkbox" required checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--brand-fg)]" />
      <span>
        Li e aceito os{" "}
        <Link href="/termos" target="_blank" className="font-medium text-brand-fg underline-offset-2 hover:underline">
          Termos de Uso
        </Link>
        , a{" "}
        <Link href="/privacidade" target="_blank" className="font-medium text-brand-fg underline-offset-2 hover:underline">
          Política de Privacidade
        </Link>{" "}
        e o{" "}
        <Link href="/dpa" target="_blank" className="font-medium text-brand-fg underline-offset-2 hover:underline">
          Acordo de Tratamento de Dados
        </Link>
        .
      </span>
    </label>
  )
}
