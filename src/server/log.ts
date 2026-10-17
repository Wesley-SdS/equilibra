import * as Sentry from "@sentry/nextjs"

// Logs estruturados: uma linha JSON por evento em produção (fácil de filtrar nos logs da
// Vercel), texto legível em desenvolvimento. Erros também vão para o Sentry, quando configurado.
// Nunca registre dados pessoais (e-mail, texto de relato, respostas) nos campos.

type Fields = Record<string, unknown> & { err?: unknown }

function serializeError(err: unknown) {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack?.split("\n").slice(0, 6).join("\n") }
  return { message: String(err) }
}

function emit(level: "info" | "warn" | "error", event: string, fields: Fields = {}) {
  const { err, ...rest } = fields
  const entry = { level, event, at: new Date().toISOString(), ...rest, ...(err !== undefined ? { err: serializeError(err) } : {}) }
  if (process.env.NODE_ENV === "production") {
    const line = JSON.stringify(entry)
    if (level === "error") console.error(line)
    else if (level === "warn") console.warn(line)
    else console.info(line)
  } else if (!process.env.VITEST) {
    const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : ""
    console[level](`[${level}] ${event}${extra}`, err ?? "")
  }
}

export const log = {
  info: (event: string, fields?: Fields) => emit("info", event, fields),
  warn: (event: string, fields?: Fields) => emit("warn", event, fields),
  /** Registra e envia ao Sentry (com o evento como tag, sem dados pessoais). */
  error: (event: string, fields: Fields = {}) => {
    emit("error", event, fields)
    const { err, ...rest } = fields
    Sentry.withScope((scope) => {
      scope.setTag("event", event)
      scope.setExtras(rest)
      if (err instanceof Error) Sentry.captureException(err)
      else Sentry.captureMessage(`${event}: ${String(err ?? "")}`, "error")
    })
  },
}
