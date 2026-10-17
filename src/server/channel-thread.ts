import { and, asc, eq, inArray, sql } from "drizzle-orm"
import { HTTPException } from "hono/http-exception"
import sharp from "sharp"
import { z } from "zod"
import type { Db } from "./db"
import { channelAttachments, channelMessages, channelReports, memberships } from "./db/schema"
import { SESSION_COOKIE, readSessionToken, today } from "./auth"
import { triageReport } from "./decisions"

export const MAX_ATTACHMENTS_PER_MESSAGE = 3
export const MAX_ATTACHMENTS_PER_REPORT = 12
const MAX_B64_CHARS = 1_700_000 // ≈ 1,25 MB por imagem já reduzida no navegador (limite do corpo na Vercel: 4,5 MB)

export const attachmentInput = z.object({ data: z.string().max(MAX_B64_CHARS, "Imagem grande demais") })
export const messageBody = z.string().trim().min(1, "Escreva uma mensagem").max(5000, "Máximo de 5.000 caracteres")

/**
 * Reprocessa uma imagem enviada: valida que é imagem de verdade, corrige a rotação, reduz para no
 * máximo 1600 px e re-codifica em JPEG. Ao re-codificar, TODOS os metadados (EXIF, GPS, modelo do
 * aparelho, data) são descartados, pois poderiam identificar quem enviou o relato.
 */
export async function sanitizeImage(base64: string) {
  const raw = Buffer.from(base64.replace(/^data:[^,]+,/, ""), "base64")
  if (raw.length < 100) throw new HTTPException(422, { message: "Arquivo inválido: envie uma imagem (JPG, PNG ou WebP)." })
  try {
    const data = await sharp(raw, { limitInputPixels: 40_000_000, failOn: "error" })
      .rotate() // aplica a orientação do EXIF antes de descartá-lo
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer()
    return { mime: "image/jpeg", data, size: data.length }
  } catch {
    throw new HTTPException(422, { message: "Arquivo inválido: envie uma imagem (JPG, PNG ou WebP)." })
  }
}

export type NewAttachment = z.infer<typeof attachmentInput>

/** Cria uma mensagem (e seus anexos já saneados) na conversa de um relato. */
export async function addMessage(db: Db, reportId: string, author: "reporter" | "hr" | "note", body: string, files: NewAttachment[] = []) {
  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new HTTPException(422, { message: `No máximo ${MAX_ATTACHMENTS_PER_MESSAGE} imagens por mensagem.` })
  }
  if (files.length) {
    const [{ n }] = (await db
      .select({ n: sql<number>`count(*)::int` })
      .from(channelAttachments)
      .where(eq(channelAttachments.reportId, reportId))) as [{ n: number }]
    if (n + files.length > MAX_ATTACHMENTS_PER_REPORT) {
      throw new HTTPException(422, { message: `Esta conversa já atingiu o limite de ${MAX_ATTACHMENTS_PER_REPORT} imagens.` })
    }
  }
  const clean = await Promise.all(files.map((f) => sanitizeImage(f.data)))
  const [message] = await db.insert(channelMessages).values({ reportId, author, body, createdDay: today() }).returning()
  if (clean.length) {
    await db.insert(channelAttachments).values(clean.map((c) => ({ messageId: message!.id, reportId, mime: c.mime, size: c.size, data: c.data })))
  }
  return message!
}

/** Conversa de um relato. `includeNotes` só para o RH: notas internas nunca vão ao autor do relato. */
export async function loadThread(db: Db, reportId: string, includeNotes: boolean) {
  const messages = await db
    .select({ id: channelMessages.id, seq: channelMessages.seq, author: channelMessages.author, body: channelMessages.body, day: channelMessages.createdDay })
    .from(channelMessages)
    .where(
      includeNotes
        ? eq(channelMessages.reportId, reportId)
        : and(eq(channelMessages.reportId, reportId), inArray(channelMessages.author, ["reporter", "hr"]))
    )
    .orderBy(asc(channelMessages.seq))
  const attachments = messages.length
    ? await db
        .select({ id: channelAttachments.id, messageId: channelAttachments.messageId, mime: channelAttachments.mime, size: channelAttachments.size })
        .from(channelAttachments)
        .where(inArray(channelAttachments.messageId, messages.map((m) => m.id)))
    : []
  return messages.map((m) => ({ ...m, attachments: attachments.filter((a) => a.messageId === m.id).map(({ id, mime, size }) => ({ id, mime, size })) }))
}

/**
 * Depois de uma mensagem do autor, reavalia a triagem: se o novo texto indicar gravidade, urgência
 * ou identificação de pessoas maiores, a prioridade do relato sobe (nunca desce).
 */
export async function retriageAfterReply(db: Db, report: typeof channelReports.$inferSelect, body: string) {
  const t = await triageReport(body, report.category)
  const prev = report.triage
  const merged = prev
    ? { ...prev, engine: t.engine, model: t.model, severity: Math.max(prev.severity, t.severity), urgent: Math.max(prev.urgent, t.urgent), identifiesPeople: Math.max(prev.identifiesPeople, t.identifiesPeople) }
    : t
  await db.update(channelReports).set({ triage: merged }).where(eq(channelReports.id, report.id))
}

// ---------------------------------------------------------------- acesso aos arquivos

function parseCookies(header: string | null) {
  const out: Record<string, string> = {}
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=")
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

/**
 * Quem pode ver um anexo: (a) quem tem o protocolo do relato, ou (b) um usuário do painel com
 * vínculo à empresa dona do relato (qualquer papel). Retorna o anexo ou null.
 */
export async function authorizeAttachment(db: Db, attachmentId: string, protocol: string | null, cookieHeader: string | null) {
  const [row] = await db
    .select({
      mime: channelAttachments.mime,
      data: channelAttachments.data,
      protocol: channelReports.protocol,
      companyId: channelReports.companyId,
      author: channelMessages.author,
    })
    .from(channelAttachments)
    .innerJoin(channelReports, eq(channelReports.id, channelAttachments.reportId))
    .innerJoin(channelMessages, eq(channelMessages.id, channelAttachments.messageId))
    .where(eq(channelAttachments.id, attachmentId))
  if (!row) return null

  if (protocol && protocol.trim().toUpperCase() === row.protocol && row.author !== "note") return row
  const session = readSessionToken(parseCookies(cookieHeader)[SESSION_COOKIE])
  if (session) {
    const m = await db.query.memberships.findFirst({ where: and(eq(memberships.userId, session.userId), eq(memberships.companyId, row.companyId)) })
    if (m) return row
  }
  return null
}
