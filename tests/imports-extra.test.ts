/* eslint-disable @typescript-eslint/no-explicit-any -- respostas da API inspecionadas livremente nos testes */
import SuperJSON from "superjson"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { createMemoryDb, type Db } from "@/server/db"
import { setAgentRunner } from "@/server/agents/client"
import { formToParsed, importFromSheets, parseFormUrl, parseSheetsUrl, signState, verifyState } from "@/server/google"

let app: { fetch: (req: Request) => Response | Promise<Response> }

beforeAll(async () => {
  const memory = createMemoryDb()
  ;(globalThis as { __eqDb?: Promise<Db> }).__eqDb = memory
  await memory
  app = (await import("@/server")).default.handler as unknown as typeof app
})
afterEach(() => {
  setAgentRunner(null)
  vi.unstubAllGlobals()
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
async function setup() {
  n += 1
  const r = await call("auth/signup", { body: { companyName: `Empresa X${n}`, cnpj: "12345678000190", employees: 30, name: "RH", email: `x${n}@teste.com`, password: "senha-segura-1", acceptTerms: true } })
  return r.cookie
}

/** PDF mínimo de uma página em branco (sem texto selecionável, como um escaneado). */
const BLANK_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj\n2 0 obj <</Type/Pages/Kids[3 0 R]/Count 1>> endobj\n3 0 obj <</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>> endobj\ntrailer <</Root 1 0 R>>\n%%EOF\n"
).toString("base64")

describe("links do Google", () => {
  it("reconhece links de planilha e de formulário e recusa outros hosts", () => {
    expect(parseSheetsUrl("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=42")).toEqual({ id: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789", gid: "42" })
    expect(parseSheetsUrl("https://evil.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789")).toBeNull()
    expect(parseFormUrl("https://docs.google.com/forms/d/1FormIdFormIdFormIdFormId123/edit")).toEqual({ id: "1FormIdFormIdFormIdFormId123" })
    expect(parseFormUrl("https://docs.google.com/forms/d/e/1FAIpQLSf/viewform")).toEqual({ error: "public" })
  })

  it("estado do OAuth assinado, com validade e à prova de adulteração", () => {
    const st = signState("empresa-1", "usuario-1", 1_000)
    expect(verifyState(st, 2_000)).toEqual({ companyId: "empresa-1", userId: "usuario-1" })
    expect(verifyState(st, 1_000 + 11 * 60_000)).toBeNull()
    expect(verifyState(st.replace("empresa-1", "empresa-2"), 2_000)).toBeNull()
  })

  it("converte formulário com grade, escala e data; nunca lê o e-mail do respondente", () => {
    const parsed = formToParsed(
      {
        formId: "f",
        info: { title: "Clima 2025" },
        settings: { emailCollectionType: "VERIFIED" },
        items: [
          { title: "Data do turno", questionItem: { question: { questionId: "q0", dateQuestion: {} } } },
          { title: "Setor", questionItem: { question: { questionId: "q1", choiceQuestion: {} } } },
          { title: "Com que frequência…", questionGroupItem: { questions: [{ questionId: "g1", rowQuestion: { title: "Preciso trabalhar muito rápido para dar conta das tarefas." } }, { questionId: "g2", rowQuestion: { title: "Consigo fazer pausas durante o dia quando preciso." } }] } },
          { title: "Nota para a liderança", questionItem: { question: { questionId: "q2", scaleQuestion: {} } } },
        ],
      },
      Array.from({ length: 6 }, (_, i) => ({
        respondentEmail: `pessoa${i}@empresa.com`,
        answers: {
          q0: { textAnswers: { answers: [{ value: "2025-08-01" }] } },
          q1: { textAnswers: { answers: [{ value: "Produção" }] } },
          g1: { textAnswers: { answers: [{ value: ["Nunca", "Sempre", "Às vezes"][i % 3] }] } },
          g2: { textAnswers: { answers: [{ value: "Frequentemente" }] } },
          q2: { textAnswers: { answers: [{ value: String(1 + (i % 5)) }] } },
        },
      })) as any
    )
    expect(parsed.title).toBe("Clima 2025")
    expect(parsed.source).toBe("forms")
    expect(parsed.columns.map((c) => c.detected)).toEqual(["timestamp", "sector", "likert5", "likert5", "likert5"])
    expect(parsed.columns[2]!.raw).toBe("Preciso trabalhar muito rápido para dar conta das tarefas.")
    expect(parsed.dropped[0]).toContain("E-mail do respondente")
    expect(JSON.stringify(parsed)).not.toContain("pessoa0@empresa.com")
  })

  it("lê planilha compartilhada e explica quando não está compartilhada", async () => {
    vi.stubGlobal("fetch", async () => new Response("Pergunta A;Setor\nSempre;Produção\nNunca;Balcão\n".replace(/;/g, ","), { headers: { "content-type": "text/csv" } }))
    const ok = await importFromSheets("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit")
    expect(ok.columns.map((c) => c.detected)).toEqual(["likert5", "sector"])
    vi.stubGlobal("fetch", async () => new Response("<html>login</html>", { headers: { "content-type": "text/html" } }))
    await expect(importFromSheets("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit")).rejects.toThrow("Qualquer pessoa com o link")
  })

  it("link do Forms sem conexão pede para conectar", async () => {
    const cookie = await setup()
    const r = await call("imports/upload", { cookie, body: { filename: "google-forms", googleUrl: "https://docs.google.com/forms/d/1FormIdFormIdFormIdFormId123/edit" } })
    expect(r.status).toBe(422)
    expect(r.text).toContain("Conecte sua conta Google")
  })
})

describe("PDF escaneado e foto pelo Claude", () => {
  it("sem copiloto, explica a alternativa; com copiloto, lê as perguntas e não grava o documento", async () => {
    const cookie = await setup()
    const no = await call("imports/upload", { cookie, body: { filename: "escaneado.pdf", data: BLANK_PDF } })
    expect(no.status, no.text).toBe(422)
    expect(no.text).toContain("copilotos de IA")

    let sent: any = null
    setAgentRunner(async (req) => {
      sent = req.messages[0]!.content
      return { output: { questions: ["1. Recebo retorno claro sobre o meu trabalho.", "Tenho voz nas decisões que afetam a minha rotina."], scale: ["Nunca", "Sempre"], identifiesPeople: true }, stopReason: "end_turn", model: "m", inputTokens: 900, outputTokens: 80 }
    })
    const pdf = await call("imports/upload", { cookie, body: { filename: "escaneado.pdf", data: BLANK_PDF } })
    expect(pdf.status, pdf.text).toBe(200)
    expect(sent[0]).toMatchObject({ type: "file", mediaType: "application/pdf" })
    const imp = (await call(`imports/get?id=${encodeURIComponent(SuperJSON.stringify(pdf.json.id))}`, { cookie })).json
    expect(imp.rows.map((r: any) => r.raw)).toEqual(["Recebo retorno claro sobre o meu trabalho.", "Tenho voz nas decisões que afetam a minha rotina."])
    expect(imp.dropped[0]).toContain("Dados pessoais")

    const photo = await call("imports/upload", { cookie, body: { filename: "questionario.jpg", data: Buffer.from("fake-jpeg").toString("base64") } })
    expect(photo.status, photo.text).toBe(200)
    expect(sent[0]).toMatchObject({ type: "file", mediaType: "image/jpeg" })
  })
})

describe("instrumentos de mercado (HSE e COPSOQ)", () => {
  const csv = (headers: string[], rows: string[][]) => Buffer.from([headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n")).toString("base64")

  it("HSE: exige 35 itens e pontua pela chave oficial; vira metodologia da empresa", async () => {
    const cookie = await setup()
    const short = await call("imports/upload", { cookie, body: { filename: "hse.csv", template: "hse", data: csv(["Item 1", "Item 2"], [["Never", "Always"]]) } })
    expect(short.status).toBe(422)
    expect(short.text).toContain("35 itens")

    const headers = Array.from({ length: 35 }, (_, i) => `Pergunta oficial número ${i + 1} do indicador`)
    const rows = Array.from({ length: 6 }, (_, r) => headers.map((_, i) => ["Never", "Seldom", "Sometimes", "Often", "Always"][(r + i) % 5]!))
    const withData = await call("imports/upload", { cookie, body: { filename: "hse.csv", template: "hse", data: csv(headers, rows) } })
    expect(withData.status, withData.text).toBe(200)
    // Só os itens (sem respostas): vira o questionário da metodologia.
    const up = await call("imports/upload", { cookie, body: { filename: "hse.csv", template: "hse", data: csv(headers, []) } })
    expect(up.status, up.text).toBe(200)
    const imp = (await call(`imports/get?id=${encodeURIComponent(SuperJSON.stringify(up.json.id))}`, { cookie })).json
    const byPos = (n: number) => imp.rows.find((r: any) => r.position === n - 1)
    expect(byPos(3).final).toMatchObject({ dimension: "demandas", risk: true })
    expect(byPos(8).final).toMatchObject({ dimension: "lideranca", risk: false })
    expect(byPos(5).final).toMatchObject({ dimension: "relacoes", risk: true })
    expect(byPos(26).final).toMatchObject({ dimension: "reconhecimento", risk: false })
    expect(imp.rows.filter((r: any) => r.action === "pending")).toHaveLength(0)

    const done = await call("imports/confirm", { cookie, body: { importId: up.json.id } })
    expect(done.status, done.text).toBe(200)
    const list = (await call("questionnaires/list", { cookie })).json
    const hse = list.find((q: any) => q.instrument === "hse")
    expect(hse).toMatchObject({ kind: "nr1", name: "HSE Management Standards Indicator Tool" })

    const wrong = await call("company/setMethodology", { cookie, body: { id: "copsoq3", note: "x".repeat(40), questionnaireId: hse.id, severity: {} } })
    expect(wrong.status).toBe(400)
    const ok = await call("company/setMethodology", { cookie, body: { id: "hse", note: "Justificativa técnica do HSE para a empresa.", questionnaireId: hse.id, severity: {} } })
    expect(ok.status, ok.text).toBe(200)
  })

  it("COPSOQ: reconhece códigos, tira o código do texto, deixa saúde fora do score e não pode ser modificado", async () => {
    const cookie = await setup()
    const headers = ["Setor", "QD1 Você se atrasa na entrega do seu trabalho?", "IN2 Você tem influência sobre o seu trabalho?", "BO1 Com que frequência você se sentiu esgotado?"]
    const rows = Array.from({ length: 6 }, (_, r) => ["Produção", ["Nunca/quase nunca", "Raramente", "Às vezes"][r % 3]!, "Em grande medida", "Muito"])
    const up = await call("imports/upload", { cookie, body: { filename: "copsoq.csv", template: "copsoq3", data: csv(headers, rows) } })
    expect(up.status, up.text).toBe(200)
    const imp = (await call(`imports/get?id=${encodeURIComponent(SuperJSON.stringify(up.json.id))}`, { cookie })).json
    const qd = imp.rows.find((r: any) => r.raw.startsWith("QD1"))
    expect(qd.final).toMatchObject({ text: "Você se atrasa na entrega do seu trabalho?", dimension: "demandas", risk: true })
    expect(imp.rows.find((r: any) => r.raw.startsWith("IN2")).final).toMatchObject({ dimension: "controle", risk: false })
    expect(imp.rows.find((r: any) => r.raw.startsWith("BO1")).final.dimension).toBeNull()

    const bad = await call("imports/upload", { cookie, body: { filename: "x.csv", template: "copsoq3", data: csv(["Pergunta sem código"], [["Sempre"]]) } })
    expect(bad.status).toBe(422)

    const only = await call("imports/upload", { cookie, body: { filename: "copsoq.csv", template: "copsoq3", data: csv(headers, []) } })
    expect((await call("imports/confirm", { cookie, body: { importId: only.json.id } })).status).toBe(200)
    const q = (await call("questionnaires/list", { cookie })).json.find((x: any) => x.instrument === "copsoq3")
    const full = (await call(`questionnaires/get?id=${encodeURIComponent(SuperJSON.stringify(q.id))}`, { cookie })).json
    const items = full.current.items
    const edit = await call("questionnaires/update", { cookie, body: { id: q.id, items: [...items, { text: "Item novo inventado pela empresa", dimension: "demandas", risk: true }] } })
    expect(edit.status).toBe(400)
    expect(edit.text).toContain("CC BY-NC-ND")
    const copy = (await call("questionnaires/duplicate", { cookie, body: { id: q.id } })).json
    const copied = (await call("questionnaires/list", { cookie })).json.find((x: any) => x.id === (copy.id ?? copy.questionnaireId))
    expect(copied.name).not.toContain("COPSOQ")
    expect(copied.instrument).toBeNull()
  })
})
