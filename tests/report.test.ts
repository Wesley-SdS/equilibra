/* eslint-disable @typescript-eslint/no-explicit-any -- respostas da API inspecionadas livremente nos testes */
import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import SuperJSON from "superjson"
import { afterEach, beforeAll, describe, expect, it } from "vitest"
import { createMemoryDb, type Db } from "@/server/db"
import { setAgentRunner } from "@/server/agents/client"
import { ReportPdf } from "@/server/pdf/report-pdf"
import { buildReport } from "@/server/report"
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

let n = 0
async function setup() {
  n += 1
  const r = await call("auth/signup", { body: { companyName: `Empresa R${n}`, cnpj: "12345678000190", employees: 30, name: `Ana ${n}`, email: `r${n}@teste.com`, password: "senha-segura-1", acceptTerms: true } })
  const cookie = r.cookie
  const sector = (await call("sectors/create", { cookie, body: { name: "Produção", headcount: 10 } })).json
  const c = (await call("campaigns/create", { cookie, body: { name: "Outubro", startsAt: day(0), endsAt: day(5) } })).json
  for (let i = 0; i < 6; i++) await call("survey/submit", { body: { token: c.token, sectorId: sector.id, answers: QUESTIONS.map((q) => ({ questionId: q.id, value: q.dimension === "demandas" ? (q.risk ? 5 : 1) : 2 })) } })
  const me = (await call("auth/me", { cookie })).json
  return { cookie, campaign: c, sectorId: sector.id as string, companyId: me.company.id as string }
}

describe("relatório PGR", () => {
  it("resumo por regras (sem IA): rascunho, edição, aprovação com nome e data; só o aprovado vai para o relatório", async () => {
    const s = await setup()
    const gen = await call("report/generateSummary", { cookie: s.cookie, body: { campaignId: s.campaign.id } })
    expect(gen.status, gen.text).toBe(200)
    expect(gen.json.engine).toBe("regras")
    expect(gen.json.text).toContain("Demandas do trabalho")
    expect(gen.json.text).toMatch(/Ainda não há ação aberta para: .*Demandas do trabalho/)

    let rep = (await call("report/get", { cookie: s.cookie })).json
    expect(rep.summary).toBeNull()
    expect(rep.summaryDraft.id).toBe(gen.json.id)

    const edited = `${gen.json.text} Texto revisado pelo responsável técnico.`
    expect((await call("report/saveSummary", { cookie: s.cookie, body: { id: gen.json.id, text: edited } })).status).toBe(200)
    expect((await call("report/approveSummary", { cookie: s.cookie, body: { id: gen.json.id } })).status).toBe(200)
    rep = (await call("report/get", { cookie: s.cookie })).json
    expect(rep.summary.text).toBe(edited)
    expect(rep.summary.approvedByName).toBe(`Ana ${n}`)
    expect(rep.summaryDraft).toBeNull()
  })

  it("resumo pelo copiloto quando disponível; observações e PDF com resumo e evidência", async () => {
    const s = await setup()
    setAgentRunner(async () => ({ output: { summary: "Resumo do copiloto com índice e riscos citados a partir dos fatos, em prosa, para a direção e o auditor." }, stopReason: "end_turn", model: "claude-opus-5-5", inputTokens: 500, outputTokens: 120 }))
    const gen = (await call("report/generateSummary", { cookie: s.cookie, body: { campaignId: s.campaign.id } })).json
    expect(gen.engine).toBe("copiloto")
    await call("report/approveSummary", { cookie: s.cookie, body: { id: gen.id } })

    const obs = await call("report/addObservation", { cookie: s.cookie, body: { day: day(-3), method: "grupo", sectorId: s.sectorId, participants: 8, summary: "Turno da noite relata metas que mudam na semana sem aviso." } })
    expect(obs.status, obs.text).toBe(200)
    const bad = await call("report/addObservation", { cookie: s.cookie, body: { day: day(0), method: "conversa", summary: "curto" } })
    expect(bad.status).toBe(422)

    const act = (await call("actions/create", { cookie: s.cookie, body: { dimension: "demandas", what: "Rever metas do turno da noite", status: "done", evidence: "Ata da reunião de metas" } })).json
    expect(act.completedAt).toBeTruthy()

    const report = await buildReport(db, s.companyId)
    expect(report.observations).toHaveLength(1)
    const pdf = await renderToBuffer(createElement(ReportPdf, { report }) as Parameters<typeof renderToBuffer>[0])
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF")
    expect(pdf.length).toBeGreaterThan(3000)
  })
})
