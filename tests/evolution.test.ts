/* eslint-disable @typescript-eslint/no-explicit-any -- respostas da API inspecionadas livremente nos testes */
import { eq } from "drizzle-orm"
import SuperJSON from "superjson"
import { beforeAll, describe, expect, it } from "vitest"
import { createMemoryDb, type Db } from "@/server/db"
import { actions, campaigns } from "@/server/db/schema"
import { computeEvolution } from "@/server/evolution"
import { QUESTIONS } from "@/lib/methodology"

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

/** Responde com risco alto (5 = sempre nos itens de risco, 1 nos de proteção) ou baixo, em Demandas. */
const answersFor = (highDemand: boolean) =>
  QUESTIONS.map((q) => ({ questionId: q.id, value: q.dimension === "demandas" ? (q.risk === highDemand ? 5 : 1) : 3 }))

describe("evolução entre campanhas", () => {
  it("compara as duas campanhas, monta a frase por regras e marca a ação concluída e a data de conclusão", async () => {
    const r = await call("auth/signup", { body: { companyName: "Empresa E1", cnpj: "12345678000190", employees: 30, name: "RH", email: "e1@teste.com", password: "senha-segura-1", acceptTerms: true } })
    const cookie = r.cookie
    const sector = (await call("sectors/create", { cookie, body: { name: "Produção", headcount: 12 } })).json
    const first = (await call("campaigns/create", { cookie, body: { name: "Diagnóstico", startsAt: day(0), endsAt: day(5) } })).json
    for (let i = 0; i < 6; i++) await call("survey/submit", { body: { token: first.token, sectorId: sector.id, answers: answersFor(true) } })
    // A primeira campanha "aconteceu" há 4 meses.
    await db.update(campaigns).set({ startsAt: day(-120), endsAt: day(-110), status: "closed" }).where(eq(campaigns.id, first.id))

    const act = (await call("actions/create", { cookie, body: { dimension: "demandas", what: "Instituir pausas nos picos", sectorId: sector.id } })).json
    await call("actions/update", { cookie, body: { id: act.id, status: "done" } })
    const [done] = await db.select().from(actions).where(eq(actions.id, act.id))
    expect(done!.completedAt).toBeInstanceOf(Date)
    await db.update(actions).set({ completedAt: new Date(Date.now() - 60 * 86_400_000) }).where(eq(actions.id, act.id))

    const second = (await call("campaigns/create", { cookie, body: { name: "Reavaliação", startsAt: day(0), endsAt: day(5) } })).json
    for (let i = 0; i < 6; i++) await call("survey/submit", { body: { token: second.token, sectorId: sector.id, answers: answersFor(false) } })

    const evo = (await call("insights/evolution", { cookie })).json
    expect(evo.enough).toBe(true)
    expect(evo.from.id).toBe(first.id)
    expect(evo.to.id).toBe(second.id)
    expect(evo.kpis.delta).toBeLessThan(0)
    expect(evo.lead).toMatch(/caiu \d+ pontos/)
    expect(evo.lead).toContain("Demandas do trabalho foi o que mais melhorou")
    expect(evo.lead).toContain("1 ação foi concluída no período; 1 delas é de Demandas do trabalho")
    const demand = evo.cells.find((c: any) => c.dimension === "demandas")
    expect(demand.delta).toBe(-100)
    expect(evo.actionsDone[0].what).toBe("Instituir pausas nos picos")
    expect(evo.hotspots).toHaveLength(0)

    // Reabrir a ação apaga a data de conclusão.
    await call("actions/update", { cookie, body: { id: act.id, status: "doing" } })
    expect((await db.select().from(actions).where(eq(actions.id, act.id)))[0]!.completedAt).toBeNull()
  })

  it("sem duas campanhas NR-1 não há comparação", async () => {
    const r = await call("auth/signup", { body: { companyName: "Empresa E2", cnpj: "12345678000190", employees: 30, name: "RH", email: "e2@teste.com", password: "senha-segura-1", acceptTerms: true } })
    const me = (await call("auth/me", { cookie: r.cookie })).json
    const evo = await computeEvolution(db, me.company.id)
    expect(evo.enough).toBe(false)
  })
})
