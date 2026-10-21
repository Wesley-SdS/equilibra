// Importação a partir do Google:
//   1. Google Sheets: link de planilha compartilhada como "qualquer pessoa com o link" (sem login).
//      Lemos a exportação CSV oficial; o endereço é montado por nós (só docs.google.com), nunca o do usuário.
//   2. Google Forms: conexão OAuth com escopo somente leitura (formulário e respostas). O token fica em
//      um cookie httpOnly de curta duração e não é gravado no banco. O e-mail do respondente, quando o
//      formulário coleta, nunca é lido.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { ImportError, MAX_IMPORT_BYTES, parseRows, parseSheet, type ParsedFile } from "./imports"

export const GOOGLE_TOKEN_COOKIE = "eq_gtoken"
const SCOPES = ["https://www.googleapis.com/auth/forms.body.readonly", "https://www.googleapis.com/auth/forms.responses.readonly"]

export function googleFormsEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

// ---------------------------------------------------------------- Google Sheets

/** Extrai o id da planilha e a aba (gid) de um link do Google Sheets. */
export function parseSheetsUrl(raw: string) {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.hostname !== "docs.google.com") return null
  const id = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/)?.[1]
  if (!id) return null
  const gid = (url.hash.match(/gid=(\d+)/) ?? url.search.match(/gid=(\d+)/))?.[1] ?? null
  return { id, gid }
}

export async function importFromSheets(link: string): Promise<ParsedFile> {
  const ref = parseSheetsUrl(link)
  if (!ref) throw new ImportError("Link inválido. Use o link da planilha do Google Sheets (docs.google.com/spreadsheets/…).")
  const exportUrl = `https://docs.google.com/spreadsheets/d/${ref.id}/export?format=csv${ref.gid ? `&gid=${ref.gid}` : ""}`
  const res = await fetch(exportUrl, { redirect: "follow", signal: AbortSignal.timeout(15_000) })
  const type = res.headers.get("content-type") ?? ""
  if (!res.ok || type.includes("text/html")) {
    throw new ImportError("Não conseguimos abrir a planilha. No Google Sheets, compartilhe como “Qualquer pessoa com o link: leitor” e tente de novo.")
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > MAX_IMPORT_BYTES) throw new ImportError("A planilha é grande demais (máximo de 3 MB).")
  return parseSheet(buf, "sheets")
}

// ---------------------------------------------------------------- OAuth (Google Forms)

function secret() {
  return process.env.SESSION_SECRET ?? "dev-only-secret-change-me"
}

/** Estado assinado do OAuth: amarra o retorno à empresa e ao usuário que iniciou, com validade de 10 min. */
export function signState(companyId: string, userId: string, now = Date.now()) {
  const payload = `${companyId}.${userId}.${now + 10 * 60_000}.${randomBytes(8).toString("base64url")}`
  return `${payload}.${createHmac("sha256", secret()).update(payload).digest("base64url")}`
}

export function verifyState(state: string, now = Date.now()) {
  const i = state.lastIndexOf(".")
  if (i < 0) return null
  const payload = state.slice(0, i)
  const sig = Buffer.from(state.slice(i + 1))
  const expected = Buffer.from(createHmac("sha256", secret()).update(payload).digest("base64url"))
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null
  const [companyId, userId, exp] = payload.split(".")
  if (!companyId || !userId || Number(exp) < now) return null
  return { companyId, userId }
}

export function googleAuthUrl(state: string, redirectUri: string) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "online",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
}

export async function exchangeCode(code: string, redirectUri: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`google_token_${res.status}`)
  const json = (await res.json()) as { access_token: string; expires_in: number }
  return { token: json.access_token, expiresIn: Math.min(3600, json.expires_in ?? 3600) }
}

// ---------------------------------------------------------------- Google Forms → linhas

/** Id do formulário a partir do link de edição (o link /viewform público tem outro id, que a API não aceita). */
export function parseFormUrl(raw: string) {
  try {
    const url = new URL(raw.trim())
    if (url.hostname !== "docs.google.com") return null
    if (url.pathname.startsWith("/forms/d/e/")) return { error: "public" as const }
    const id = url.pathname.match(/^\/forms\/d\/([a-zA-Z0-9_-]{20,})/)?.[1]
    return id ? { id } : null
  } catch {
    return null
  }
}

type FormItem = {
  itemId?: string
  title?: string
  questionItem?: { question: { questionId: string; choiceQuestion?: unknown; scaleQuestion?: unknown; textQuestion?: unknown; dateQuestion?: unknown; timeQuestion?: unknown } }
  questionGroupItem?: { questions: { questionId: string; rowQuestion?: { title: string } }[] }
}
export type GoogleForm = { formId: string; info?: { title?: string }; settings?: { emailCollectionType?: string }; items?: FormItem[] }
export type GoogleFormResponse = { answers?: Record<string, { textAnswers?: { answers?: { value?: string }[] } }> }

/** Converte formulário + respostas em cabeçalhos e linhas (uma coluna por pergunta ou por linha de grade). */
export function formToParsed(form: GoogleForm, responses: GoogleFormResponse[]): ParsedFile & { title: string } {
  const cols: { questionId: string; header: string }[] = []
  for (const item of form.items ?? []) {
    if (item.questionItem) {
      const q = item.questionItem.question
      // Data e hora ajudam a identificar quem respondeu: viram colunas de data (descartadas na classificação).
      const header = q.dateQuestion || q.timeQuestion ? `Data/hora: ${item.title ?? ""}` : (item.title ?? "")
      cols.push({ questionId: q.questionId, header })
    } else if (item.questionGroupItem) {
      // Grade (ex.: afirmações × Nunca…Sempre): cada linha da grade é um item.
      for (const row of item.questionGroupItem.questions) cols.push({ questionId: row.questionId, header: row.rowQuestion?.title ?? item.title ?? "" })
    }
  }
  if (!cols.length) throw new ImportError("O formulário não tem perguntas que possamos importar.")
  const rows = responses.map((r) => cols.map((c) => (r.answers?.[c.questionId]?.textAnswers?.answers ?? []).map((a) => a.value ?? "").join(", ")))
  const dropped = form.settings?.emailCollectionType && form.settings.emailCollectionType !== "DO_NOT_COLLECT" ? ["E-mail do respondente (coletado pelo Forms, não lido)"] : []
  const parsed = parseRows(
    cols.map((c) => c.header),
    rows,
    "forms",
    dropped
  )
  return { ...parsed, title: form.info?.title ?? "Google Forms" }
}

export async function importFromForms(link: string, token: string) {
  const ref = parseFormUrl(link)
  if (!ref) throw new ImportError("Link inválido. Use o link de edição do formulário (docs.google.com/forms/d/…/edit).")
  if ("error" in ref) throw new ImportError("Este é o link público de resposta. Abra o formulário no modo de edição e copie o link da barra de endereço (…/forms/d/…/edit).")
  const headers = { authorization: `Bearer ${token}` }
  const formRes = await fetch(`https://forms.googleapis.com/v1/forms/${ref.id}`, { headers, signal: AbortSignal.timeout(15_000) })
  if (formRes.status === 401) throw new ImportError("A conexão com o Google expirou. Conecte de novo.")
  if (!formRes.ok) throw new ImportError("Não conseguimos abrir o formulário. Confira se a conta conectada é dona ou editora dele.")
  const form = (await formRes.json()) as GoogleForm
  const responses: GoogleFormResponse[] = []
  let pageToken: string | undefined
  do {
    const q = new URLSearchParams({ pageSize: "5000", ...(pageToken ? { pageToken } : {}) })
    const r = await fetch(`https://forms.googleapis.com/v1/forms/${ref.id}/responses?${q}`, { headers, signal: AbortSignal.timeout(20_000) })
    if (!r.ok) throw new ImportError("Não conseguimos ler as respostas do formulário.")
    const json = (await r.json()) as { responses?: GoogleFormResponse[]; nextPageToken?: string }
    responses.push(...(json.responses ?? []))
    pageToken = json.nextPageToken
  } while (pageToken && responses.length < 5000)
  return formToParsed(form, responses)
}
