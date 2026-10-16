/* eslint-disable @typescript-eslint/no-explicit-any -- respostas da API inspecionadas livremente nos testes */
import { eq } from "drizzle-orm"
import SuperJSON from "superjson"
import { beforeAll, describe, expect, it } from "vitest"
import { createMemoryDb, type Db } from "@/server/db"
import { companies } from "@/server/db/schema"
import { applyBillingEvent, entitlements } from "@/server/billing"
import { TRIAL_DAYS } from "@/lib/plans"

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

let n = 0
async function signup() {
  n += 1
  const r = await call("auth/signup", {
    body: { companyName: `Empresa B${n}`, cnpj: "12345678000190", employees: 30, name: `Pessoa ${n}`, email: `b${n}@teste.com`, password: "senha-segura-1" },
  })
  expect(r.status, r.text).toBe(200)
  const me = await call("auth/me", { cookie: r.cookie })
  return { cookie: r.cookie, companyId: me.json.company.id as string }
}

describe("assinatura", () => {
  it("começa com teste grátis de 14 dias com recursos do Profissional", async () => {
    const s = await signup()
    const st = await call("billing/status", { cookie: s.cookie })
    expect(st.json).toMatchObject({ status: "trialing", inTrial: true, trialDaysLeft: TRIAL_DAYS, readOnly: false, plan: { id: "profissional" } })
    expect(st.json.limits.campaignsPerYear).toBeNull() // ilimitado vira null no JSON
  })

  it("aplica os limites do Essencial: campanhas por ano, equipe e funcionários", async () => {
    const s = await signup()
    await applyBillingEvent(db, { type: "subscription.active", companyId: s.companyId, plan: "essencial", interval: "monthly", currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) }, "teste")

    expect((await call("sectors/create", { cookie: s.cookie, body: { name: "Loja", headcount: 40 } })).status).toBe(200)
    const tooMany = await call("sectors/create", { cookie: s.cookie, body: { name: "Depósito", headcount: 20 } })
    expect(tooMany.status).toBe(402)
    expect(tooMany.text).toContain("até 50 funcionários")

    const camp = { startsAt: "2026-01-01", endsAt: "2099-12-31" }
    expect((await call("campaigns/create", { cookie: s.cookie, body: { name: "Primeira", ...camp } })).status).toBe(200)
    expect((await call("campaigns/create", { cookie: s.cookie, body: { name: "Segunda", ...camp } })).status).toBe(200)
    expect((await call("campaigns/create", { cookie: s.cookie, body: { name: "Terceira", ...camp } })).status).toBe(402)

    // 2 assentos: dono + 1 convite
    expect((await call("team/invite", { cookie: s.cookie, body: { email: "x1@teste.com", role: "viewer" } })).status).toBe(200)
    expect((await call("team/invite", { cookie: s.cookie, body: { email: "x2@teste.com", role: "viewer" } })).status).toBe(402)

    // Canal de relato não incluído no Essencial
    const company = await db.query.companies.findFirst({ where: eq(companies.id, s.companyId) })
    const report = await call("channel/submit", { body: { slug: company!.slug, category: "outro", body: "Texto de relato com mais de vinte caracteres." } })
    expect(report.status).toBe(403)
  })

  it("fica em modo leitura quando o teste acaba, mas continua mostrando os dados", async () => {
    const s = await signup()
    await call("sectors/create", { cookie: s.cookie, body: { name: "Operação", headcount: 10 } })
    await db.update(companies).set({ trialEndsAt: new Date(Date.now() - 1000) }).where(eq(companies.id, s.companyId))

    expect((await call("sectors/list", { cookie: s.cookie })).status).toBe(200)
    const blocked = await call("sectors/create", { cookie: s.cookie, body: { name: "Nova", headcount: 5 } })
    expect(blocked.status).toBe(402)
    expect(blocked.text).toContain("teste grátis terminou")
    expect((await call("billing/status", { cookie: s.cookie })).json.readOnly).toBe(true)
  })

  it("dá 7 dias de carência quando o pagamento falha", () => {
    const base = { subscriptionStatus: "past_due", plan: "profissional", trialEndsAt: null } as const
    const inGrace = entitlements({ ...base, currentPeriodEnd: new Date(Date.now() - 2 * 86_400_000) } as any)
    const after = entitlements({ ...base, currentPeriodEnd: new Date(Date.now() - 8 * 86_400_000) } as any)
    expect(inGrace.readOnly).toBe(false)
    expect(after.readOnly).toBe(true)
  })

  it("sem provedor configurado, o checkout responde com mensagem clara", async () => {
    const s = await signup()
    const r = await call("billing/checkout", { cookie: s.cookie, body: { plan: "profissional", interval: "monthly" } })
    expect(r.status).toBe(503)
    expect(r.text).toContain("pagamento online ainda não está disponível")
  })
})
