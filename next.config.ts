import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // PGlite carrega WASM e arquivos de dados em runtime; não deve ser empacotado.
  serverExternalPackages: ["@electric-sql/pglite", "@react-pdf/renderer"],
}

export default nextConfig
