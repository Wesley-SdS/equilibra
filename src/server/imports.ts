// Importação de formulários: lê planilha (XLSX/CSV, inclusive a exportação do Google Forms), PDF ou
// texto colado, classifica cada coluna/linha e propõe item, dimensão e polaridade. Nada é gravado
// como questionário antes de o gestor revisar e confirmar. Colunas que identificam pessoas são
// descartadas na leitura: só o cabeçalho é guardado, para o aviso e a auditoria.

import * as XLSX from "xlsx"
import type { ImportColumnKind, ImportProposal } from "./db/schema"
import { classifyQuestion } from "./decisions"
import { DIMENSIONS, QUESTIONS, type DimensionId } from "@/lib/methodology"

export const MAX_IMPORT_BYTES = 3 * 1024 * 1024
export const MAX_IMPORT_ROWS = 5000
export const MAX_IMPORT_QUESTIONS = 60

export type ParsedColumn = {
  raw: string
  detected: ImportColumnKind
  /** Índice em `values` (só colunas de pergunta e de setor guardam valores). */
  column: number | null
  valueMap: Record<string, number>
  issues: string[]
}

export type ParsedFile = {
  source: "xlsx" | "csv" | "pdf" | "text"
  columns: ParsedColumn[]
  dropped: string[]
  /** Respostas: setor (texto bruto) e valores brutos por coluna de pergunta. */
  data: { sectors: (string | null)[]; values: (string | null)[][] } | null
}

export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()

// ---------------------------------------------------------------- escalas

const FREQUENCY: Record<string, number> = {
  nunca: 1,
  raramente: 2,
  "quase nunca": 2,
  "as vezes": 3,
  "algumas vezes": 3,
  frequentemente: 4,
  "muitas vezes": 4,
  "quase sempre": 4,
  sempre: 5,
  "discordo totalmente": 1,
  "discordo fortemente": 1,
  discordo: 2,
  "discordo parcialmente": 2,
  "nem concordo nem discordo": 3,
  neutro: 3,
  indiferente: 3,
  "concordo parcialmente": 4,
  concordo: 4,
  "concordo totalmente": 5,
  "concordo fortemente": 5,
  "muito ruim": 1,
  ruim: 2,
  regular: 3,
  bom: 4,
  boa: 4,
  "muito bom": 5,
  "muito boa": 5,
  otimo: 5,
  otima: 5,
}
const YES_NO: Record<string, number> = { sim: 5, nao: 1, "as vezes": 3, "talvez": 3, "em parte": 3, parcialmente: 3 }

const IDENTIFIER = /\b(nome|name|e-?mail|cpf|rg|matricula|telefone|celular|whats ?app|endereco|registro|crach)/
const TIMESTAMP = /(carimbo|timestamp|data e hora|^data$|^hora$|enviado em|submitted)/
const SECTOR = /^(setor|departamento|area|equipe|unidade|time|filial|loja)\b|(seu|qual) (setor|departamento|area|equipe)/
const EMAIL_VALUE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Classifica uma coluna da planilha pelo cabeçalho e pelos valores. */
export function classifyColumn(header: string, values: string[]): Omit<ParsedColumn, "column" | "raw"> {
  const h = norm(header)
  const filled = values.map((v) => v.trim()).filter(Boolean)
  if (IDENTIFIER.test(h) || (filled.length && filled.filter((v) => EMAIL_VALUE.test(v)).length / filled.length > 0.5)) {
    return { detected: "identifier", valueMap: {}, issues: ["Coluna identifica pessoas: será descartada (o questionário é anônimo)."] }
  }
  if (TIMESTAMP.test(h)) return { detected: "timestamp", valueMap: {}, issues: ["Data/hora de envio: ignorada para não ajudar a identificar quem respondeu."] }
  if (SECTOR.test(h)) return { detected: "sector", valueMap: {}, issues: [] }
  if (!filled.length) return { detected: "question", valueMap: {}, issues: [] }

  const distinct = [...new Set(filled.map(norm))]
  if (distinct.every((v) => FREQUENCY[v] !== undefined)) {
    return { detected: "likert5", valueMap: Object.fromEntries(distinct.map((v) => [v, FREQUENCY[v]!])), issues: [] }
  }
  const nums = distinct.map((v) => Number(v.replace(",", ".")))
  if (nums.every((n) => Number.isFinite(n))) {
    const min = Math.min(...nums)
    const max = Math.max(...nums)
    if (min >= 1 && max <= 5 && nums.every(Number.isInteger)) {
      return { detected: "likert5", valueMap: Object.fromEntries(distinct.map((v) => [v, Number(v)])), issues: [] }
    }
    if (max > min && max <= 10 && min >= 0) {
      return {
        detected: "numeric",
        valueMap: Object.fromEntries(distinct.map((v, i) => [v, 1 + Math.round(((nums[i]! - min) / (max - min)) * 4)])),
        issues: [`Escala de ${min} a ${max}: convertida proporcionalmente para 1–5. Confira antes de aceitar.`],
      }
    }
  }
  if (distinct.every((v) => YES_NO[v] !== undefined)) {
    const three = distinct.some((v) => YES_NO[v] === 3)
    return {
      detected: three ? "likert3" : "yesno",
      valueMap: Object.fromEntries(distinct.map((v) => [v, YES_NO[v]!])),
      issues: [three ? "Escala de 3 pontos (sim / às vezes / não): convertida para 1–5 (não = 1, às vezes = 3, sim = 5)." : "Resposta sim/não: convertida para 1–5 (não = 1, sim = 5)."],
    }
  }
  const avgLen = filled.reduce((s, v) => s + v.length, 0) / filled.length
  if (distinct.length > 6 || avgLen > 25) {
    return { detected: "open", valueMap: {}, issues: ["Pergunta aberta: ainda não é suportada no questionário e será ignorada. As respostas em texto não são importadas."] }
  }
  return {
    detected: "question",
    valueMap: {},
    issues: [`Valores não reconhecidos (${distinct.slice(0, 4).join(", ")}${distinct.length > 4 ? "…" : ""}): as respostas desta coluna serão ignoradas.`],
  }
}

// ---------------------------------------------------------------- leitura

function cell(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

/** Lê XLSX ou CSV (primeira aba; primeira linha = cabeçalhos). */
export function parseSheet(buffer: Buffer, source: "xlsx" | "csv"): ParsedFile {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: false, dense: true, codepage: 65001 })
  const sheet = wb.Sheets[wb.SheetNames[0]!]
  if (!sheet) throw new ImportError("A planilha está vazia.")
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" }) as unknown[][]
  if (!rows.length) throw new ImportError("A planilha está vazia.")
  if (rows.length - 1 > MAX_IMPORT_ROWS) throw new ImportError(`A planilha tem mais de ${MAX_IMPORT_ROWS} linhas de resposta.`)
  const headers = rows[0]!.map(cell)
  const body = rows.slice(1).filter((r) => r.some((v) => cell(v).trim()))
  const columns: ParsedColumn[] = []
  const dropped: string[] = []
  const keep: number[] = []
  let sectorCol: number | null = null
  headers.forEach((header, i) => {
    if (!header.trim()) return
    const values = body.map((r) => cell(r[i]))
    const c = classifyColumn(header, values)
    if (c.detected === "identifier") dropped.push(header.trim())
    if (c.detected === "sector" && sectorCol === null) sectorCol = i
    const stores = body.length > 0 && c.detected !== "identifier" && c.detected !== "timestamp" && c.detected !== "open" && c.detected !== "sector"
    columns.push({ raw: header.trim(), ...c, column: stores ? keep.length : null })
    if (stores) keep.push(i)
  })
  if (columns.filter((c) => !["identifier", "timestamp", "sector"].includes(c.detected)).length > MAX_IMPORT_QUESTIONS) {
    throw new ImportError(`O arquivo tem mais de ${MAX_IMPORT_QUESTIONS} perguntas. Divida em questionários menores.`)
  }
  const sc = sectorCol as number | null
  const data = body.length
    ? {
        sectors: body.map((r) => (sc === null ? null : cell(r[sc]).trim() || null)),
        values: body.map((r) => keep.map((i) => cell(r[i]).trim() || null)),
      }
    : null
  return { source, columns, dropped, data }
}

const SCALE_LINE = /^(nunca|raramente|as vezes|frequentemente|sempre|sim|nao|concordo|discordo|neutro|[1-5])$/
const NUMBERING = /^\s*(?:\(?\d{1,3}[.)\-–]|[-•*▪●◦]|[a-z]\))\s+/i

/** Extrai perguntas de texto livre (PDF ou colado): linhas numeradas, com "?" ou com marcador. */
export function parseText(text: string, source: "pdf" | "text"): ParsedFile {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const columns: ParsedColumn[] = []
  for (const line of lines) {
    const n = norm(line)
    if (SCALE_LINE.test(n) || n.length < 12 || n.length > 220) continue
    // Item: numerado, com marcador, terminando em "?" ou uma frase completa (4+ palavras e ponto final).
    const looksLikeItem = NUMBERING.test(line) || line.endsWith("?") || (/[.!]$/.test(line) && line.split(" ").length >= 4)
    if (!looksLikeItem) continue
    const clean = line.replace(NUMBERING, "").trim()
    if (clean.length < 8 || seen.has(norm(clean))) continue
    seen.add(norm(clean))
    columns.push({ raw: clean, detected: "question", column: null, valueMap: {}, issues: [] })
    if (columns.length > MAX_IMPORT_QUESTIONS) throw new ImportError(`O texto tem mais de ${MAX_IMPORT_QUESTIONS} perguntas. Divida em questionários menores.`)
  }
  if (!columns.length) throw new ImportError("Não encontramos perguntas no texto. Use uma pergunta por linha (numerada ou terminando em “?”).")
  return { source, columns, dropped: [], data: null }
}

export async function parsePdf(buffer: Buffer): Promise<ParsedFile> {
  const { extractText, getDocumentProxy } = await import("unpdf")
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { text } = await extractText(pdf, { mergePages: true })
  const merged = Array.isArray(text) ? text.join("\n") : text
  if (!merged.trim()) throw new ImportError("O PDF não tem texto selecionável (parece ser uma imagem escaneada). Cole o texto das perguntas ou envie a planilha.")
  return parseText(merged, "pdf")
}

export class ImportError extends Error {}

export function detectSource(filename: string): "xlsx" | "csv" | "pdf" | null {
  const ext = filename.toLowerCase().split(".").pop()
  if (ext === "xlsx" || ext === "xls" || ext === "ods") return "xlsx"
  if (ext === "csv" || ext === "tsv" || ext === "txt") return "csv"
  if (ext === "pdf") return "pdf"
  return null
}

// ---------------------------------------------------------------- propostas

const DIMENSION_WORDS: Record<DimensionId, RegExp> = {
  demandas: /(ritmo|rapid|prazo|meta|hora extra|horas extras|carga|sobrecarg|pausa|jornada|volume|tarefa|acumul|cansa|exaust|fora do (meu )?horario|folga|descanso)/,
  controle: /(decid|autonomia|organizar|liberdade|opinar|voz|habilidade|conhecimento|metodo|escolher)/,
  lideranca: /(chefe|chefia|lider|gestor|supervisor|gerente|encarregad|feedback|cobrad|cobranca|me cobra)/,
  colegas: /(colega|cooperac|ajuda m|time|pares|companheir|integrac|espirito de equipe)/,
  relacoes: /(assedi|grit|ofens|ameac|humilh|sexual|isolad|exclu|represalia|retaliac|discrimin|violen|xing|desrespeit)/,
  papel: /(responsabilidade|funcao|cargo|espera de mim|papel|contraditor|prioridade|atribuic|clareza)/,
  reconhecimento: /(reconhec|salario|remunerac|mudanca|futuro|valoriz|promoc|carreira|beneficio|estabilidade|inseguranc)/,
}
const RISK_WORDS = /(pressao|cobrad|cobranca|me cobra|agressiv|medo|grit|humilh|sobrecarg|hora extra|horas extras|muito rapido|rapido demais|conflito|contraditor|insegur|isolad|assedi|exaust|cansad|ofens|ameac|desrespeit|disput|compet|nao consigo|dificuldade|fora do horario|ansios|estress)/

/** Limpa o texto de uma pergunta: numeração, espaços, aspas e "?" de pesquisa de clima. */
export function cleanText(raw: string) {
  return raw
    .replace(NUMBERING, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s*\[[^\]]*\]\s*$/, "") // sufixo de grade do Google Forms: "Pergunta [Item]"
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200)
}

/** Semelhança simples por palavras (Jaccard), para reconhecer itens da metodologia NR-1. */
function similarity(a: string, b: string) {
  const wa = new Set(norm(a).split(" ").filter((w) => w.length > 2))
  const wb = new Set(norm(b).split(" ").filter((w) => w.length > 2))
  const inter = [...wa].filter((w) => wb.has(w)).length
  return inter / Math.max(1, new Set([...wa, ...wb]).size)
}

export function proposeByRules(text: string): { proposal: ImportProposal; confidence: number; engine: "regras" | "metodologia" } {
  // Item da própria metodologia (ex.: reimportar o NR-1 de outra ferramenta): copia dimensão e polaridade.
  let best = { score: 0, q: QUESTIONS[0]! }
  for (const q of QUESTIONS) {
    const s = similarity(text, q.text)
    if (s > best.score) best = { score: s, q }
  }
  if (best.score >= 0.6) {
    return { proposal: { text, dimension: best.q.dimension, risk: best.q.risk }, confidence: Math.round(70 + best.score * 30), engine: "metodologia" }
  }
  const n = norm(text)
  const hits = DIMENSIONS.filter((d) => DIMENSION_WORDS[d.id].test(n))
  const dimension = hits[0]?.id ?? null
  const risk = RISK_WORDS.test(n)
  const confidence = hits.length === 1 ? 72 : hits.length > 1 ? 55 : 35
  return { proposal: { text, dimension, risk }, confidence, engine: "regras" }
}

/** Proposta completa: regras locais e, quando houver credencial, a dimensão escolhida pelo Jev. */
export async function propose(text: string): Promise<{ proposal: ImportProposal; confidence: number; engine: "jev" | "regras" | "metodologia" }> {
  const rules = proposeByRules(text)
  if (rules.engine === "metodologia") return rules
  const jev = await classifyQuestion(text)
  if (jev.confidence === null) return rules
  return { proposal: { ...rules.proposal, dimension: jev.dimension }, confidence: jev.confidence, engine: "jev" }
}
