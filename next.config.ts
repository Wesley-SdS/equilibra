import { withSentryConfig } from "@sentry/nextjs/config"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // PGlite carrega WASM e arquivos de dados em runtime; não deve ser empacotado.
  serverExternalPackages: ["@electric-sql/pglite", "@react-pdf/renderer"],
}

// O plugin do Sentry só entra quando há token para enviar sourcemaps; sem ele, o SDK
// continua capturando erros (via DSN), apenas com stack traces minificadas no navegador.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      sourcemaps: { deleteSourcemapsAfterUpload: true },
      telemetry: false,
    })
  : nextConfig
