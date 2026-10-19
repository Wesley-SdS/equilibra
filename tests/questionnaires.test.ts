/* eslint-disable @typescript-eslint/no-explicit-any -- respostas da API inspecionadas livremente nos testes */
import { eq } from "drizzle-orm"
import SuperJSON from "superjson"
import { beforeAll, describe, expect, it } from "vitest"
import { createMemoryDb, type Db } from "@/server/db"
import { answers, campaigns, questionnaireVersions, responses } from "@/server/db/schema"
import { computeInsights } from "@/server/insights"
import { DIMENSIONS, QUESTIONS, scoreDimensions } from "@/lib/methodology"
import { NR1_STANDARD_ID, NR1_STANDARD_VERSION_ID } from "@/lib/questionnaire"

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
  const r = await call("auth/signup", { body: { companyName: `Empresa Q${n}`, cnpj: "12345678000190", employees: 30, name: `RH ${n}`, email: `q${n}@teste.com`, password: "senha-segura-1", acceptTerms: true } })
  expect(r.status, r.text).toBe(200)
  const sector = await call("sectors/create", { cookie: r.cookie, body: { name: "Produção", headcount: 12 } })
  return { cookie: r.cookie, sectorId: sector.json.id as string }
}

/** Respostas determinísticas e variadas: cada pessoa responde um padrão diferente. */
const pattern = (ids: string[], seed: number) => ids.map((id, i) => ({ questionId: id, value: 1 + ((i * 7 + seed * 3) % 5) }))

describe("questionários versionados", () => {
  it("a migration cria o NR-1 padrão e a campanha nova aponta para a versão 1 por padrão", async () => {
    const s = await setup()
    const lib = await call("questionnaires/list", { cookie: s.cookie })
    expect(lib.status, lib.text).toBe(200)
    const std = lib.json.find((q: any) => q.id === NR1_STANDARD_ID)
    expect(std).toBeTruthy()
    expect(std.companyId).toBeNull()
    expect(std.kind).toBe("nr1")
    expect(std.anonymous).toBe(true)
    expect(std.itemCount).toBe(QUESTIONS.length)
    expect(std.version).toBe(1)

    const c = await call("campaigns/create", { cookie: s.cookie, body: { name: "Padrão", startsAt: day(0), endsAt: day(10) } })
    expect(c.status, c.text).toBe(200)
    expect(c.json.questionnaireVersionId).toBe(NR1_STANDARD_VERSION_ID)
    const list = await call("campaigns/list", { cookie: s.cookie })
    expect(list.json[0].questionnaire).toMatchObject({ id: NR1_STANDARD_ID, kind: "nr1", version: 1, itemCount: QUESTIONS.length })
  })

  it("regressão: o cálculo com o NR-1 padrão é idêntico ao cálculo direto da metodologia", async () => {
    const s = await setup()
    const c = (await call("campaigns/create", { cookie: s.cookie, body: { name: "Regressão", startsAt: day(0), endsAt: day(10) } })).json
    const ids = QUESTIONS.map((q) => q.id)
    for (let i = 0; i < 7; i++) {
      // Cookie de "já respondi" é por dispositivo: cada envio é um navegador diferente (sem cookie).
      const r = await call("survey/submit", { body: { token: c.token, sectorId: s.sectorId, answers: pattern(ids, i) } })
      expect(r.status, r.text).toBe(200)
    }
    const data = (await computeInsights(db, c.companyId, c.id))!
    expect(data.questionnaire).toMatchObject({ id: NR1_STANDARD_ID, version: 1, scoredCount: QUESTIONS.length })
    expect(data.totals.responses).toBe(7)
    expect(data.ranking).toHaveLength(DIMENSIONS.length)

    const resp = await db.select({ id: responses.id }).from(responses).where(eq(responses.campaignId, c.id))
    const all = await db.select().from(answers)
    const mine = all.filter((a) => resp.some((r) => r.id === a.responseId))
    const expected = scoreDimensions(mine)
    for (const r of data.ranking) expect(r.score).toBe(expected[r.id])
    const index = Math.round(DIMENSIONS.reduce((sum, d) => sum + (expected[d.id] ?? 0), 0) / DIMENSIONS.length)
    expect(data.totals.index).toBe(index)
  })

  it("cria um pulso com itens próprios, lança campanha com ele e valida as respostas pela versão", async () => {
    const s = await setup()
    const created = await call("questionnaires/create", {
      cookie: s.cookie,
      body: {
        name: "Pulso Entregas",
        purpose: "Rota e cobrança fora do horário",
        kind: "pulso",
        anonymous: true,
        items: [
          { text: "Recebo mensagens de trabalho fora do meu horário.", dimension: "demandas", risk: true },
          { text: "A rota do dia é definida com tempo suficiente para eu me organizar.", dimension: "controle", risk: false },
          { text: "Consigo cumprir as entregas sem ultrapassar a jornada.", dimension: "demandas", risk: false },
          { text: "O que mais atrapalha a sua rota hoje?", dimension: null },
        ],
      },
    })
    expect(created.status, created.text).toBe(200)
    const q = created.json
    const got = await call(`questionnaires/get?id=${q.id}`, { cookie: s.cookie })
    expect(got.json.current.version).toBe(1)
    expect(got.json.current.items).toHaveLength(4)
    const itemIds: string[] = got.json.current.items.map((i: any) => i.id)
    expect(new Set(itemIds).size).toBe(4)

    const c = (await call("campaigns/create", { cookie: s.cookie, body: { name: "Pulso out", startsAt: day(0), endsAt: day(5), questionnaireId: q.id } })).json
    expect(c.questionnaireVersionId).toBe(got.json.current.id)

    const survey = await call(`survey/byToken?token=${c.token}`)
    expect(survey.status, survey.text).toBe(200)
    expect(survey.json.items.map((i: any) => i.id)).toEqual(itemIds)
    expect(survey.json.questionnaire).toMatchObject({ name: "Pulso Entregas", kind: "pulso" })

    // As 28 do NR-1 não valem aqui; só os 4 itens da versão.
    const wrong = await call("survey/submit", { body: { token: c.token, sectorId: s.sectorId, answers: pattern(QUESTIONS.map((x) => x.id), 1) } })
    expect(wrong.status).toBe(422)
    for (let i = 0; i < 5; i++) {
      const ok = await call("survey/submit", { body: { token: c.token, sectorId: s.sectorId, answers: pattern(itemIds, i) } })
      expect(ok.status, ok.text).toBe(200)
    }
    const data = (await computeInsights(db, c.companyId, c.id))!
    expect(data.questionnaire.scoredCount).toBe(3)
    // Só Demandas e Controle são medidas: o ranking não inventa as outras 5 dimensões.
    expect(data.ranking.map((r) => r.id).sort()).toEqual(["controle", "demandas"])

    // Pulso não entra na evolução nem vira o relatório PGR padrão.
    const history = await call("insights/history", { cookie: s.cookie })
    expect(history.json.map((h: any) => h.id)).not.toContain(c.id)
  })

  it("editar os itens publica uma versão nova sem alterar a campanha já lançada", async () => {
    const s = await setup()
    const q = (await call("questionnaires/create", { cookie: s.cookie, body: { name: "Clima", kind: "clima", items: [{ text: "Me sinto parte da equipe.", dimension: "colegas", risk: false }] } })).json
    const v1 = (await call(`questionnaires/get?id=${q.id}`, { cookie: s.cookie })).json.current
    const c = (await call("campaigns/create", { cookie: s.cookie, body: { name: "Clima 1", startsAt: day(0), endsAt: day(5), questionnaireId: q.id } })).json

    // Só o nome: não cria versão, mesmo reenviando os itens iguais (o jsonb reordena as chaves).
    const rename = await call("questionnaires/update", { cookie: s.cookie, body: { id: q.id, name: "Clima anual", items: v1.items } })
    expect(rename.status, rename.text).toBe(200)
    expect(rename.json.version).toBe(1)
    // Itens mudaram: versão 2.
    const upd = await call("questionnaires/update", {
      cookie: s.cookie,
      body: { id: q.id, items: [...v1.items, { text: "Existe espírito de cooperação na minha equipe.", dimension: "colegas", risk: false }] },
    })
    expect(upd.status, upd.text).toBe(200)
    expect(upd.json.version).toBe(2)
    const versions = await db.select().from(questionnaireVersions).where(eq(questionnaireVersions.questionnaireId, q.id))
    expect(versions.map((v) => v.version).sort()).toEqual([1, 2])

    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, c.id))
    expect(row!.questionnaireVersionId).toBe(v1.id)
    const survey = await call(`survey/byToken?token=${c.token}`)
    expect(survey.json.items).toHaveLength(1)

    // Campanha nova (ou duplicada) usa a versão 2.
    const dup = await call("campaigns/duplicate", { cookie: s.cookie, body: { id: c.id } })
    expect(dup.status, dup.text).toBe(200)
    expect(dup.json.questionnaireVersionId).toBe(versions.find((v) => v.version === 2)!.id)
  })

  it("o NR-1 padrão não pode ser editado nem identificado; duplicar gera cópia editável da empresa", async () => {
    const s = await setup()
    const edit = await call("questionnaires/update", { cookie: s.cookie, body: { id: NR1_STANDARD_ID, name: "Hackeado" } })
    expect(edit.status).toBe(403)
    const identified = await call("questionnaires/create", { cookie: s.cookie, body: { name: "NR-1 da casa", kind: "nr1", anonymous: false, items: [{ text: "Preciso trabalhar muito rápido para dar conta das tarefas.", dimension: "demandas" }] } })
    expect(identified.status).toBe(400)
    expect(identified.text).toContain("sempre anônimo")

    const dup = await call("questionnaires/duplicate", { cookie: s.cookie, body: { id: NR1_STANDARD_ID } })
    expect(dup.status, dup.text).toBe(200)
    expect(dup.json.companyId).not.toBeNull()
    const got = await call(`questionnaires/get?id=${dup.json.id}`, { cookie: s.cookie })
    expect(got.json.current.items).toHaveLength(QUESTIONS.length)
    const ok = await call("questionnaires/update", { cookie: s.cookie, body: { id: dup.json.id, name: "NR-1 Pão Dourado" } })
    expect(ok.status, ok.text).toBe(200)

    // Arquivado não lança campanha.
    await call("questionnaires/setStatus", { cookie: s.cookie, body: { id: dup.json.id, status: "archived" } })
    const blocked = await call("campaigns/create", { cookie: s.cookie, body: { name: "Bloqueada", startsAt: day(0), endsAt: day(5), questionnaireId: dup.json.id } })
    expect(blocked.status).toBe(400)
  })

  it("isola os questionários entre empresas e mantém o padrão visível para todas", async () => {
    const a = await setup()
    const b = await setup()
    const mine = (await call("questionnaires/create", { cookie: a.cookie, body: { name: "Só da A", items: [{ text: "Tenho os equipamentos de que preciso." }] } })).json
    const listB = await call("questionnaires/list", { cookie: b.cookie })
    expect(listB.json.some((q: any) => q.id === mine.id)).toBe(false)
    expect(listB.json.some((q: any) => q.id === NR1_STANDARD_ID)).toBe(true)
    const steal = await call("campaigns/create", { cookie: b.cookie, body: { name: "Roubo", startsAt: day(0), endsAt: day(5), questionnaireId: mine.id } })
    expect(steal.status).toBe(404)
  })
})
