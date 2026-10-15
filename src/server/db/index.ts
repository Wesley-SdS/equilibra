import { mkdirSync } from "node:fs"
import path from "node:path"
import type { PgliteDatabase } from "drizzle-orm/pglite"
import * as schema from "./schema"

export type Db = PgliteDatabase<typeof schema>

// Com DATABASE_URL usa Postgres de verdade (Neon, Supabase, RDS…); sem ela, PGlite
// (Postgres embutido em WASM) para rodar localmente sem infraestrutura.
// O cache global evita abrir o banco duas vezes durante o hot reload.
const g = globalThis as unknown as { __eqDb?: Promise<Db> }
const migrationsFolder = path.join(process.cwd(), "drizzle")

async function initPostgres(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres")
  const { drizzle } = await import("drizzle-orm/postgres-js")
  const { migrate } = await import("drizzle-orm/postgres-js/migrator")
  const db = drizzle(postgres(url, { max: 10, prepare: false }), { schema })
  await migrate(db, { migrationsFolder })
  // Os dois drivers expõem a mesma API de query builder do Drizzle.
  return db as unknown as Db
}

async function initPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite")
  const { drizzle } = await import("drizzle-orm/pglite")
  const { migrate } = await import("drizzle-orm/pglite/migrator")
  if (dataDir) mkdirSync(dataDir, { recursive: true })
  const db = drizzle(new PGlite(dataDir), { schema })
  await migrate(db, { migrationsFolder })
  return db
}

export function getDb(): Promise<Db> {
  g.__eqDb ??= process.env.DATABASE_URL
    ? initPostgres(process.env.DATABASE_URL)
    : initPglite(process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite"))
  return g.__eqDb
}

/** Banco em memória e isolado, usado nos testes. */
export function createMemoryDb() {
  return initPglite()
}

export { schema }
