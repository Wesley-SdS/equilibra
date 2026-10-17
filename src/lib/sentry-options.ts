import type { ErrorEvent } from "@sentry/nextjs"

/**
 * Opções comuns do Sentry (servidor e navegador). Sem DSN, o Sentry fica desligado.
 * Privacidade: o Equilibra lida com relatos e respostas sensíveis, então NADA de PII,
 * corpo de requisição, cookies ou query string vai para o Sentry.
 */
export function sentryOptions(dsn: string | undefined) {
  return {
    dsn,
    enabled: !!dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend(event: ErrorEvent) {
      if (event.request) {
        delete event.request.data
        delete event.request.cookies
        delete event.request.query_string
        if (event.request.headers) {
          for (const h of Object.keys(event.request.headers)) {
            if (/cookie|authorization|x-forwarded-for|x-real-ip/i.test(h)) delete event.request.headers[h]
          }
        }
      }
      delete event.user
      return event
    },
  }
}
