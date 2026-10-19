/* eslint-disable @typescript-eslint/no-explicit-any -- respostas da API inspecionadas livremente nos testes */
import { eq } from "drizzle-orm"
import SuperJSON from "superjson"
import { beforeAll, describe, expect, it } from "vitest"
import { createMemoryDb, type Db } from "@/server/db"
import { campaignParticipants, responseIdentities, responses } from "@/server/db/schema"
import { outbox } from "@/server/email"
import { NR1_STANDARD_ID } from "@/lib/questionnaire"
import { parsePeople } from "@/server/routers/people-router"

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
const get = (path: string, params: Record<string, unknown>, cookie?: string) =>
  call(`${path}?${new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, SuperJSON.stringify(v)])))}`, { cookie })
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

let n = 0
async function setup() {
  n += 1
  const r = await call("auth/signup", { body: { companyName: `Empresa D${n}`, cnpj: "12345678000190", employees: 30, name: `RH ${n}`, email: `d${n}@teste.com`, password: "senha-segura-1", acceptTerms: true } })
  expect(r.status, r.text).toBe(200)
  const sector = await call("sectors/create", { cookie: r.cookie, body: { name: "Entregas", headcount: 6 } })
  return { cookie: r.cookie, sectorId: sector.json.id as string }
}

const pulse = (cookie: string, anonymous: boolean, kind = "pulso") =>
  call("questionnaires/create", {
    cookie,
    body: {
      name: "Pulso Entregas",
      purpose: "acompanhar a nova escala de rotas",
      kind,
      anonymous,
      items: [
        { text: "Recebo mensagens de trabalho fora do meu horário.", dimension: "demandas", risk: true },
        { text: "A rota do dia é definida com tempo suficiente.", dimension: "controle", risk: false },
      ],
    },
  })

describe("pessoas", () => {
  it("lê lista colada com e-mail, telefone e setor", () => {
    const r = parsePeople("Ana Souza; ana@empresa.com; Entregas\nBruno Lima; (11) 98765-4321\nSem contato\nX; y", new Map([["entregas", "s1"]]))
    expect(r.ok).toEqual([
      { name: "Ana Souza", email: "ana@empresa.com", phone: null, sectorId: "s1" },
      { name: "Bruno Lima", email: null, phone: "5511987654321", sectorId: null },
    ])
    expect(r.invalid).toHaveLength(2)
  })
})

describe("questionário identificado", () => {
  it("NR-1 nunca é identificado; pulso pode ser, e o anonimato trava depois do primeiro uso", async () => {
    const s = await setup()
    expect((await pulse(s.cookie, false, "nr1")).status).toBe(400)
    const q = await pulse(s.cookie, false)
    expect(q.status, q.text).toBe(200)
    expect(q.json.anonymous).toBe(false)

    // Sem público não há campanha identificada.
    const none = await call("campaigns/create", { cookie: s.cookie, body: { name: "Sem gente", startsAt: day(0), endsAt: day(5), questionnaireId: q.json.id } })
    expect(none.status).toBe(400)

    await call("employees/bulk", { cookie: s.cookie, body: { text: "Ana Souza; ana@empresa.com; Entregas" } })
    const c = await call("campaigns/create", { cookie: s.cookie, body: { name: "Pulso out", startsAt: day(0), endsAt: day(5), questionnaireId: q.json.id, sectorIds: [s.sectorId] } })
    expect(c.status, c.text).toBe(200)
    const flip = await call("questionnaires/update", { cookie: s.cookie, body: { id: q.json.id, anonymous: true } })
    expect(flip.status).toBe(400)
  })

  it("link pessoal, aceite obrigatório, quem respondeu e o quê; o link geral não abre", async () => {
    const s = await setup()
    const q = (await pulse(s.cookie, false)).json
    const bulk = await call("employees/bulk", { cookie: s.cookie, body: { text: "Ana Souza; ana@empresa.com; Entregas\nBruno Lima; bruno@empresa.com; Entregas\nCarla Dias; carla@empresa.com" } })
    expect(bulk.json.added).toBe(3)
    const people = (await call("employees/list", { cookie: s.cookie })).json
    const carla = people.find((p: any) => p.name === "Carla Dias")
    const c = (await call("campaigns/create", { cookie: s.cookie, body: { name: "Pulso rotas", startsAt: day(0), endsAt: day(5), questionnaireId: q.id, sectorIds: [s.sectorId], employeeIds: [carla.id] } })).json
    const parts = await db.select().from(campaignParticipants).where(eq(campaignParticipants.campaignId, c.id))
    expect(parts).toHaveLength(3)

    // O link geral da campanha não serve para questionário identificado.
    expect((await get("survey/byToken", { token: c.token })).status).toBe(403)

    outbox.length = 0
    const sent = await call("participants/send", { cookie: s.cookie, body: { campaignId: c.id, kind: "invite" } })
    expect(sent.status, sent.text).toBe(200)
    expect(sent.json.emailSent).toBe(3)
    expect(outbox[0]!.text).toContain("verão as suas respostas com o seu nome")

    const ana = parts.find((p) => p.employeeId === people.find((x: any) => x.name === "Ana Souza").id)!
    const info = await get("survey/byToken", { token: ana.token })
    expect(info.status, info.text).toBe(200)
    expect(info.json.person.name).toBe("Ana Souza")
    expect(info.json.questionnaire.anonymous).toBe(false)
    const items = info.json.items.map((i: any) => i.id)

    const body = { token: ana.token, sectorId: s.sectorId, answers: items.map((id: string, i: number) => ({ questionId: id, value: i === 0 ? 5 : 2 })) }
    expect((await call("survey/submit", { body })).status).toBe(422) // sem aceite
    const ok = await call("survey/submit", { body: { ...body, consent: true } })
    expect(ok.status, ok.text).toBe(200)
    expect((await call("survey/submit", { body: { ...body, consent: true } })).status).toBe(409)

    const list = (await get("participants/list", { campaignId: c.id }, s.cookie)).json
    const anaRow = list.participants.find((p: any) => p.name === "Ana Souza")
    expect(anaRow.respondedAt).toBeTruthy()
    expect(anaRow.answers).toEqual({ [items[0]]: 5, [items[1]]: 2 })
    expect(list.participants.find((p: any) => p.name === "Bruno Lima").answers).toBeNull()

    // Lembrete vai só para quem não respondeu.
    outbox.length = 0
    const rem = await call("participants/send", { cookie: s.cookie, body: { campaignId: c.id, kind: "reminder" } })
    expect(rem.json.people).toBe(2)

    // A resposta continua sem identidade na tabela de respostas; o vínculo está à parte.
    const resp = await db.select().from(responses).where(eq(responses.campaignId, c.id))
    expect(Object.keys(resp[0]!)).not.toContain("employeeId")
    expect(await db.select().from(responseIdentities).where(eq(responseIdentities.campaignId, c.id))).toHaveLength(1)
  })

  it("campanha anônima não expõe participantes e não aceita link pessoal", async () => {
    const s = await setup()
    const c = (await call("campaigns/create", { cookie: s.cookie, body: { name: "NR-1", startsAt: day(0), endsAt: day(5), questionnaireId: NR1_STANDARD_ID } })).json
    expect((await get("participants/list", { campaignId: c.id }, s.cookie)).status).toBe(403)
  })

  it("isola pessoas e participantes entre empresas", async () => {
    const a = await setup()
    const b = await setup()
    await call("employees/bulk", { cookie: a.cookie, body: { text: "Pessoa da A; a@a.com" } })
    expect((await call("employees/list", { cookie: b.cookie })).json).toHaveLength(0)
    const q = (await pulse(a.cookie, false)).json
    const people = (await call("employees/list", { cookie: a.cookie })).json
    const created = await call("campaigns/create", { cookie: a.cookie, body: { name: "Pulso A", startsAt: day(0), endsAt: day(5), questionnaireId: q.id, employeeIds: [people[0].id] } })
    expect(created.status, created.text).toBe(200)
    const c = created.json
    expect((await get("participants/list", { campaignId: c.id }, b.cookie)).status).toBe(404)
    // B não consegue usar pessoas de A no público dela.
    const qb = (await pulse(b.cookie, false)).json
    expect((await call("campaigns/create", { cookie: b.cookie, body: { name: "Pulso B", startsAt: day(0), endsAt: day(5), questionnaireId: qb.id, employeeIds: [people[0].id] } })).status).toBe(400)
  })
})
