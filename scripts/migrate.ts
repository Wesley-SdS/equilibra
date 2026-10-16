/**
 * Aplica as migrations do Drizzle no Postgres de DATABASE_URL.
 * Roda no build da Vercel (vercel.json → buildCommand), antes do `next build`,
 * para que as funções serverless nunca disputem a migração entre si.
 */
import path from "node:path"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.log("[migrate] DATABASE_URL ausente: nada a fazer (o PGlite local migra sozinho).")
    return
  }
  const sql = postgres(url, { max: 1, prepare: false })
  await migrate(drizzle(sql), { migrationsFolder: path.join(process.cwd(), "drizzle") })
  await sql.end()
  console.log("[migrate] migrations aplicadas.")
}

main().catch((err) => {
  console.error("[migrate] falhou", err)
  process.exit(1)
})
