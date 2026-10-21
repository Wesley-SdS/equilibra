/* eslint-disable @typescript-eslint/no-explicit-any -- respostas da API inspecionadas livremente nos testes */
import { eq } from "drizzle-orm"
import SuperJSON from "superjson"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { createMemoryDb, type Db } from "@/server/db"
import { agentRuns, listeningConversations, listeningMessages } from "@/server/db/schema"
import { setAgentRunner } from "@/server/agents/client"
import { CRISIS_FOLLOWUP, CRISIS_REPLY, decrypt, detectRisk, encrypt, purgeListening } from "@/server/listening"

let db: Db
let app: { fetch: (req: Request) => Response | Promise<Response> }

beforeAll(async () => {
  process.env.ESCUTA_ENABLED = "1"
  const memory = createMemoryDb()
  ;(globalThis as { __eqDb?: Promise<Db> }).__eqDb = memory
  db = await memory
  app = (await import("@/server")).default.handler as unknown as typeof app
})
afterAll(() => {
  delete process.env.ESCUTA_ENABLED
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
const get = (path: string, params: Record<string, unknown>, cookie?: string) =>
  call(`${path}?${new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, SuperJSON.stringify(v)])))}`, { cookie })

let n = 0
async function company() {
  n += 1
  const r = await call("auth/signup", { body: { companyName: `Empresa L${n}`, cnpj: "12345678000190", employees: 40, name: "Dona", email: `l${n}@teste.com`, password: "senha-segura-1", acceptTerms: true } })
  const me = (await call("auth/me", { cookie: r.cookie })).json
  return { cookie: r.cookie, slug: me.company.slug as string, companyId: me.company.id as string }
}
/** Um trabalhador: aceita o termo e guarda o cookie do aparelho. */
async function worker(slug: string) {
  const r = await call("listening/start", { body: { slug, consent: true } })
  expect(r.status, r.text).toBe(200)
  return r.cookie
}

describe("cifra e detecção de risco", () => {
  it("só decifra com o segredo do aparelho", () => {
    const box = encrypt("estou exausto com as metas", "c2VncmVkbw", "conv-1")
    expect(box).not.toContain("exausto")
    expect(decrypt(box, "c2VncmVkbw", "conv-1")).toBe("estou exausto com as metas")
    expect(() => decrypt(box, "b3V0cm8", "conv-1")).toThrow()
  })
  it("detecta sinais de risco à vida e de violência", () => {
    expect(detectRisk("às vezes acho que seria melhor não acordar amanhã")).toBe(true)
    expect(detectRisk("penso em me matar")).toBe(true)
    expect(detectRisk("meu marido me agrediu ontem")).toBe(true)
    expect(detectRisk("estou cansado das metas do mês")).toBe(false)
  })
})

describe("Espaço de escuta", () => {
  it("fica desligado até o dono ativar com confirmação", async () => {
    const c = await company()
    expect((await get("listening/status", { slug: c.slug })).json.available).toBe(false)
    setAgentRunner(async () => ({ output: { reply: "oi", options: [] }, stopReason: "end_turn", model: "m", inputTokens: 1, outputTokens: 1 }))
    expect((await call("listening/start", { body: { slug: c.slug, consent: true } })).status).toBe(403)
    expect((await call("listeningAdmin/setEnabled", { cookie: c.cookie, body: { enabled: true } })).status).toBe(400)
    expect((await call("listeningAdmin/setEnabled", { cookie: c.cookie, body: { enabled: true, acknowledge: true } })).status).toBe(200)
    expect((await get("listening/status", { slug: c.slug })).json.available).toBe(true)
  })

  it("conversa cifrada, sem saída gravada nem cota do RH; protocolo de crise sem chamar o modelo; apagar conversa", async () => {
    const c = await company()
    await call("listeningAdmin/setEnabled", { cookie: c.cookie, body: { enabled: true, acknowledge: true } })
    let calls = 0
    setAgentRunner(async () => {
      calls++
      return { output: { reply: "Faz sentido estar cansado com metas assim. Quer pensar no que dizer à liderança?", options: ["Sim", "Agora não"] }, stopReason: "end_turn", model: "claude-opus-5-5", inputTokens: 300, outputTokens: 60 }
    })
    const cookie = await worker(c.slug)
    const r = await call("listening/send", { cookie, body: { slug: c.slug, text: "As metas do mês estão impossíveis e faço hora extra todo dia" } })
    expect(r.status, r.text).toBe(200)
    expect(r.json.crisis).toBe(false)
    expect(r.json.options).toEqual(["Sim", "Agora não"])

    const raw = await db.select().from(listeningMessages)
    expect(JSON.stringify(raw)).not.toContain("metas do mês")
    const runs = await db.select().from(agentRuns).where(eq(agentRuns.companyId, c.companyId))
    expect(runs[0]!.output).toBeNull()
    expect((await call("agents/usage", { cookie: c.cookie })).json.used).toBe(0)

    // Outro aparelho não lê a conversa.
    expect((await get("listening/messages", { slug: c.slug })).json).toEqual([])
    expect((await get("listening/messages", { slug: c.slug }, cookie)).json).toHaveLength(2)

    const crisis = await call("listening/send", { cookie, body: { slug: c.slug, text: "às vezes acho que seria melhor não acordar amanhã" } })
    expect(crisis.json.crisis).toBe(true)
    expect(crisis.json.reply).toBe(CRISIS_REPLY)
    expect(calls).toBe(1) // o protocolo de crise não passa pelo modelo
    const follow = await call("listening/send", { cookie, body: { slug: c.slug, text: "não sei" } })
    expect(follow.json.reply).toBe(CRISIS_FOLLOWUP)
    expect(calls).toBe(1)
    expect((await get("listening/status", { slug: c.slug }, cookie)).json.crisis).toBe(true)

    // A empresa não vê crise nem contagem abaixo do mínimo.
    const admin = (await call("listeningAdmin/insights", { cookie: c.cookie })).json
    expect(admin.enough).toBe(false)
    expect(admin.activeConversations).toBeNull()
    expect(JSON.stringify(admin)).not.toMatch(/crise|crisis/i)

    await call("listening/remove", { cookie, body: { slug: c.slug } })
    expect(await db.select().from(listeningConversations).where(eq(listeningConversations.companyId, c.companyId))).toHaveLength(0)
  })

  it("temas agregados só a partir de 10 conversas no mês, cada conversa contada uma vez por tema", async () => {
    const c = await company()
    await call("listeningAdmin/setEnabled", { cookie: c.cookie, body: { enabled: true, acknowledge: true } })
    await call("sectors/create", { cookie: c.cookie, body: { name: "Produção", headcount: 30 } })
    setAgentRunner(async () => ({ output: { reply: "Entendo.", options: [] }, stopReason: "end_turn", model: "m", inputTokens: 1, outputTokens: 1 }))
    for (let i = 0; i < 10; i++) {
      const cookie = await worker(c.slug)
      await call("listening/send", { cookie, body: { slug: c.slug, text: "O prazo das entregas é curto demais e acumula tarefa" } })
      await call("listening/send", { cookie, body: { slug: c.slug, text: "e ainda tem mais prazo apertado na sexta" } })
      if (i === 8) {
        const before = (await call("listeningAdmin/insights", { cookie: c.cookie })).json
        expect(before.enough).toBe(false)
      }
    }
    const after = (await call("listeningAdmin/insights", { cookie: c.cookie })).json
    expect(after.enough).toBe(true)
    expect(after.themes[0]).toMatchObject({ theme: "demandas", conversations: 10 })
  })

  it("sem modelo configurado fica indisponível; apaga conversas sem uso há 90 dias", async () => {
    const c = await company()
    await call("listeningAdmin/setEnabled", { cookie: c.cookie, body: { enabled: true, acknowledge: true } })
    expect((await get("listening/status", { slug: c.slug })).json.available).toBe(false)
    setAgentRunner(async () => ({ output: { reply: "oi", options: [] }, stopReason: "end_turn", model: "m", inputTokens: 1, outputTokens: 1 }))
    await call("listeningAdmin/setEnabled", { cookie: c.cookie, body: { enabled: true, acknowledge: true } })
    await worker(c.slug)
    await db.update(listeningConversations).set({ lastMessageAt: new Date(Date.now() - 91 * 86_400_000) }).where(eq(listeningConversations.companyId, c.companyId))
    expect(await purgeListening(db)).toBeGreaterThanOrEqual(1)
  })
})
