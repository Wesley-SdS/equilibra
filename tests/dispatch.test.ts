/* eslint-disable @typescript-eslint/no-explicit-any -- respostas da API inspecionadas livremente nos testes */
import { eq } from "drizzle-orm"
import SuperJSON from "superjson"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createMemoryDb, type Db } from "@/server/db"
import { campaignContacts, campaignDispatches } from "@/server/db/schema"
import { maskContact, parseContacts, runContactReminders } from "@/server/dispatch"
import { outbox } from "@/server/email"
import { normalizePhone, whatsappOutbox } from "@/server/whatsapp"

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
  whatsappOutbox.length = 0
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
async function setup(endsInDays = 14) {
  n += 1
  const r = await call("auth/signup", {
    body: { companyName: `Empresa D${n}`, cnpj: "12345678000190", employees: 40, name: `Pessoa ${n}`, email: `d${n}@teste.com`, password: "senha-segura-1", acceptTerms: true },
  })
  expect(r.status, r.text).toBe(200)
  await call("sectors/create", { cookie: r.cookie, body: { name: "Loja", headcount: 20 } })
  const today = new Date().toISOString().slice(0, 10)
  const end = new Date(Date.now() + endsInDays * 86_400_000).toISOString().slice(0, 10)
  const camp = await call("campaigns/create", { cookie: r.cookie, body: { name: "Avaliação teste", startsAt: today, endsAt: end } })
  expect(camp.status, camp.text).toBe(200)
  return { cookie: r.cookie, campaign: camp.json as { id: string; token: string } }
}

describe("leitura da lista", () => {
  it("normaliza telefones brasileiros e rejeita inválidos", () => {
    expect(normalizePhone("(11) 98765-4321")).toBe("5511987654321")
    expect(normalizePhone("+55 11 98765-4321")).toBe("5511987654321")
    expect(normalizePhone("1133334444")).toBe("551133334444") // fixo
    expect(normalizePhone("12345")).toBeNull()
    expect(normalizePhone("(11) 88765-4321")).toBeNull() // celular precisa começar com 9
  })

  it("separa WhatsApp e e-mail, remove repetidos e conta inválidos", () => {
    const r = parseContacts("(11) 98765-4321\nMaria@Empresa.com.br; 11987654321, maria@empresa.com.br\nlixo\n@x")
    expect(r.whatsapp).toEqual(["5511987654321"])
    expect(r.email).toEqual(["maria@empresa.com.br"])
    expect(r.invalid).toBe(2)
  })

  it("mascara os contatos para conferência", () => {
    expect(maskContact("whatsapp", "5511987654321")).toBe("+55 11 *****-4321")
    expect(maskContact("email", "maria@empresa.com.br")).toBe("ma***@empresa.com.br")
  })
})

describe("disparo", () => {
  it("exige a declaração de base legal para adicionar contatos", async () => {
    const s = await setup()
    const r = await call("dispatch/add", { cookie: s.cookie, body: { campaignId: s.campaign.id, text: "11987654321", basis: false } })
    expect(r.status).toBe(422)
    expect(r.text).toContain("pode contatar")
  })

  it("envia o MESMO link anônimo a todos e devolve só máscara e contagens", async () => {
    const s = await setup()
    const add = await call("dispatch/add", { cookie: s.cookie, body: { campaignId: s.campaign.id, text: "11987654321\n21988887777\nana@empresa.com.br", basis: true } })
    expect(add.json).toMatchObject({ added: 3, invalid: 0 })

    const send = await call("dispatch/send", { cookie: s.cookie, body: { campaignId: s.campaign.id, kind: "invite" } })
    expect(send.json).toMatchObject({ whatsappSent: 2, emailSent: 1, failed: 0 })
    const link = `/r/${s.campaign.token}`
    expect(whatsappOutbox.map((m) => m.params[2])).toEqual([expect.stringContaining(link), expect.stringContaining(link)])
    expect(new Set(whatsappOutbox.map((m) => m.params[2])).size).toBe(1)
    expect(outbox.find((e) => e.to === "ana@empresa.com.br")!.text).toContain(link)

    const summary = await call(`dispatch/summary?campaignId=${s.campaign.id}`, { cookie: s.cookie })
    expect(summary.json).toMatchObject({ whatsapp: 2, email: 1 })
    expect(summary.text).not.toContain("5511987654321") // a lista completa nunca sai do servidor
    expect(summary.text).not.toContain("ana@empresa.com.br")
    expect(summary.json.history[0]).toMatchObject({ kind: "invite", trigger: "manual", whatsappSent: 2, emailSent: 1 })
  })

  it("apaga a lista quando a campanha é encerrada", async () => {
    const s = await setup()
    await call("dispatch/add", { cookie: s.cookie, body: { campaignId: s.campaign.id, text: "11987654321", basis: true } })
    await call("campaigns/setStatus", { cookie: s.cookie, body: { id: s.campaign.id, status: "closed" } })
    const left = await db.select().from(campaignContacts).where(eq(campaignContacts.campaignId, s.campaign.id))
    expect(left).toHaveLength(0)
    const after = await call("dispatch/send", { cookie: s.cookie, body: { campaignId: s.campaign.id, kind: "reminder" } })
    expect(after.status).toBe(409)
  })

  it("isola campanhas de outras empresas", async () => {
    const a = await setup()
    const b = await setup()
    const r = await call("dispatch/add", { cookie: b.cookie, body: { campaignId: a.campaign.id, text: "11987654321", basis: true } })
    expect(r.status).toBe(404)
    expect((await call(`dispatch/summary?campaignId=${a.campaign.id}`, { cookie: b.cookie })).status).toBe(404)
  })
})

describe("lembrete automático", () => {
  it("envia na reta final, uma vez a cada 48 h, e ignora campanhas longe do fim", async () => {
    const near = await setup(2)
    const far = await setup(20)
    for (const s of [near, far]) {
      await call("dispatch/add", { cookie: s.cookie, body: { campaignId: s.campaign.id, text: "11987654321", basis: true } })
    }
    whatsappOutbox.length = 0

    const first = await runContactReminders(db, "http://test")
    expect(first.campaigns).toBeGreaterThanOrEqual(1)
    const sent = await db.select().from(campaignDispatches).where(eq(campaignDispatches.campaignId, near.campaign.id))
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ kind: "reminder", trigger: "auto" })
    expect(await db.select().from(campaignDispatches).where(eq(campaignDispatches.campaignId, far.campaign.id))).toHaveLength(0)

    await runContactReminders(db, "http://test")
    expect(await db.select().from(campaignDispatches).where(eq(campaignDispatches.campaignId, near.campaign.id))).toHaveLength(1)
  })
})
