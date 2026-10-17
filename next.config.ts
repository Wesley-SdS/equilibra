import { withSentryConfig } from "@sentry/nextjs/config"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // PGlite carrega WASM e arquivos de dados em runtime; não deve ser empacotado.
  serverExternalPackages: ["@electric-sql/pglite", "@react-pdf/renderer", "sharp"],
  // O sharp usa binários nativos por plataforma (@img/*); sem isto a função da Vercel (linux-x64)
  // sai sem eles e o envio de anexos falha em produção.
  outputFileTracingIncludes: { "/api/**": ["./node_modules/@img/**/*", "./node_modules/sharp/**/*"] },
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
