"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

/** Último recurso: erro que derrubou o layout raiz. Reporta ao Sentry e oferece recarregar. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#07090a", color: "#edefee", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Algo deu errado</h1>
          <p style={{ color: "#a3ada9", lineHeight: 1.6 }}>
            Nossa equipe foi avisada automaticamente. Tente de novo em instantes.
            {error.digest && <span style={{ display: "block", marginTop: 8, fontSize: 12, fontFamily: "monospace" }}>Código: {error.digest}</span>}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 20, height: 44, padding: "0 20px", borderRadius: 12, border: 0, background: "#c6f56f", color: "#07090a", fontWeight: 600, cursor: "pointer" }}
          >
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  )
}
