/* eslint-disable @typescript-eslint/no-explicit-any -- respostas da API inspecionadas livremente nos testes */
import { eq } from "drizzle-orm"
import SuperJSON from "superjson"
import { beforeAll, describe, expect, it } from "vitest"
import { runActionAlerts } from "@/server/action-alerts"
import { createMemoryDb, type Db } from "@/server/db"
import { actions } from "@/server/db/schema"
import { outbox } from "@/server/email"
import { stageOf } from "@/lib/deadline"

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
  const r = await call("auth/signup", { body: { companyName: `Empresa P${n}`, cnpj: "12345678000190", employees: 30, name: `RH ${n}`, email: `p${n}@teste.com`, password: "senha-segura-1", acceptTerms: true } })
  expect(r.status, r.text).toBe(200)
  return { cookie: r.cookie, email: `p${n}@teste.com` }
}
const create = (cookie: string, what: string, due: string, status = "todo") =>
  call("actions/create", { cookie, body: { dimension: "demandas", what, due, status, who: "Rafael" } }).then((r) => {
    expect(r.status, r.text).toBe(200)
    return r.json.id as string
  })

describe("avisos de prazo do plano de ação", () => {
  it("classifica o estágio pela data e ignora concluídas e sem prazo", () => {
    expect(stageOf({ status: "todo", due: day(-1) })).toBe("overdue")
    expect(stageOf({ status: "doing", due: day(0) })).toBe("soon")
    expect(stageOf({ status: "todo", due: day(3) })).toBe("soon")
    expect(stageOf({ status: "todo", due: day(4) })).toBeNull()
    expect(stageOf({ status: "done", due: day(-5) })).toBeNull()
    expect(stageOf({ status: "todo", due: "" })).toBeNull()
  })

  it("envia um resumo por empresa e não repete o aviso no mesmo estágio", async () => {
    const s = await setup()
    await create(s.cookie, "Atrasada A", day(-2))
    await create(s.cookie, "Vencendo B", day(2))
    await create(s.cookie, "Longe C", day(30))
    await create(s.cookie, "Pronta D", day(-9), "done")
    outbox.length = 0
    const r = await runActionAlerts(db, "http://test")
    expect(r.actions).toBeGreaterThanOrEqual(2)
    const mail = outbox.filter((m) => [m.to].flat().includes(s.email))
    expect(mail).toHaveLength(1)
    expect(mail[0]!.html).toContain("Atrasada A")
    expect(mail[0]!.html).toContain("Vencendo B")
    expect(mail[0]!.html).not.toContain("Longe C")
    expect(mail[0]!.html).not.toContain("Pronta D")

    outbox.length = 0
    await runActionAlerts(db, "http://test")
    expect(outbox.filter((m) => [m.to].flat().includes(s.email))).toHaveLength(0) // sem repetição
  })

  it("repete o aviso de atraso após 7 dias e reavalia quando o prazo muda", async () => {
    const s = await setup()
    const id = await create(s.cookie, "Atrasada E", day(-1))
    await runActionAlerts(db, "http://test")
    await db.update(actions).set({ notifiedAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(actions.id, id))
    outbox.length = 0
    await runActionAlerts(db, "http://test")
    expect(outbox.filter((m) => [m.to].flat().includes(s.email))).toHaveLength(1)

    // Novo prazo curto: avisa de novo como "vencendo"; concluir encerra os avisos.
    await call("actions/update", { cookie: s.cookie, body: { id, due: day(1) } })
    outbox.length = 0
    await runActionAlerts(db, "http://test")
    expect(outbox.filter((m) => [m.to].flat().includes(s.email))).toHaveLength(1)
    await call("actions/update", { cookie: s.cookie, body: { id, status: "done" } })
    outbox.length = 0
    await runActionAlerts(db, "http://test")
    expect(outbox.filter((m) => [m.to].flat().includes(s.email))).toHaveLength(0)
  })

  it("expõe o indicador do menu só para a própria empresa", async () => {
    const a = await setup()
    const b = await setup()
    await create(a.cookie, "Atrasada F", day(-3))
    await create(a.cookie, "Vencendo G", day(1))
    expect((await call("actions/deadlines", { cookie: a.cookie })).json).toEqual({ overdue: 1, soon: 1 })
    expect((await call("actions/deadlines", { cookie: b.cookie })).json).toEqual({ overdue: 0, soon: 0 })
  })
})
