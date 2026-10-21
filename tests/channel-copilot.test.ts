/* eslint-disable @typescript-eslint/no-explicit-any -- respostas da API inspecionadas livremente nos testes */
import { eq } from "drizzle-orm"
import SuperJSON from "superjson"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { createMemoryDb, type Db } from "@/server/db"
import { channelReports } from "@/server/db/schema"
import { setAgentRunner, type RawGeneration } from "@/server/agents/client"

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
  const r = await call("auth/signup", { body: { companyName: `Empresa C${n}`, cnpj: "12345678000190", employees: 30, name: "RH", email: `cc${n}@teste.com`, password: "senha-segura-1", acceptTerms: true } })
  const me = (await call("auth/me", { cookie: r.cookie })).json
  const sent = await call("channel/submit", { body: { slug: me.company.slug, category: "assedio_moral", body: "A supervisora do turno da tarde me chama de lenta na frente dos clientes quase todo dia e disse que quem não aguenta pede pra sair." } })
  expect(sent.status, sent.text).toBe(200)
  const [report] = await db.select().from(channelReports).where(eq(channelReports.protocol, sent.json.protocol))
  return { cookie: r.cookie, reportId: report!.id }
}

const gen = (output: unknown): RawGeneration => ({ output, stopReason: "end_turn", model: "claude-opus-5-5", inputTokens: 1200, outputTokens: 500 })
const base = {
  summary: "Pessoa do turno da tarde relata humilhações públicas recorrentes pela supervisão, com ameaça velada de desligamento.",
  framing: "Os fatos indicam possíveis indícios de assédio moral; a empresa deve apurar com sigilo e garantir não retaliação.",
  legalRefs: ["Lei 14.457/2022 (prevenção ao assédio)"],
  questionsToAsk: ["Desde quando isso acontece?", "Qual o seu nome, para podermos falar com você?"],
  replyDraft: "Obrigado por relatar. Vamos apurar com sigilo e voltamos em até 30 dias pelo protocolo.",
  suggestedAction: { dimension: "lideranca", what: "Código de conduta assinado pelas lideranças", why: "Relato de cobrança humilhante no balcão" },
}

describe("copiloto do canal de relato", () => {
  it("analisa, guarda a análise com o relato e filtra perguntas que identificam o autor", async () => {
    const s = await setup()
    let sent = ""
    setAgentRunner(async (req) => {
      sent = String(req.messages[0]!.content)
      return gen(base)
    })
    const r = await call("agents/channel", { cookie: s.cookie, body: { reportId: s.reportId } })
    expect(r.status, r.text).toBe(200)
    expect(sent).toContain("quem não aguenta pede pra sair")
    expect(r.json.questionsToAsk).toEqual(["Desde quando isso acontece?"])
    expect(r.json.framing).toContain("Não é parecer jurídico")
    expect(r.json.replyDraft).toContain("30 dias")
    const thread = (await call(`channelAdmin/thread?reportId=${encodeURIComponent(SuperJSON.stringify(s.reportId))}`, { cookie: s.cookie })).json
    expect(thread.copilot.summary).toBe(base.summary)
  })

  it("descarta rascunho que pede identificação e ação punitiva", async () => {
    const s = await setup()
    setAgentRunner(async () => gen({ ...base, replyDraft: "Para avançarmos, nos diga em qual setor você trabalha.", suggestedAction: { dimension: "lideranca", what: "Demitir a supervisora", why: "x" } }))
    const r = (await call("agents/channel", { cookie: s.cookie, body: { reportId: s.reportId } })).json
    expect(r.replyDraft).toBe("")
    expect(r.suggestedAction).toBeNull()
    expect(r.warnings.join(" ")).toContain("identificar o autor")
    expect(r.warnings.join(" ")).toContain("medida contra pessoas")
  })

  it("risco imediato na triagem coloca o protocolo de emergência em primeiro lugar", async () => {
    const s = await setup()
    const [rep] = await db.select().from(channelReports).where(eq(channelReports.id, s.reportId))
    await db.update(channelReports).set({ triage: { ...rep!.triage!, urgent: 0.9 } }).where(eq(channelReports.id, s.reportId))
    setAgentRunner(async () => gen(base))
    const r = (await call("agents/channel", { cookie: s.cookie, body: { reportId: s.reportId } })).json
    expect(r.emergency).toBe(true)
    expect(r.warnings[0]).toContain("SAMU 192")
  })

  it("não analisa relato de outra empresa", async () => {
    const a = await setup()
    const b = await setup()
    setAgentRunner(async () => gen(base))
    expect((await call("agents/channel", { cookie: b.cookie, body: { reportId: a.reportId } })).status).toBe(404)
  })
})
