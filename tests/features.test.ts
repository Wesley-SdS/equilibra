/* eslint-disable @typescript-eslint/no-explicit-any -- respostas da API inspecionadas livremente nos testes */
import { eq } from "drizzle-orm"
import SuperJSON from "superjson"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createMemoryDb, type Db } from "@/server/db"
import { campaigns } from "@/server/db/schema"
import { outbox } from "@/server/email"
import { runDailyReminders } from "@/server/reminders"
import { QUESTIONS } from "@/lib/methodology"

let db: Db
let app: { fetch: (req: Request) => Response | Promise<Response> }

beforeAll(async () => {
  const memory = createMemoryDb()
  ;(globalThis as { __eqDb?: Promise<Db> }).__eqDb = memory
  db = await memory
  app = (await import("@/server")).default.handler as unknown as typeof app
})
beforeEach(() => {
  outbox.length = 0
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
  const email = `f${n}@teste.com`
  const r = await call("auth/signup", {
    body: { companyName: `Empresa F${n}`, cnpj: "12345678000190", employees: 40, name: `Pessoa ${n}`, email, password: "senha-segura-1" },
  })
  expect(r.status, r.text).toBe(200)
  return { cookie: r.cookie, email }
}

describe("e-mails", () => {
  it("envia boas-vindas no cadastro e o convite por e-mail", async () => {
    const s = await signup()
    expect(outbox.some((e) => e.to === s.email && e.subject.includes("Bem-vindo"))).toBe(true)
    const inv = await call("team/invite", { cookie: s.cookie, body: { email: "nova@teste.com", role: "admin" } })
    expect(inv.json.emailSent).toBe(true)
    const mail = outbox.find((e) => e.to === "nova@teste.com")!
    expect(mail.html).toContain(`/convite/${inv.json.token}`)
  })
})

describe("recuperação de senha", () => {
  it("redefine a senha com link de uso único e não revela e-mails inexistentes", async () => {
    const s = await signup()
    outbox.length = 0 // descarta o e-mail de boas-vindas do cadastro
    const unknown = await call("auth/requestPasswordReset", { body: { email: "naoexiste@teste.com" } })
    expect(unknown.status).toBe(200)
    expect(outbox.length).toBe(0)

    await call("auth/requestPasswordReset", { body: { email: s.email } })
    const mail = outbox.find((e) => e.to === s.email)!
    const token = mail.text.match(/redefinir-senha\/([\w-]+)/)![1]!

    expect((await call(`auth/checkResetToken?token=${token}`)).json.valid).toBe(true)
    const ok = await call("auth/resetPassword", { body: { token, password: "nova-senha-123" } })
    expect(ok.status).toBe(200)
    // Link não pode ser reutilizado
    expect((await call("auth/resetPassword", { body: { token, password: "outra-senha-456" } })).status).toBe(400)
    // Senha antiga deixa de funcionar; a nova funciona
    expect((await call("auth/login", { body: { email: s.email, password: "senha-segura-1" } })).status).toBe(401)
    expect((await call("auth/login", { body: { email: s.email, password: "nova-senha-123" } })).status).toBe(200)
  })
})

describe("perguntas da empresa", () => {
  it("congela as perguntas na campanha e exige respondê-las", async () => {
    const s = await signup()
    const sector = await call("sectors/create", { cookie: s.cookie, body: { name: "Loja", headcount: 20 } })
    const q = await call("questions/create", { cookie: s.cookie, body: { text: "Tenho os equipamentos de que preciso." } })
    expect(q.status, q.text).toBe(200)
    const camp = await call("campaigns/create", { cookie: s.cookie, body: { name: "Com extras", startsAt: "2026-01-01", endsAt: "2099-12-31" } })
    const extraId = `c:${q.json.id}`

    // Editar a pergunta depois não muda a cópia da campanha
    await call("questions/update", { cookie: s.cookie, body: { id: q.json.id, text: "Texto alterado depois do lançamento." } })
    const info = await call(`survey/byToken?token=${camp.json.token}`)
    expect(info.json.customQuestions).toEqual([{ id: extraId, text: "Tenho os equipamentos de que preciso." }])

    const base = QUESTIONS.map((x) => ({ questionId: x.id, value: 3 }))
    const without = await call("survey/submit", { body: { token: camp.json.token, sectorId: sector.json.id, answers: base } })
    expect(without.status).toBe(422)
    for (let i = 0; i < 5; i++) {
      const r = await call("survey/submit", { body: { token: camp.json.token, sectorId: sector.json.id, answers: [...base, { questionId: extraId, value: 4 + (i % 2) }] } })
      expect(r.status, r.text).toBe(200)
    }
    const results = await call(`questions/results?campaignId=${camp.json.id}`, { cookie: s.cookie })
    expect(results.json.enough).toBe(true)
    expect(results.json.items[0]).toMatchObject({ n: 5, favorable: 100, average: 4.4 })
  })

  it("limita a 10 perguntas ativas", async () => {
    const s = await signup()
    for (let i = 0; i < 10; i++) {
      expect((await call("questions/create", { cookie: s.cookie, body: { text: `Pergunta número ${i + 1} da empresa` } })).status).toBe(200)
    }
    const over = await call("questions/create", { cookie: s.cookie, body: { text: "Pergunta onze que não cabe" } })
    expect(over.status).toBe(400)
  })
})

describe("lembretes de campanha", () => {
  it("avisa donos/admins de campanhas perto do fim, uma vez a cada 48 h", async () => {
    const s = await signup()
    await call("sectors/create", { cookie: s.cookie, body: { name: "Operação", headcount: 10 } })
    const today = new Date().toISOString().slice(0, 10)
    const end = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
    const camp = await call("campaigns/create", { cookie: s.cookie, body: { name: "Reta final", startsAt: today, endsAt: end } })

    const first = await runDailyReminders(db, "http://test")
    expect(first.emails).toBeGreaterThan(0)
    expect(outbox.some((e) => e.to === s.email && e.subject.includes("Reta final"))).toBe(true)

    outbox.length = 0
    const second = await runDailyReminders(db, "http://test")
    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, camp.json.id))
    expect(row!.lastReminderAt).not.toBeNull()
    expect(outbox.some((e) => e.subject.includes("Reta final"))).toBe(false)
    expect(second.campaigns).toBeGreaterThanOrEqual(0)
  })
})
