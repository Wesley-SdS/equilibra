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
    expect(sent[0].type).toBe("document")
    const imp = (await call(`imports/get?id=${encodeURIComponent(SuperJSON.stringify(pdf.json.id))}`, { cookie })).json
    expect(imp.rows.map((r: any) => r.raw)).toEqual(["Recebo retorno claro sobre o meu trabalho.", "Tenho voz nas decisões que afetam a minha rotina."])
    expect(imp.dropped[0]).toContain("Dados pessoais")

    const photo = await call("imports/upload", { cookie, body: { filename: "questionario.jpg", data: Buffer.from("fake-jpeg").toString("base64") } })
    expect(photo.status, photo.text).toBe(200)
    expect(sent[0]).toMatchObject({ type: "image", source: { media_type: "image/jpeg" } })
  })
})
