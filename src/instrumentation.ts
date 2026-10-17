import * as Sentry from "@sentry/nextjs"
import { sentryOptions } from "./lib/sentry-options"

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(sentryOptions(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN))
  }
}

/** Erros não tratados em Server Components, rotas e middleware. */
export const onRequestError = Sentry.captureRequestError
