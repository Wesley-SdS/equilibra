/* eslint-disable @typescript-eslint/no-explicit-any -- respostas da API inspecionadas livremente nos testes */
import SuperJSON from "superjson"
import { beforeAll, describe, expect, it } from "vitest"
import { createMemoryDb, type Db } from "@/server/db"
import { campaigns, sectors } from "@/server/db/schema"
import { computeInsights } from "@/server/insights"
import { QUESTIONS } from "@/lib/methodology"

// Banco em memória isolado: o getDb() do app passa a devolver este banco.
let db: Db
let app: { fetch: (req: Request) => Response | Promise<Response> }

beforeAll(async () => {
  const memory = createMemoryDb()
  ;(globalThis as { __eqDb?: Promise<Db> }).__eqDb = memory
  db = await memory
  app = (await import("@/server")).default.handler as unknown as typeof app
})

type Session = { cookie: string }

// Igual ao client do jStack: cada campo do body vai serializado com SuperJSON.
function serialize(body: unknown) {
  return JSON.stringify(Object.fromEntries(Object.entries(body as object).map(([k, v]) => [k, SuperJSON.stringify(v)])))
}

async function call(path: string, opts: { body?: unknown; session?: Session; method?: "GET" | "POST"; cookie?: string } = {}) {
  const method = opts.method ?? (opts.body === undefined ? "GET" : "POST")
  const headers: Record<string, string> = { "content-type": "application/json" }
  const cookie = [opts.session?.cookie, opts.cookie].filter(Boolean).join("; ")
  if (cookie) headers.cookie = cookie
  const res = await app.fetch(
    new Request(`http://test/api/${path}`, { method, headers, body: method === "POST" ? serialize(opts.body ?? {}) : undefined })
  )
  const text = await res.text()
  let json: unknown = null
  try {
    json = (JSON.parse(text) as { json: unknown }).json
  } catch {}
  const setCookie = res.headers.get("set-cookie") ?? ""
  return { status: res.status, text, json: json as any, setCookie }
}

function sessionFrom(setCookie: string): Session {
  return { cookie: setCookie.split(";")[0]! }
}

let n = 0
async function signup() {
  n += 1
  const r = await call("auth/signup", {
    body: { companyName: `Empresa ${n}`, cnpj: "12345678000190", employees: 50, name: `Pessoa ${n}`, email: `p${n}@teste.com`, password: "senha-segura-1", acceptTerms: true },
  })
  expect(r.status, r.text).toBe(200)
  return sessionFrom(r.setCookie)
}

describe("API", () => {
  it("bloqueia rotas privadas sem sessão", async () => {
    const r = await call("sectors/list")
    expect(r.status).toBe(401)
  })

  it("devolve a mensagem de validação do Zod com 422", async () => {
    const s = await signup()
    const r = await call("sectors/create", { session: s, body: { name: "", headcount: 3 } })
    expect(r.status).toBe(422)
    expect(r.text).toBe("Informe o nome do setor")
  })

  it("isola os dados entre empresas", async () => {
    const a = await signup()
    const b = await signup()
    const created = await call("sectors/create", { session: a, body: { name: "Segredo da A", headcount: 10 } })
    expect(created.status).toBe(200)
    const listB = await call("sectors/list", { session: b })
    expect(listB.json.some((s: { name: string }) => s.name === "Segredo da A")).toBe(false)
    // B também não consegue remover o setor de A
    await call("sectors/remove", { session: b, body: { id: (created.json as { id: string }).id } })
    const listA = await call("sectors/list", { session: a })
    expect(listA.json.some((s: { name: string }) => s.name === "Segredo da A")).toBe(true)
  })

  it("aplica papéis: leitor não altera, convite cria acesso", async () => {
    const owner = await signup()
    const inv = await call("team/invite", { session: owner, body: { email: "leitor@teste.com", role: "viewer" } })
    expect(inv.status).toBe(200)
    const accepted = await call("auth/acceptInvite", { body: { token: (inv.json as { token: string }).token, name: "Leitor", password: "senha-segura-2", acceptTerms: true } })
    expect(accepted.status).toBe(200)
    const viewer = sessionFrom(accepted.setCookie)

    expect((await call("sectors/list", { session: viewer })).status).toBe(200)
    const denied = await call("sectors/create", { session: viewer, body: { name: "X", headcount: 5 } })
    expect(denied.status).toBe(403)
    expect((await call("team/invite", { session: viewer, body: { email: "x@teste.com", role: "admin" } })).status).toBe(403)

    // Removido da equipe, o cookie antigo deixa de valer na hora.
    const team = await call("team/list", { session: owner })
    const viewerId = (team.json as unknown as { members: { id: string; role: string }[] }).members.find((m) => m.role === "viewer")!.id
    expect((await call("team/remove", { session: owner, body: { userId: viewerId } })).status).toBe(200)
    expect((await call("sectors/list", { session: viewer })).status).toBe(401)
  })

  it("aceita uma resposta anônima por dispositivo e recusa campanha encerrada", async () => {
    const s = await signup()
    const sector = await call("sectors/create", { session: s, body: { name: "Operação", headcount: 20 } })
    const camp = await call("campaigns/create", { session: s, body: { name: "Teste", startsAt: "2026-01-01", endsAt: "2099-12-31" } })
    const token = (camp.json as { token: string }).token
    const body = { token, sectorId: (sector.json as { id: string }).id, answers: QUESTIONS.map((q) => ({ questionId: q.id, value: 3 })) }

    const first = await call("survey/submit", { body })
    expect(first.status).toBe(200)
    const again = await call("survey/submit", { body, cookie: first.setCookie.split(";")[0] })
    expect(again.status).toBe(409)

    const incomplete = await call("survey/submit", { body: { ...body, answers: body.answers.slice(1) } })
    expect(incomplete.status).toBe(422)

    await call("campaigns/setStatus", { session: s, body: { id: (camp.json as { id: string }).id, status: "closed" } })
    expect((await call("survey/submit", { body })).status).toBe(410)
  })

  it("registra alterações na trilha de auditoria", async () => {
    const s = await signup()
    await call("sectors/create", { session: s, body: { name: "Logística", headcount: 8 } })
    const log = await call("company/auditLog", { session: s })
    expect(log.json.some((e: { summary: string }) => e.summary.includes("Logística"))).toBe(true)
  })
})

describe("k-anonimato", () => {
  async function scenario(sizes: number[]) {
    const s = await signup()
    const me = await call("auth/me", { session: s })
    const companyId = (me.json as unknown as { company: { id: string } }).company.id
    const ids: string[] = []
    for (const [i, size] of sizes.entries()) {
      const [row] = await db.insert(sectors).values({ companyId, name: `S${i}`, headcount: size + 5 }).returning()
      ids.push(row!.id)
    }
    const camp = await call("campaigns/create", { session: s, body: { name: "Campanha K", startsAt: "2026-01-01", endsAt: "2099-12-31" } })
    expect(camp.status, camp.text).toBe(200)
    const token = (camp.json as { token: string }).token
    for (const [i, size] of sizes.entries()) {
      for (let k = 0; k < size; k++) {
        await call("survey/submit", { body: { token, sectorId: ids[i], answers: QUESTIONS.map((q) => ({ questionId: q.id, value: 4 })) } })
      }
    }
    const [c] = await db.select().from(campaigns).where((await import("drizzle-orm")).eq(campaigns.token, token))
    return computeInsights(db, companyId, c!.id)
  }

  it("nunca mostra um setor com menos de 5 respostas", async () => {
    const r = await scenario([6, 2, 2])
    expect(r!.heatmap.map((h) => h.label)).toEqual(["S0"])
    expect(r!.totals.hiddenResponses).toBe(4)
    expect(r!.totals.responses).toBe(10) // os pequenos ainda entram no índice geral
  })

  it("agrupa setores pequenos quando o grupo chega a 5", async () => {
    const r = await scenario([6, 3, 3])
    const labels = r!.heatmap.map((h) => h.label)
    expect(labels).toContain("Outros setores")
    expect(labels).not.toContain("S1")
    expect(r!.heatmap.find((h) => h.grouped)!.responses).toBe(6)
  })
})
