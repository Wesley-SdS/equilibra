/* eslint-disable @typescript-eslint/no-explicit-any -- respostas da API inspecionadas livremente nos testes */
import { eq } from "drizzle-orm"
import SuperJSON from "superjson"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { createMemoryDb, type Db } from "@/server/db"
import { agentRuns, companies, memberships, users } from "@/server/db/schema"
import { setAgentRunner, type RawGeneration } from "@/server/agents/client"
import { enforceRules } from "@/server/agents/questionnaire-copilot"

let db: Db
let app: { fetch: (req: Request) => Response | Promise<Response> }

beforeAll(async () => {
  const memory = createMemoryDb()
  ;(globalThis as { __eqDb?: Promise<Db> }).__eqDb = memory
  db = await memory
  app = (await import("@/server")).default.handler as unknown as typeof app
})
afterEach(() => setAgentRunner(null))

const serialize = (body: object) => JSON.stringify(Object.fromEntries(Object.entries(body).map(([k, v]) => [k, SuperJSON.stringify(v)])))
async function call(path: string, opts: { body?: object; cookie?: string } = {}) {
  const post = opts.body !== undefined
  const res = await app.fetch(
    new Request(`http://test/api/${path}`, {
      method: post ? "POST" : "GET",
      headers: { "content-type": "application/json", ...(opts.cookie ? { cookie: opts.cookie } : {}) },
      body: post ? serialize(opts.body!) : undefined,
    })
  )
  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text).json
  } catch {}
  return { status: res.status, text, json, cookie: (res.headers.get("set-cookie") ?? "").split(";")[0]! }
}

let n = 0
async function setup() {
  n += 1
  const email = `g${n}@teste.com`
  const r = await call("auth/signup", { body: { companyName: `Empresa G${n}`, cnpj: "12345678000190", employees: 30, name: `RH ${n}`, email, password: "senha-segura-1", acceptTerms: true } })
  expect(r.status, r.text).toBe(200)
  const [u] = await db.select().from(users).where(eq(users.email, email))
  const [m] = await db.select().from(memberships).where(eq(memberships.userId, u!.id))
  return { cookie: r.cookie, companyId: m!.companyId }
}

const proposal = {
  objective: "Medir o efeito da rota e do contato fora do horário",
  audience: "Equipe de entregas",
  suggestedName: "Pulso Entregas",
  suggestedKind: "pulso",
  suggestAnonymous: true,
  anonymityReason: "Envolve cobrança da liderança",
  notMeasurable: "A qualidade das rotas pede observação em campo",
  message: "Montei 4 itens.",
  items: [
    { text: "Recebo mensagens de trabalho fora do meu horário.", dimension: "demandas", risk: true, rationale: "Contato fora do horário" },
    { text: "Meu supervisor João me cobra de forma agressiva.", dimension: "lideranca", risk: true, rationale: "Cobrança" },
    { text: "Tomo remédio para depressão por causa do trabalho.", dimension: null, risk: true, rationale: "Saúde" },
    { text: "A rota do dia é definida com tempo suficiente.", dimension: "controle", risk: false, rationale: "Planejamento" },
  ],
}
const gen = (output: unknown, stopReason = "end_turn"): RawGeneration => ({ output, stopReason, model: "claude-opus-5-5", inputTokens: 900, outputTokens: 400 })

describe("regras do copiloto de questionários", () => {
  it("remove itens de saúde individual e sinaliza nomes de pessoas", () => {
    const r = enforceRules(proposal as any, "pulso")
    expect(r.items.map((i) => i.text)).not.toContain("Tomo remédio para depressão por causa do trabalho.")
    expect(r.warnings[0]).toContain("saúde individual")
    expect(r.items.find((i) => i.text.includes("João"))!.flags[0]).toContain("pessoa")
    expect(enforceRules({ ...proposal, suggestAnonymous: false } as any, "nr1").suggestAnonymous).toBe(true)
  })
})

describe("módulo comum de agentes", () => {
  it("propõe, valida, registra a execução e conta na cota", async () => {
    const s = await setup()
    let seen: any = null
    setAgentRunner(async (req) => {
      seen = req
      return gen(proposal)
    })
    const r = await call("agents/questionnaire", { cookie: s.cookie, body: { pain: "A equipe de entregas reclama da rota e de mensagens fora do horário." } })
    expect(r.status, r.text).toBe(200)
    expect(r.json.items).toHaveLength(3)
    expect(seen.system).toContain("nunca a saúde de uma pessoa")
    const runs = await db.select().from(agentRuns).where(eq(agentRuns.companyId, s.companyId))
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ agent: "questionnaire-copilot", status: "ok", inputTokens: 900 })
    expect(JSON.stringify(runs[0])).not.toContain("reclama da rota") // só o hash da entrada
    const usage = await call("agents/usage", { cookie: s.cookie })
    expect(usage.json).toMatchObject({ available: true, used: 1, limit: 200 })
    await call("agents/feedback", { cookie: s.cookie, body: { runId: r.json.runId, accepted: true } })
    expect((await db.select().from(agentRuns).where(eq(agentRuns.id, r.json.runId)))[0]!.accepted).toBe(true)
  })

  it("rejeita saída inválida, trata recusa e não derruba o fluxo", async () => {
    const s = await setup()
    setAgentRunner(async () => gen({ items: "não é uma lista" }))
    const bad = await call("agents/questionnaire", { cookie: s.cookie, body: { pain: "Equipe sobrecarregada no fim do mês." } })
    expect(bad.status).toBe(502)
    setAgentRunner(async () => gen(null, "refusal"))
    const refused = await call("agents/questionnaire", { cookie: s.cookie, body: { pain: "Equipe sobrecarregada no fim do mês." } })
    expect(refused.status).toBe(422)
    const runs = await db.select().from(agentRuns).where(eq(agentRuns.companyId, s.companyId))
    expect(runs.map((r) => r.status).sort()).toEqual(["error", "refused"])
    // Erro não consome cota; recusa consome.
    expect((await call("agents/usage", { cookie: s.cookie })).json.used).toBe(1)
  })

  it("bloqueia no plano sem copilotos e quando a cota acaba", async () => {
    const s = await setup()
    setAgentRunner(async () => gen(proposal))
    await db.update(companies).set({ plan: "essencial", subscriptionStatus: "active" }).where(eq(companies.id, s.companyId))
    const blocked = await call("agents/questionnaire", { cookie: s.cookie, body: { pain: "Equipe sobrecarregada no fim do mês." } })
    expect(blocked.status).toBe(402)
    expect((await call("agents/usage", { cookie: s.cookie })).json.available).toBe(false)
  })

  it("leitor não usa copiloto", async () => {
    const owner = await setup()
    const inv = await call("team/invite", { cookie: owner.cookie, body: { email: `leitor${n}@teste.com`, role: "viewer" } })
    const acc = await call("auth/acceptInvite", { body: { token: inv.json.token, name: "Leitor", password: "senha-segura-2", acceptTerms: true } })
    setAgentRunner(async () => gen(proposal))
    expect((await call("agents/questionnaire", { cookie: acc.cookie, body: { pain: "Equipe sobrecarregada no fim do mês." } })).status).toBe(403)
  })
})
