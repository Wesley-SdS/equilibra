/* eslint-disable @typescript-eslint/no-explicit-any -- respostas da API inspecionadas livremente nos testes */
import { eq } from "drizzle-orm"
import SuperJSON from "superjson"
import { beforeAll, describe, expect, it } from "vitest"
import { createMemoryDb, type Db } from "@/server/db"
import { campaigns } from "@/server/db/schema"
import { computeInsights } from "@/server/insights"
import { MTE_ITEMS, effectiveSeverity, methodologyById } from "@/lib/methodologies"
import { DIMENSIONS } from "@/lib/methodology"

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
  const r = await call("auth/signup", { body: { companyName: `Empresa M${n}`, cnpj: "12345678000190", employees: 30, name: `RH ${n}`, email: `m${n}@teste.com`, password: "senha-segura-1", acceptTerms: true } })
  expect(r.status, r.text).toBe(200)
  const sector = await call("sectors/create", { cookie: r.cookie, body: { name: "Produção", headcount: 12 } })
  return { cookie: r.cookie, sectorId: sector.json.id as string }
}

describe("catálogo de metodologias", () => {
  it("o Guia MTE cobre as 7 dimensões com 3 itens cada, misturando risco e proteção", () => {
    expect(MTE_ITEMS).toHaveLength(21)
    for (const d of DIMENSIONS) {
      const items = MTE_ITEMS.filter((i) => i.dimension === d.id)
      expect(items).toHaveLength(3)
    }
    expect(MTE_ITEMS.some((i) => i.risk) && MTE_ITEMS.some((i) => !i.risk)).toBe(true)
  })

  it("severidade efetiva aplica ajustes dentro de 1 a 5", () => {
    const s = effectiveSeverity("equilibra", { demandas: 9, papel: 0 })
    expect(s.demandas).toBe(5)
    expect(s.papel).toBe(1)
    expect(s.relacoes).toBe(methodologyById("equilibra").severity.relacoes)
  })
})

describe("metodologia da empresa", () => {
  it("troca para o Guia MTE: campanhas novas usam o questionário MTE e guardam a metodologia; as antigas não mudam", async () => {
    const s = await setup()
    const before = (await call("campaigns/create", { cookie: s.cookie, body: { name: "Antes", startsAt: day(0), endsAt: day(5) } })).json
    expect(before.methodology.id).toBe("equilibra")

    const set = await call("company/setMethodology", { cookie: s.cookie, body: { id: "mte", note: "Guia MTE adotado pelo SESMT.", severity: { demandas: 5 } } })
    expect(set.status, set.text).toBe(200)
    const got = (await call("company/methodology", { cookie: s.cookie })).json
    expect(got.current).toMatchObject({ id: "mte", questionnaireId: "mte-padrao" })
    expect(got.current.severity.demandas).toBe(5)

    const after = (await call("campaigns/create", { cookie: s.cookie, body: { name: "Depois", startsAt: day(0), endsAt: day(5) } })).json
    expect(after.methodology).toMatchObject({ id: "mte", justification: "Guia MTE adotado pelo SESMT." })
    expect(after.methodology.severity.demandas).toBe(5)
    const survey = await call(`survey/byToken?token=${encodeURIComponent(SuperJSON.stringify(after.token))}`)
    expect(survey.json.items.filter((i: any) => i.id.startsWith("mte_"))).toHaveLength(21)

    const [old] = await db.select().from(campaigns).where(eq(campaigns.id, before.id))
    expect(old!.methodology!.id).toBe("equilibra")

    // A severidade da campanha vai para o inventário.
    const ids = survey.json.items.map((i: any) => i.id)
    for (let k = 0; k < 5; k++) await call("survey/submit", { body: { token: after.token, sectorId: s.sectorId, answers: ids.map((id: string) => ({ questionId: id, value: 1 + ((k + id.length) % 5) })) } })
    const insights = (await computeInsights(db, after.companyId, after.id))!
    expect(insights.ranking.find((r) => r.id === "demandas")!.severity).toBe(5)
  })

  it("recusa metodologias aguardando licença e exige justificativa e questionário na própria", async () => {
    const s = await setup()
    expect((await call("company/setMethodology", { cookie: s.cookie, body: { id: "copsoq3" } })).status).toBe(400)
    expect((await call("company/setMethodology", { cookie: s.cookie, body: { id: "propria", note: "curta" } })).status).toBe(400)
    const pulse = (await call("questionnaires/create", { cookie: s.cookie, body: { name: "Pulso", kind: "pulso", items: [{ text: "Me sinto parte da equipe.", dimension: "colegas", risk: false }] } })).json
    const notNr1 = await call("company/setMethodology", { cookie: s.cookie, body: { id: "propria", note: "Instrumento validado pela consultoria Exemplo com 300 trabalhadores do setor.", questionnaireId: pulse.id } })
    expect(notNr1.status).toBe(400)
    const own = (await call("questionnaires/duplicate", { cookie: s.cookie, body: { id: "nr1-padrao" } })).json
    const ok = await call("company/setMethodology", { cookie: s.cookie, body: { id: "propria", note: "Instrumento validado pela consultoria Exemplo com 300 trabalhadores do setor.", questionnaireId: own.id } })
    expect(ok.status, ok.text).toBe(200)
    const c = (await call("campaigns/create", { cookie: s.cookie, body: { name: "Própria", startsAt: day(0), endsAt: day(5) } })).json
    expect(c.methodology.id).toBe("propria")
  })
})
