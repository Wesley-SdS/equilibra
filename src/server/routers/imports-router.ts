import { and, asc, desc, eq } from "drizzle-orm"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import type { Db } from "../db"
import { answers, campaigns, importRows, imports, questionnaireVersions, questionnaires, responses, sectors } from "../db/schema"
import { audit } from "../audit"
import { publicToken, today } from "../auth"
import { assertLimit, assertWritable } from "../billing"
import { editorProcedure, j, privateProcedure } from "../jstack"
import { ImportError, MAX_IMPORT_BYTES, ScannedPdfError, cleanText, detectSource, fromExtracted, imageMediaType, norm, parsePdf, parseSheet, parseText, propose, type ParsedFile } from "../imports"
import { agentsAvailable } from "../agents/client"
import { GOOGLE_TOKEN_COOKIE, googleFormsEnabled, importFromForms, importFromSheets } from "../google"
import { deleteCookie, getCookie } from "hono/cookie"
import { extractQuestionsWithClaude, type ExtractMedia } from "../agents/import-extractor"
import { rateLimit } from "../rate-limit"
import { DIMENSIONS, type DimensionId } from "@/lib/methodology"
import { QUESTIONNAIRE_KINDS, type QuestionnaireItem, type QuestionnaireKind } from "@/lib/questionnaire"

const kindEnum = z.enum(QUESTIONNAIRE_KINDS.map((k) => k.id) as [QuestionnaireKind, ...QuestionnaireKind[]])
const dimensionEnum = z.enum(DIMENSIONS.map((d) => d.id) as [DimensionId, ...DimensionId[]])
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")

const QUESTION_KINDS = new Set(["likert5", "likert3", "yesno", "numeric", "question"])

async function loadImport(db: Db, companyId: string, id: string) {
  const imp = await db.query.imports.findFirst({ where: and(eq(imports.id, id), eq(imports.companyId, companyId)) })
  if (!imp) throw new HTTPException(404, { message: "Importação não encontrada" })
  return imp
}
function assertDraft(imp: { status: string }) {
  if (imp.status !== "draft") throw new HTTPException(400, { message: "Esta importação já foi concluída ou descartada." })
}

type Row = typeof importRows.$inferSelect
type Imp = typeof imports.$inferSelect

/** Pendências que impedem confirmar (bloqueios) e avisos que só informam. */
export function validateImport(imp: Imp, rows: Row[], companySectorIds: Set<string>) {
  const blocking: string[] = []
  const warnings: string[] = []
  const accepted = rows.filter((r) => r.action === "accept")
  const pending = rows.filter((r) => r.action === "pending")
  if (pending.length) blocking.push(`${pending.length} ${pending.length === 1 ? "pergunta aguarda" : "perguntas aguardam"} sua decisão (aceitar ou ignorar).`)
  if (!accepted.length) blocking.push("Aceite pelo menos uma pergunta.")
  for (const r of accepted) if (r.final.text.trim().length < 8) blocking.push(`A pergunta ${r.position + 1} está curta demais.`)
  if (accepted.length > 40) blocking.push("O questionário pode ter no máximo 40 itens. Ignore as perguntas que não precisa.")
  const unscored = accepted.filter((r) => !r.final.dimension).length
  if (unscored) warnings.push(`${unscored} ${unscored === 1 ? "item ficará" : "itens ficarão"} fora do score (sem dimensão).`)
  if (imp.dropped.length) warnings.push(`Colunas identificáveis descartadas: ${imp.dropped.join(", ")}.`)

  const withResponses = imp.importResponses && imp.responseCount > 0 && imp.data !== null
  if (withResponses) {
    const hasSectorColumn = rows.some((r) => r.action === "sector")
    if (hasSectorColumn) {
      const values = [...new Set((imp.data!.sectors ?? []).filter((s): s is string => !!s))]
      const unmapped = values.filter((v) => {
        const m = imp.sectorMap[v]
        return !m || (m !== "new" && m !== "skip" && !companySectorIds.has(m))
      })
      if (unmapped.length) blocking.push(`Mapeie ${unmapped.length} ${unmapped.length === 1 ? "valor de setor" : "valores de setor"} para os setores da empresa.`)
      if ((imp.data!.sectors ?? []).some((s) => !s) && !(imp.defaultSectorId && companySectorIds.has(imp.defaultSectorId))) {
        blocking.push("Algumas respostas não têm setor: escolha o setor para elas.")
      }
    } else if (!(imp.defaultSectorId && companySectorIds.has(imp.defaultSectorId))) {
      blocking.push("O arquivo não tem coluna de setor: escolha o setor das respostas importadas.")
    }
    if (!imp.startsAt || !imp.endsAt) blocking.push("Informe o período em que a pesquisa original foi aplicada.")
    else if (imp.endsAt < imp.startsAt) blocking.push("O fim do período deve ser depois do início.")
    else if (imp.endsAt > today()) blocking.push("O período da pesquisa importada não pode terminar no futuro.")
  }
  return { blocking, warnings, withResponses }
}

/**
 * Respostas importáveis: converte os valores brutos para 1..5. Valor ausente ou não reconhecido vira
 * "sem resposta" naquele item; a resposta inteira só é descartada quando não sobra nenhum valor.
 */
function buildResponses(imp: Imp, accepted: Row[]) {
  if (!imp.data) return { ok: [] as { sector: string | null; values: (number | null)[] }[], skipped: 0 }
  const ok: { sector: string | null; values: (number | null)[] }[] = []
  let skipped = 0
  imp.data.values.forEach((rowValues, i) => {
    const values = accepted.map((r) => {
      const raw = r.column === null ? null : rowValues[r.column]
      return raw === null || raw === undefined ? null : (r.valueMap[norm(raw)] ?? null)
    })
    if (values.every((v) => v === null)) skipped += 1
    else ok.push({ sector: imp.data!.sectors[i] ?? null, values })
  })
  return { ok, skipped }
}

async function createRows(db: Db, importId: string, parsed: ParsedFile) {
  // Propostas em paralelo (o Jev responde em uma chamada por pergunta; sem credencial, só regras).
  const proposals = await Promise.all(
    parsed.columns.map(async (c) => {
      if (!QUESTION_KINDS.has(c.detected)) return null
      return propose(cleanText(c.raw))
    })
  )
  const rows = parsed.columns.map((c, position) => {
    const p = proposals[position]
    const text = cleanText(c.raw)
    const proposal = p?.proposal ?? { text, dimension: null, risk: true }
    const action: Row["action"] =
      c.detected === "identifier" || c.detected === "timestamp" || c.detected === "open" ? "ignore" : c.detected === "sector" ? "sector" : "pending"
    const issues = [...c.issues]
    if (p && p.confidence < 70) issues.push("Confira a dimensão e a polaridade: a classificação automática tem pouca confiança.")
    return {
      importId,
      position,
      column: c.column,
      raw: c.raw,
      detected: c.detected,
      valueMap: c.valueMap,
      proposed: proposal,
      final: proposal,
      confidence: p?.confidence ?? 100,
      engine: p?.engine ?? ("regras" as const),
      issues,
      action,
    }
  })
  if (rows.length) await db.insert(importRows).values(rows)
}


const proposalInput = z.object({
  text: z.string().trim().min(1).max(200),
  dimension: dimensionEnum.nullable(),
  risk: z.boolean(),
})

export const importsRouter = j.router({
  /** Se a conexão com o Google Forms está configurada e se este navegador já conectou. */
  googleStatus: privateProcedure.query(async ({ c }) => {
    return c.superjson({ formsEnabled: googleFormsEnabled(), connected: Boolean(getCookie(c, GOOGLE_TOKEN_COOKIE)) })
  }),

  googleDisconnect: editorProcedure.mutation(async ({ c }) => {
    deleteCookie(c, GOOGLE_TOKEN_COOKIE, { path: "/" })
    return c.superjson({ ok: true })
  }),

  /** Rascunhos de importação em andamento (para retomar depois). */
  list: privateProcedure.query(async ({ c, ctx }) => {
    const rows = await ctx.db
      .select({ id: imports.id, filename: imports.filename, name: imports.name, status: imports.status, createdAt: imports.createdAt, responseCount: imports.responseCount })
      .from(imports)
      .where(and(eq(imports.companyId, ctx.session.companyId), eq(imports.status, "draft")))
      .orderBy(desc(imports.createdAt))
    return c.superjson(rows)
  }),

  /**
   * Recebe o arquivo (base64) ou o texto colado, lê, classifica e cria o rascunho.
   * Limite de 3 MB: o corpo da requisição na Vercel não passa de 4,5 MB.
   */
  upload: editorProcedure
    .input(
      z.object({
        filename: z.string().trim().min(1).max(160),
        data: z.string().max(Math.ceil((MAX_IMPORT_BYTES * 4) / 3) + 8, "Arquivo grande demais (máximo de 3 MB).").optional(),
        text: z.string().max(60_000).optional(),
        // Link de planilha do Google Sheets ("qualquer pessoa com o link") ou de edição do Google Forms.
        googleUrl: z.string().trim().url("Link inválido").max(500).optional(),
      })
    )
    .mutation(async ({ c, ctx, input }) => {
      await assertWritable(ctx.db, ctx.session.companyId)
      await rateLimit(`import:${ctx.session.companyId}`, 30, 60 * 60_000)
      let parsed: ParsedFile
      try {
        if (input.googleUrl) {
          if (input.googleUrl.includes("/forms/")) {
            const token = getCookie(c, GOOGLE_TOKEN_COOKIE)
            if (!token) throw new ImportError("Conecte sua conta Google para importar do Forms (ou exporte as respostas para o Google Sheets e cole o link da planilha).")
            parsed = await importFromForms(input.googleUrl, token)
          } else {
            parsed = await importFromSheets(input.googleUrl)
          }
        } else if (input.text !== undefined) {
          parsed = parseText(input.text, "text")
        } else {
          if (!input.data) throw new ImportError("Envie um arquivo ou cole o texto das perguntas.")
          const source = detectSource(input.filename)
          if (!source) throw new ImportError("Formato não suportado. Envie XLSX, CSV, PDF ou foto (JPG, PNG).")
          const buffer = Buffer.from(input.data, "base64")
          if (buffer.length > MAX_IMPORT_BYTES) throw new ImportError("Arquivo grande demais (máximo de 3 MB).")
          // PDF escaneado ou foto do questionário em papel: leitura pelo Claude (conta na cota dos copilotos).
          const viaClaude = async (media: ExtractMedia, kind: "pdf" | "image") => {
            if (!agentsAvailable()) {
              throw new ImportError(`${kind === "pdf" ? "O PDF não tem texto selecionável (parece escaneado)" : "Fotos"} só podem ser lidos com os copilotos de IA ativos. Cole o texto das perguntas ou envie a planilha.`)
            }
            const out = await extractQuestionsWithClaude({ db: ctx.db, companyId: ctx.session.companyId, userId: ctx.session.userId }, buffer, media)
            return fromExtracted(out.questions, kind, out.identifiesPeople)
          }
          if (source === "pdf") {
            try {
              parsed = await parsePdf(buffer)
            } catch (err) {
              if (!(err instanceof ScannedPdfError)) throw err
              parsed = await viaClaude("application/pdf", "pdf")
            }
          } else if (source === "image") {
            parsed = await viaClaude(imageMediaType(input.filename), "image")
          } else {
            parsed = parseSheet(buffer, source)
          }
        }
      } catch (err) {
        if (err instanceof HTTPException) throw err
        if (err instanceof ImportError) throw new HTTPException(422, { message: err.message })
        throw new HTTPException(422, { message: "Não conseguimos ler este arquivo. Confira se ele abre normalmente e tente de novo." })
      }
      if (!parsed.columns.some((col) => QUESTION_KINDS.has(col.detected))) {
        throw new HTTPException(422, { message: "Não encontramos perguntas no arquivo. A primeira linha da planilha deve ter as perguntas." })
      }
      const base = ("title" in parsed && typeof parsed.title === "string" && parsed.title) || input.filename.replace(/\.[a-z0-9]+$/i, "").trim() || "Questionário importado"
      const [imp] = await ctx.db
        .insert(imports)
        .values({
          companyId: ctx.session.companyId,
          userId: ctx.session.userId,
          source: parsed.source,
          filename: input.filename,
          name: `${base} (importado)`.slice(0, 80),
          responseCount: parsed.data?.values.length ?? 0,
          importResponses: Boolean(parsed.data?.values.length),
          dropped: parsed.dropped,
          data: parsed.data,
        })
        .returning()
      await createRows(ctx.db, imp!.id, parsed)
      await audit(ctx.db, ctx.session, {
        action: "create",
        entity: "importação",
        entityId: imp!.id,
        summary: `Arquivo “${input.filename}” enviado para importação (${parsed.columns.length} colunas, ${imp!.responseCount} respostas)${parsed.dropped.length ? `; colunas identificáveis descartadas na leitura: ${parsed.dropped.join(", ")}` : ""}`,
      })
      return c.superjson({ id: imp!.id })
    }),

  get: privateProcedure.input(z.object({ id: z.string() })).query(async ({ c, ctx, input }) => {
    const imp = await loadImport(ctx.db, ctx.session.companyId, input.id)
    const rows = await ctx.db.select().from(importRows).where(eq(importRows.importId, imp.id)).orderBy(asc(importRows.position))
    const companySectors = await ctx.db.select({ id: sectors.id, name: sectors.name }).from(sectors).where(eq(sectors.companyId, ctx.session.companyId)).orderBy(sectors.name)
    const validation = validateImport(imp, rows, new Set(companySectors.map((s) => s.id)))
    // Valores distintos da coluna de setor, com contagem (para o passo de mapeamento).
    const sectorValues = new Map<string, number>()
    for (const s of imp.data?.sectors ?? []) if (s) sectorValues.set(s, (sectorValues.get(s) ?? 0) + 1)
    const accepted = rows.filter((r) => r.action === "accept")
    const preview = imp.importResponses ? buildResponses(imp, accepted) : { ok: [], skipped: 0 }
    const { data: _data, ...meta } = imp
    void _data
    return c.superjson({
      ...meta,
      rows,
      sectors: companySectors,
      sectorValues: [...sectorValues.entries()].map(([value, count]) => ({ value, count, guess: companySectors.find((s) => norm(s.name) === norm(value))?.id ?? null })),
      noSectorCount: (imp.data?.sectors ?? []).filter((s) => !s).length,
      validation,
      importable: preview.ok.length,
      skipped: preview.skipped,
    })
  }),

  /** Decide uma linha: aceitar, ignorar ou corrigir texto, dimensão e polaridade. */
  updateRow: editorProcedure
    .input(z.object({ id: z.string(), action: z.enum(["pending", "accept", "ignore"]).optional(), final: proposalInput.optional() }))
    .mutation(async ({ c, ctx, input }) => {
      const row = await ctx.db.query.importRows.findFirst({ where: eq(importRows.id, input.id) })
      if (!row) throw new HTTPException(404, { message: "Linha não encontrada" })
      const imp = await loadImport(ctx.db, ctx.session.companyId, row.importId)
      assertDraft(imp)
      if (row.detected === "identifier" && input.action === "accept") throw new HTTPException(400, { message: "Colunas que identificam pessoas não podem entrar num questionário anônimo." })
      if (row.detected === "sector" || row.detected === "timestamp") throw new HTTPException(400, { message: "Esta coluna não é uma pergunta." })
      await ctx.db
        .update(importRows)
        .set({ ...(input.action ? { action: input.action } : {}), ...(input.final ? { final: { ...input.final, text: cleanText(input.final.text) } } : {}) })
        .where(eq(importRows.id, row.id))
      return c.superjson({ ok: true })
    }),

  /** Aceita de uma vez as perguntas pendentes com confiança a partir do limite. */
  acceptAll: editorProcedure.input(z.object({ importId: z.string(), min: z.number().int().min(0).max(100).default(90) })).mutation(async ({ c, ctx, input }) => {
    const imp = await loadImport(ctx.db, ctx.session.companyId, input.importId)
    assertDraft(imp)
    const rows = await ctx.db.select().from(importRows).where(eq(importRows.importId, imp.id))
    const ids = rows.filter((r) => r.action === "pending" && r.confidence >= input.min && r.detected !== "identifier").map((r) => r.id)
    for (const id of ids) await ctx.db.update(importRows).set({ action: "accept" }).where(eq(importRows.id, id))
    return c.superjson({ accepted: ids.length })
  }),

  /** Nome, tipo, período e mapeamento de setores do rascunho. */
  update: editorProcedure
    .input(
      z.object({
        importId: z.string(),
        name: z.string().trim().min(3).max(80).optional(),
        kind: kindEnum.optional(),
        importResponses: z.boolean().optional(),
        sectorMap: z.record(z.string(), z.string().nullable()).optional(),
        defaultSectorId: z.string().nullable().optional(),
        startsAt: date.nullable().optional(),
        endsAt: date.nullable().optional(),
      })
    )
    .mutation(async ({ c, ctx, input }) => {
      const imp = await loadImport(ctx.db, ctx.session.companyId, input.importId)
      assertDraft(imp)
      const { importId: _id, ...data } = input
      void _id
      await ctx.db
        .update(imports)
        .set({ ...data, ...(data.sectorMap ? { sectorMap: { ...imp.sectorMap, ...data.sectorMap } } : {}) })
        .where(eq(imports.id, imp.id))
      return c.superjson({ ok: true })
    }),

  /** Cria o questionário (e a campanha histórica, se houver respostas) e apaga os dados brutos. */
  confirm: editorProcedure.input(z.object({ importId: z.string() })).mutation(async ({ c, ctx, input }) => {
    await assertWritable(ctx.db, ctx.session.companyId)
    const imp = await loadImport(ctx.db, ctx.session.companyId, input.importId)
    assertDraft(imp)
    const rows = await ctx.db.select().from(importRows).where(eq(importRows.importId, imp.id)).orderBy(asc(importRows.position))
    const companySectors = await ctx.db.select().from(sectors).where(eq(sectors.companyId, ctx.session.companyId))
    const validation = validateImport(imp, rows, new Set(companySectors.map((s) => s.id)))
    if (validation.blocking.length) throw new HTTPException(400, { message: validation.blocking[0]! })
    const accepted = rows.filter((r) => r.action === "accept")
    const items: QuestionnaireItem[] = accepted.map((r) => ({ id: `imp_${r.position + 1}`, text: r.final.text, type: "likert5", dimension: r.final.dimension ?? null, risk: r.final.risk }))
    const built = validation.withResponses ? buildResponses(imp, accepted) : { ok: [], skipped: 0 }

    // Setores novos a criar a partir do mapeamento ("new"), com o nº de respostas como headcount inicial.
    const toCreate = new Map<string, number>()
    for (const r of built.ok) if (r.sector && imp.sectorMap[r.sector] === "new") toCreate.set(r.sector, (toCreate.get(r.sector) ?? 0) + 1)
    if (toCreate.size) await assertLimit(ctx.db, ctx.session.companyId, "employees", [...toCreate.values()].reduce((s, n) => s + n, 0))

    const result = await ctx.db.transaction(async (tx) => {
      const [q] = await tx
        .insert(questionnaires)
        .values({ companyId: ctx.session.companyId, name: imp.name, purpose: `Importado de ${imp.filename}`, kind: imp.kind, anonymous: true, origin: "imported" })
        .returning()
      const [version] = await tx.insert(questionnaireVersions).values({ questionnaireId: q!.id, version: 1, items }).returning()
      let campaignId: string | null = null
      if (validation.withResponses && built.ok.length) {
        const created = new Map<string, string>()
        for (const [name, count] of toCreate) {
          const [s] = await tx.insert(sectors).values({ companyId: ctx.session.companyId, name: name.slice(0, 60), headcount: Math.max(1, count) }).returning()
          created.set(name, s!.id)
        }
        const sectorOf = (raw: string | null) => {
          if (!raw) return imp.defaultSectorId
          const m = imp.sectorMap[raw]
          if (m === "new") return created.get(raw) ?? null
          if (m === "skip") return null
          return m ?? imp.defaultSectorId
        }
        const [camp] = await tx
          .insert(campaigns)
          .values({
            companyId: ctx.session.companyId,
            name: `${imp.name} · histórico`.slice(0, 80),
            token: publicToken(),
            status: "closed",
            startsAt: imp.startsAt!,
            endsAt: imp.endsAt!,
            questionnaireVersionId: version!.id,
            imported: true,
          })
          .returning()
        campaignId = camp!.id
        for (const r of built.ok) {
          const sectorId = sectorOf(r.sector)
          if (!sectorId) continue
          const [resp] = await tx.insert(responses).values({ campaignId: camp!.id, sectorId, createdDay: imp.endsAt! }).returning()
          const rowAnswers = items.flatMap((it, k) => (r.values[k] === null ? [] : [{ responseId: resp!.id, questionId: it.id, value: r.values[k]! }]))
          await tx.insert(answers).values(rowAnswers)
        }
      }
      // Dados brutos apagados: só ficam o questionário e as respostas já anonimizadas.
      await tx.update(imports).set({ status: "confirmed", data: null, questionnaireId: q!.id, campaignId }).where(eq(imports.id, imp.id))
      return { questionnaireId: q!.id, campaignId }
    })
    await audit(ctx.db, ctx.session, {
      action: "create",
      entity: "importação",
      entityId: imp.id,
      summary: `Importação de “${imp.filename}” confirmada: questionário “${imp.name}” com ${items.length} itens${result.campaignId ? ` e campanha histórica com ${built.ok.length} respostas${built.skipped ? ` (${built.skipped} vazias descartadas)` : ""}` : ""}`,
    })
    return c.superjson({ ...result, responses: built.ok.length, skipped: built.skipped })
  }),

  discard: editorProcedure.input(z.object({ importId: z.string() })).mutation(async ({ c, ctx, input }) => {
    const imp = await loadImport(ctx.db, ctx.session.companyId, input.importId)
    assertDraft(imp)
    await ctx.db.update(imports).set({ status: "discarded", data: null }).where(eq(imports.id, imp.id))
    await audit(ctx.db, ctx.session, { action: "delete", entity: "importação", entityId: imp.id, summary: `Importação de “${imp.filename}” descartada` })
    return c.superjson({ ok: true })
  }),
})
