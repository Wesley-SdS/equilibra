import { mkdirSync } from "node:fs"
import path from "node:path"
import { PGlite } from "@electric-sql/pglite"
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite"
import { migrate } from "drizzle-orm/pglite/migrator"
import * as schema from "./schema"

export type Db = PgliteDatabase<typeof schema>

// PGlite (Postgres embutido) para rodar sem infraestrutura no MVP.
// O cache global evita abrir o banco duas vezes durante o hot reload.
const g = globalThis as unknown as { __eqDb?: Promise<Db> }

async function init(): Promise<Db> {
  const dataDir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite")
  mkdirSync(dataDir, { recursive: true })
  const client = new PGlite(dataDir)
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") })
  return db
}

export function getDb(): Promise<Db> {
  g.__eqDb ??= init()
  return g.__eqDb
}

export { schema }
