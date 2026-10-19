/* eslint-disable @typescript-eslint/no-explicit-any -- respostas da API inspecionadas livremente nos testes */
import { eq, inArray } from "drizzle-orm"
import SuperJSON from "superjson"
import * as XLSX from "xlsx"
import { beforeAll, describe, expect, it } from "vitest"
import { createMemoryDb, type Db } from "@/server/db"
import { answers, campaigns, importRows, imports, responses } from "@/server/db/schema"
import { classifyColumn, parseText, proposeByRules } from "@/server/imports"
import { computeInsights } from "@/server/insights"

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
const get = (path: string, params: Record<string, unknown>, cookie: string) =>
  call(`${path}?${new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, SuperJSON.stringify(v)])))}`, { cookie })

let n = 0
async function setup() {
  n += 1
  const r = await call("auth/signup", { body: { companyName: `Empresa I${n}`, cnpj: "12345678000190", employees: 60, name: `RH ${n}`, email: `i${n}@teste.com`, password: "senha-segura-1", acceptTerms: true } })
  expect(r.status, r.text).toBe(200)
  const prod = await call("sectors/create", { cookie: r.cookie, body: { name: "Produção", headcount: 20 } })
  return { cookie: r.cookie, producao: prod.json.id as string }
}

/** Planilha no formato da exportação do Google Forms: carimbo, nome, e-mail, setor e perguntas. */
function formsSheet() {
  const header = [
    "Carimbo de data/hora",
    "Nome completo",
    "E-mail",
    "Qual o seu setor?",
    "Preciso trabalhar muito rápido para dar conta das tarefas.",
    "Consigo fazer pausas durante o dia quando preciso.",
    "Seu chefe te ajuda quando precisa?",
    "O que você mudaria na empresa?",
  ]
  const scale = ["Nunca", "Raramente", "Às vezes", "Frequentemente", "Sempre"]
  const yn = ["Sim", "Não", "Às vezes"]
  const body = Array.from({ length: 8 }, (_, i) => [
    `2025-08-0${1 + (i % 9)} 10:00`,
    `Pessoa ${i}`,
    `pessoa${i}@empresa.com`,
    i % 2 ? "Produção" : "Entregas",
    scale[i % 5],
    scale[(i + 2) % 5],
    yn[i % 3],
    `Comentário longo número ${i} sobre a rotina e o que poderia melhorar no dia a dia`,
  ])
  const ws = XLSX.utils.aoa_to_sheet([header, ...body])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Respostas")
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" })).toString("base64")
}

describe("leitura e classificação", () => {
  it("reconhece escalas, colunas identificáveis, setor e perguntas abertas", () => {
    expect(classifyColumn("Nome completo", ["Ana", "Bruno"]).detected).toBe("identifier")
    expect(classifyColumn("Contato", ["ana@x.com", "b@y.com"]).detected).toBe("identifier")
    expect(classifyColumn("Carimbo de data/hora", ["2025-01-01"]).detected).toBe("timestamp")
    expect(classifyColumn("Setor", ["Produção"]).detected).toBe("sector")
    const lik = classifyColumn("Pergunta", ["Nunca", "Às vezes", "Sempre"])
    expect(lik.detected).toBe("likert5")
    expect(lik.valueMap).toMatchObject({ nunca: 1, "as vezes": 3, sempre: 5 })
    expect(classifyColumn("Pergunta", ["Sim", "Não", "Às vezes"]).detected).toBe("likert3")
    const ten = classifyColumn("Nota", ["0", "5", "10"])
    expect(ten.detected).toBe("numeric")
    expect(ten.valueMap).toMatchObject({ "0": 1, "5": 3, "10": 5 })
    expect(classifyColumn("Sugestões", ["texto livre bem comprido aqui", "outro texto livre bem comprido", "mais um", "quatro", "cinco", "seis", "sete"]).detected).toBe("open")
  })

  it("extrai perguntas de texto numerado e ignora rótulos de escala", () => {
    const parsed = parseText("Pesquisa de clima\n1. Recebo retorno claro sobre o meu trabalho.\nNunca\nSempre\n2) Tenho voz nas decisões que afetam a minha rotina?\n- Me sinto parte da equipe.", "text")
    expect(parsed.columns.map((c) => c.raw)).toEqual(["Recebo retorno claro sobre o meu trabalho.", "Tenho voz nas decisões que afetam a minha rotina?", "Me sinto parte da equipe."])
  })

  it("reconhece itens da metodologia e propõe dimensão por palavras-chave", () => {
    const same = proposeByRules("Preciso trabalhar muito rápido para dar conta das tarefas.")
    expect(same.engine).toBe("metodologia")
    expect(same.proposal).toMatchObject({ dimension: "demandas", risk: true })
    expect(same.confidence).toBeGreaterThanOrEqual(90)
    const boss = proposeByRules("Meu supervisor me cobra de forma agressiva.")
    expect(boss.proposal.dimension).toBe("lideranca")
    expect(boss.proposal.risk).toBe(true)
  })
})

describe("importação ponta a ponta", () => {
  it("importa a planilha do Forms sem gravar colunas identificáveis e cria questionário + campanha histórica", async () => {
    const s = await setup()
    const up = await call("imports/upload", { cookie: s.cookie, body: { filename: "pesquisa-clima-2025.xlsx", data: formsSheet() } })
    expect(up.status, up.text).toBe(200)
    const id = up.json.id as string

    // Nada identificável no banco: nem nos dados brutos, nem nas linhas.
    const [stored] = await db.select().from(imports).where(eq(imports.id, id))
    const dump = JSON.stringify(stored) + JSON.stringify(await db.select().from(importRows).where(eq(importRows.importId, id)))
    expect(dump).not.toContain("pessoa3@empresa.com")
    expect(dump).not.toContain("Pessoa 3")
    expect(dump).not.toContain("Comentário longo")
    expect(stored!.dropped).toEqual(["Nome completo", "E-mail"])
    expect(stored!.responseCount).toBe(8)

    let imp = (await get("imports/get", { id }, s.cookie)).json
    const byRaw = (raw: string) => imp.rows.find((r: any) => r.raw.startsWith(raw))
    expect(byRaw("Nome completo").action).toBe("ignore")
    expect(byRaw("Carimbo").action).toBe("ignore")
    expect(byRaw("Qual o seu setor").action).toBe("sector")
    expect(byRaw("O que você mudaria").detected).toBe("open")
    expect(byRaw("Seu chefe").detected).toBe("likert3")
    expect(imp.validation.blocking.length).toBeGreaterThan(0)

    // Não dá para aceitar coluna identificável; confirmar com pendências é recusado.
    const bad = await call("imports/updateRow", { cookie: s.cookie, body: { id: byRaw("Nome completo").id, action: "accept" } })
    expect(bad.status).toBe(400)
    expect((await call("imports/confirm", { cookie: s.cookie, body: { importId: id } })).status).toBe(400)

    // Revisão: aceita os itens de alta confiança, corrige o do chefe e aceita.
    await call("imports/acceptAll", { cookie: s.cookie, body: { importId: id, min: 90 } })
    await call("imports/updateRow", {
      cookie: s.cookie,
      body: { id: byRaw("Seu chefe").id, action: "accept", final: { text: "Minha liderança me ajuda quando o trabalho fica difícil.", dimension: "lideranca", risk: false } },
    })
    imp = (await get("imports/get", { id }, s.cookie)).json
    for (const r of imp.rows.filter((r: any) => r.action === "pending")) await call("imports/updateRow", { cookie: s.cookie, body: { id: r.id, action: "accept" } })

    // Setores: Produção existe; Entregas será criado. Período da pesquisa original.
    imp = (await get("imports/get", { id }, s.cookie)).json
    const guess = imp.sectorValues.find((v: any) => v.value === "Produção").guess
    expect(guess).toBe(s.producao)
    await call("imports/update", { cookie: s.cookie, body: { importId: id, name: "Clima 2025", kind: "clima", sectorMap: { Produção: s.producao, Entregas: "new" }, startsAt: "2025-08-01", endsAt: "2025-08-15" } })
    imp = (await get("imports/get", { id }, s.cookie)).json
    expect(imp.validation.blocking).toEqual([])
    expect(imp.importable).toBe(8)

    const done = await call("imports/confirm", { cookie: s.cookie, body: { importId: id } })
    expect(done.status, done.text).toBe(200)
    expect(done.json.responses).toBe(8)
    const [after] = await db.select().from(imports).where(eq(imports.id, id))
    expect(after!.status).toBe("confirmed")
    expect(after!.data).toBeNull()

    const q = (await get("questionnaires/get", { id: done.json.questionnaireId }, s.cookie)).json
    expect(q.origin).toBe("imported")
    expect(q.anonymous).toBe(true)
    expect(q.current.items.map((i: any) => i.text)).toContain("Minha liderança me ajuda quando o trabalho fica difícil.")
    expect(q.current.items).toHaveLength(3)

    const [camp] = await db.select().from(campaigns).where(eq(campaigns.id, done.json.campaignId))
    expect(camp).toMatchObject({ imported: true, status: "closed", startsAt: "2025-08-01", endsAt: "2025-08-15" })
    const resp = await db.select().from(responses).where(eq(responses.campaignId, camp!.id))
    expect(resp).toHaveLength(8)
    expect(new Set(resp.map((r) => r.createdDay))).toEqual(new Set(["2025-08-15"]))
    const ans = await db.select().from(answers).where(inArray(answers.responseId, resp.map((r) => r.id)))
    expect(ans).toHaveLength(24)
    expect(ans.every((a) => a.value >= 1 && a.value <= 5)).toBe(true)
    const insights = (await computeInsights(db, camp!.companyId, camp!.id))!
    expect(insights.totals.responses).toBe(8)
    expect(insights.ranking.map((r) => r.id).sort()).toEqual(["demandas", "lideranca"])

    // Campanha importada não consome o limite anual do plano.
    const usage = await call("billing/status", { cookie: s.cookie })
    expect(usage.json.usage.campaignsPerYear).toBe(0)
  })

  it("importa perguntas de texto colado sem respostas e isola rascunhos entre empresas", async () => {
    const a = await setup()
    const b = await setup()
    const up = await call("imports/upload", { cookie: a.cookie, body: { filename: "perguntas.txt", text: "1. Recebo retorno claro sobre o meu trabalho.\n2. Tenho voz nas decisões que afetam a minha rotina." } })
    expect(up.status, up.text).toBe(200)
    expect((await get("imports/get", { id: up.json.id }, b.cookie)).status).toBe(404)
    const imp = (await get("imports/get", { id: up.json.id }, a.cookie)).json
    expect(imp.responseCount).toBe(0)
    for (const r of imp.rows) await call("imports/updateRow", { cookie: a.cookie, body: { id: r.id, action: "accept" } })
    const done = await call("imports/confirm", { cookie: a.cookie, body: { importId: up.json.id } })
    expect(done.status, done.text).toBe(200)
    expect(done.json.campaignId).toBeNull()
  })

  it("recusa arquivo ilegível e formato não suportado", async () => {
    const s = await setup()
    const bad = await call("imports/upload", { cookie: s.cookie, body: { filename: "x.docx", data: Buffer.from("oi").toString("base64") } })
    expect(bad.status).toBe(422)
    const empty = await call("imports/upload", { cookie: s.cookie, body: { filename: "vazio.txt", text: "olá" } })
    expect(empty.status).toBe(422)
  })
})
