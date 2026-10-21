/* eslint-disable @typescript-eslint/no-explicit-any -- respostas da API inspecionadas livremente nos testes */
import { eq } from "drizzle-orm"
import SuperJSON from "superjson"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { createMemoryDb, type Db } from "@/server/db"
import { actions, campaigns } from "@/server/db/schema"
import { setAgentRunner } from "@/server/agents/client"
import { QUESTIONS } from "@/lib/methodology"

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
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
const answers = (high: boolean) => QUESTIONS.map((q) => ({ questionId: q.id, value: q.dimension === "demandas" ? (q.risk === high ? 5 : 1) : 3 }))

let n = 0
async function setupWithTwoCampaigns() {
  n += 1
  const r = await call("auth/signup", { body: { companyName: `Empresa P${n}`, cnpj: "12345678000190", employees: 30, name: "RH", email: `pl${n}@teste.com`, password: "senha-segura-1", acceptTerms: true } })
  const cookie = r.cookie
  const sector = (await call("sectors/create", { cookie, body: { name: "Produção", headcount: 12 } })).json
  const first = (await call("campaigns/create", { cookie, body: { name: "Abril", startsAt: day(0), endsAt: day(5) } })).json
  for (let i = 0; i < 5; i++) await call("survey/submit", { body: { token: first.token, sectorId: sector.id, answers: answers(true) } })
  await db.update(campaigns).set({ startsAt: day(-150), endsAt: day(-140), status: "closed" }).where(eq(campaigns.id, first.id))
  const second = (await call("campaigns/create", { cookie, body: { name: "Outubro", startsAt: day(0), endsAt: day(5) } })).json
  for (let i = 0; i < 5; i++) await call("survey/submit", { body: { token: second.token, sectorId: sector.id, answers: answers(false) } })
  return { cookie, sectorId: sector.id as string, first, second }
}

describe("plano de ação com contexto de risco", () => {
  it("mostra o score que motivou a ação e o da campanha seguinte; etapas e evidência são salvas", async () => {
    const s = await setupWithTwoCampaigns()
    const created = await call("actions/create", {
      cookie: s.cookie,
      body: { dimension: "demandas", what: "Instituir pausas nos picos", sectorId: s.sectorId, status: "done", evidence: "Escala assinada", steps: [{ text: "Publicar escala", done: true }] },
    })
    expect(created.status, created.text).toBe(200)
    // Concluída há 90 dias: entre as duas campanhas.
    await db.update(actions).set({ completedAt: new Date(Date.now() - 90 * 86_400_000) }).where(eq(actions.id, created.json.id))
    const list = (await call("actions/list", { cookie: s.cookie })).json
    const a = list.find((x: any) => x.id === created.json.id)
    expect(a.riskBefore).toBe(100)
    expect(a.riskAfter).toBe(0)
    expect(a.steps).toEqual([{ text: "Publicar escala", done: true }])
    expect(a.evidence).toBe("Escala assinada")
  })
})

describe("copiloto do plano", () => {
  it("recebe só agregados, responde e descarta sugestões punitivas", async () => {
    const s = await setupWithTwoCampaigns()
    let prompt = ""
    setAgentRunner(async (req) => {
      prompt = String(req.messages[0]!.content)
      return {
        output: {
          answer: "Demandas caiu de 100 para 0 na Produção.",
          citedNumbers: ["Demandas na Produção: 100 → 0"],
          actions: [
            { dimension: "demandas", sectorKey: s.sectorId, what: "Manter a escala de pausas", why: "Efeito medido", who: "RH", dueInDays: 30, how: "Revisar mensalmente", cost: "R$ 0", steps: ["Revisar", "Comunicar"] },
            { dimension: "lideranca", sectorKey: "setor-inexistente", what: "Demitir o supervisor do turno", why: "x", who: "Diretoria", dueInDays: 5, how: "x", cost: "x", steps: [] },
          ],
        },
        stopReason: "end_turn",
        model: "claude-opus-5-5",
        inputTokens: 1000,
        outputTokens: 300,
      }
    })
    const r = await call("agents/plan", { cookie: s.cookie, body: { question: "O que fazer agora com Demandas?" } })
    expect(r.status, r.text).toBe(200)
    expect(prompt).toContain('"indice_geral"')
    expect(prompt).not.toMatch(/teste\.com/) // nada de e-mails ou identificação no contexto
    expect(r.json.actions).toHaveLength(1)
    expect(r.json.actions[0].sectorKey).toBe(s.sectorId)
    expect(r.json.warnings[0]).toContain("medida contra pessoas")

    // Aceitar a sugestão grava a origem "copiloto".
    const saved = await call("actions/create", { cookie: s.cookie, body: { dimension: "demandas", what: "Manter a escala de pausas", fromCopilot: true } })
    expect(saved.json.decision).toEqual({ engine: "copiloto" })
  })
})
