/* eslint-disable @typescript-eslint/no-explicit-any -- respostas da API inspecionadas livremente nos testes */
import SuperJSON from "superjson"
import { beforeAll, describe, expect, it } from "vitest"
import { createMemoryDb, type Db } from "@/server/db"
import { campaigns } from "@/server/db/schema"
import { closeExpiredCampaigns, phaseOf } from "@/server/campaigns"
import { QUESTIONS } from "@/lib/methodology"
import { eq } from "drizzle-orm"

let db: Db
let app: { fetch: (req: Request) => Response | Promise<Response> }

beforeAll(async () => {
  const memory = createMemoryDb()
  ;(globalThis as { __eqDb?: Promise<Db> }).__eqDb = memory
  db = await memory
  app = (await import("@/server")).default.handler as unknown as typeof app
})

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

let n = 0
async function setup() {
  n += 1
  const r = await call("auth/signup", { body: { companyName: `Empresa K${n}`, cnpj: "12345678000190", employees: 30, name: `RH ${n}`, email: `k${n}@teste.com`, password: "senha-segura-1", acceptTerms: true } })
  expect(r.status, r.text).toBe(200)
  const sector = await call("sectors/create", { cookie: r.cookie, body: { name: "Produção", headcount: 10 } })
  return { cookie: r.cookie, sectorId: sector.json.id as string }
}
const answers = QUESTIONS.map((q) => ({ questionId: q.id, value: 3 }))

describe("agendamento, edição e duplicação de campanhas", () => {
  it("calcula a fase pela data", () => {
    expect(phaseOf({ status: "active", startsAt: "2026-10-20", endsAt: "2026-10-30" }, "2026-10-17")).toBe("scheduled")
    expect(phaseOf({ status: "active", startsAt: "2026-10-01", endsAt: "2026-10-30" }, "2026-10-17")).toBe("open")
    expect(phaseOf({ status: "active", startsAt: "2026-10-01", endsAt: "2026-10-16" }, "2026-10-17")).toBe("expired")
    expect(phaseOf({ status: "closed", startsAt: "2026-10-01", endsAt: "2026-10-30" }, "2026-10-17")).toBe("closed")
  })

  it("campanha agendada só recebe respostas a partir da data de abertura", async () => {
    const s = await setup()
    const c = (await call("campaigns/create", { cookie: s.cookie, body: { name: "Futura", startsAt: day(3), endsAt: day(10) } })).json
    expect((await call("campaigns/list", { cookie: s.cookie })).json[0].phase).toBe("scheduled")
    const body = { token: c.token, sectorId: s.sectorId, answers }
    expect((await call("survey/submit", { body })).status).toBe(425)
    // Antecipar a abertura pela edição libera as respostas.
    expect((await call("campaigns/update", { cookie: s.cookie, body: { id: c.id, name: "Futura", startsAt: day(0), endsAt: day(10) } })).status).toBe(200)
    expect((await call("survey/submit", { body })).status).toBe(200)
  })

  it("não aceita respostas depois do prazo, mesmo antes do cron encerrar", async () => {
    const s = await setup()
    const c = (await call("campaigns/create", { cookie: s.cookie, body: { name: "Vencida", startsAt: day(-10), endsAt: day(5) } })).json
    await db.update(campaigns).set({ endsAt: day(-1) }).where(eq(campaigns.id, c.id))
    expect((await call("survey/submit", { body: { token: c.token, sectorId: s.sectorId, answers } })).status).toBe(410)
    expect((await call("campaigns/list", { cookie: s.cookie })).json[0].phase).toBe("expired")
  })

  it("o cron encerra campanhas vencidas e a reabertura exige novo prazo", async () => {
    const s = await setup()
    const c = (await call("campaigns/create", { cookie: s.cookie, body: { name: "Auto", startsAt: day(-10), endsAt: day(5) } })).json
    await db.update(campaigns).set({ endsAt: day(-1) }).where(eq(campaigns.id, c.id))
    const r = await closeExpiredCampaigns(db)
    expect(r.closed).toBeGreaterThanOrEqual(1)
    expect((await call("campaigns/get?id=" + c.id, { cookie: s.cookie })).json.phase).toBe("closed")
    expect((await call("campaigns/setStatus", { cookie: s.cookie, body: { id: c.id, status: "active" } })).status).toBe(400)
    expect((await closeExpiredCampaigns(db)).closed).toBe(0) // idempotente
    const ed = await call("campaigns/update", { cookie: s.cookie, body: { id: c.id, name: "Auto", startsAt: day(-10), endsAt: day(7) } })
    expect(ed.status, ed.text).toBe(200)
    expect(ed.json.status).toBe("active")
  })

  it("valida datas e isola por empresa na edição", async () => {
    const a = await setup()
    const b = await setup()
    const c = (await call("campaigns/create", { cookie: a.cookie, body: { name: "Da A", startsAt: day(0), endsAt: day(5) } })).json
    expect((await call("campaigns/update", { cookie: a.cookie, body: { id: c.id, name: "Da A", startsAt: day(5), endsAt: day(1) } })).status).toBe(422)
    expect((await call("campaigns/update", { cookie: b.cookie, body: { id: c.id, name: "Invadida", startsAt: day(0), endsAt: day(5) } })).status).toBe(404)
    expect((await call("campaigns/duplicate", { cookie: b.cookie, body: { id: c.id } })).status).toBe(404)
  })

  it("duplica com link novo, mesma duração e perguntas atuais da empresa", async () => {
    const s = await setup()
    const c = (await call("campaigns/create", { cookie: s.cookie, body: { name: "Original", startsAt: day(-20), endsAt: day(-6) } })).json
    await call("questions/create", { cookie: s.cookie, body: { text: "Você tem autonomia para organizar o seu turno?" } })
    const copy = await call("campaigns/duplicate", { cookie: s.cookie, body: { id: c.id } })
    expect(copy.status, copy.text).toBe(200)
    expect(copy.json.name).toBe("Original (cópia)")
    expect(copy.json.token).not.toBe(c.token)
    expect(copy.json.startsAt).toBe(day(0))
    expect(copy.json.endsAt).toBe(day(14))
    expect(copy.json.customQuestions).toHaveLength(1)
    expect(copy.json.phase).toBe("open")
  })
})
