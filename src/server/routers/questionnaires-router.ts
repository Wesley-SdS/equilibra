import { and, asc, eq } from "drizzle-orm"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { questionnaireVersions, questionnaires } from "../db/schema"
import { audit } from "../audit"
import { assertWritable } from "../billing"
import { editorProcedure, j, privateProcedure } from "../jstack"
import { latestVersion, listQuestionnaires, visibleTo } from "../questionnaires"
import { DIMENSIONS, type DimensionId } from "@/lib/methodology"
import { MAX_ITEMS, MIN_ITEMS, QUESTIONNAIRE_KINDS, newItemId, type QuestionnaireItem, type QuestionnaireKind } from "@/lib/questionnaire"

const kindEnum = z.enum(QUESTIONNAIRE_KINDS.map((k) => k.id) as [QuestionnaireKind, ...QuestionnaireKind[]])
const dimensionEnum = z.enum(DIMENSIONS.map((d) => d.id) as [DimensionId, ...DimensionId[]])

const itemInput = z.object({
  id: z.string().trim().min(1).max(40).optional(),
  text: z.string().trim().min(8, "Escreva o item com pelo menos 8 caracteres").max(200, "Máximo de 200 caracteres por item"),
  type: z.literal("likert5").default("likert5"),
  dimension: dimensionEnum.nullable().default(null),
  risk: z.boolean().default(true),
})
const itemsInput = z.array(itemInput).min(MIN_ITEMS, "Inclua pelo menos um item").max(MAX_ITEMS, `Máximo de ${MAX_ITEMS} itens`)

const baseInput = z.object({
  name: z.string().trim().min(3, "Dê um nome ao questionário").max(80),
  purpose: z.string().trim().max(500).default(""),
  kind: kindEnum.default("livre"),
  anonymous: z.boolean().default(true),
})

/** Normaliza os itens: id estável por item (gerado quando falta) e sem ids repetidos. */
function normalizeItems(items: z.infer<typeof itemsInput>): QuestionnaireItem[] {
  const seen = new Set<string>()
  return items.map((i) => {
    let id = i.id ?? newItemId()
    while (seen.has(id)) id = newItemId()
    seen.add(id)
    return { id, text: i.text, type: "likert5", dimension: i.dimension, risk: i.risk }
  })
}

/** Forma canônica para comparar itens (o jsonb do Postgres reordena as chaves). */
function canonical(items: QuestionnaireItem[]) {
  return JSON.stringify(items.map((i) => [i.id, i.text, i.type, i.dimension, i.risk]))
}

function assertAnonymityRule(kind: QuestionnaireKind, anonymous: boolean) {
  if (!anonymous) {
    if (kind === "nr1") throw new HTTPException(400, { message: "O questionário NR-1 é sempre anônimo: a avaliação é das condições de trabalho, não das pessoas." })
    throw new HTTPException(400, { message: "O modo identificado ainda não está disponível. Por enquanto todos os questionários são anônimos." })
  }
}

async function ownQuestionnaire(db: Parameters<typeof latestVersion>[0], companyId: string, id: string) {
  const q = await db.query.questionnaires.findFirst({ where: and(eq(questionnaires.id, id), visibleTo(companyId)) })
  if (!q) throw new HTTPException(404, { message: "Questionário não encontrado" })
  if (q.companyId === null) throw new HTTPException(403, { message: "Este questionário é padrão do sistema. Duplique-o para editar uma cópia." })
  return q
}

export const questionnairesRouter = j.router({
  /** Biblioteca: questionários de sistema e da empresa, com versão atual e uso. */
  list: privateProcedure.query(async ({ c, ctx }) => {
    return c.superjson(await listQuestionnaires(ctx.db, ctx.session.companyId))
  }),

  /** Um questionário com a versão atual (itens) e o histórico de versões. */
  get: privateProcedure.input(z.object({ id: z.string() })).query(async ({ c, ctx, input }) => {
    const q = await ctx.db.query.questionnaires.findFirst({ where: and(eq(questionnaires.id, input.id), visibleTo(ctx.session.companyId)) })
    if (!q) throw new HTTPException(404, { message: "Questionário não encontrado" })
    const versions = await ctx.db
      .select({ id: questionnaireVersions.id, version: questionnaireVersions.version, publishedAt: questionnaireVersions.publishedAt, items: questionnaireVersions.items })
      .from(questionnaireVersions)
      .where(eq(questionnaireVersions.questionnaireId, q.id))
      .orderBy(asc(questionnaireVersions.version))
    const current = versions[versions.length - 1]
    return c.superjson({
      ...q,
      system: q.companyId === null,
      current: current ? { id: current.id, version: current.version, items: current.items } : null,
      versions: versions.map((v) => ({ id: v.id, version: v.version, publishedAt: v.publishedAt, itemCount: v.items.length })),
    })
  }),

  create: editorProcedure.input(baseInput.extend({ items: itemsInput })).mutation(async ({ c, ctx, input }) => {
    await assertWritable(ctx.db, ctx.session.companyId)
    assertAnonymityRule(input.kind, input.anonymous)
    const items = normalizeItems(input.items)
    const row = await ctx.db.transaction(async (tx) => {
      const [q] = await tx
        .insert(questionnaires)
        .values({ companyId: ctx.session.companyId, name: input.name, purpose: input.purpose, kind: input.kind, anonymous: input.anonymous, origin: "manual" })
        .returning()
      await tx.insert(questionnaireVersions).values({ questionnaireId: q!.id, version: 1, items })
      return q!
    })
    await audit(ctx.db, ctx.session, { action: "create", entity: "questionário", entityId: row.id, summary: `Questionário “${row.name}” criado (${items.length} itens)` })
    return c.superjson(row)
  }),

  /** Edita nome, finalidade e tipo; itens alterados viram uma versão nova (campanhas antigas não mudam). */
  update: editorProcedure.input(baseInput.partial().extend({ id: z.string(), items: itemsInput.optional() })).mutation(async ({ c, ctx, input }) => {
    const q = await ownQuestionnaire(ctx.db, ctx.session.companyId, input.id)
    const kind = input.kind ?? q.kind
    const anonymous = input.anonymous ?? q.anonymous
    assertAnonymityRule(kind, anonymous)
    const current = await latestVersion(ctx.db, q.id)
    const items = input.items ? normalizeItems(input.items) : null
    const changed = items !== null && canonical(items) !== canonical(current?.items ?? [])
    const next = changed ? (current?.version ?? 0) + 1 : null
    await ctx.db.transaction(async (tx) => {
      await tx
        .update(questionnaires)
        .set({ name: input.name ?? q.name, purpose: input.purpose ?? q.purpose, kind, anonymous, updatedAt: new Date() })
        .where(eq(questionnaires.id, q.id))
      if (next && items) await tx.insert(questionnaireVersions).values({ questionnaireId: q.id, version: next, items })
    })
    await audit(ctx.db, ctx.session, {
      action: "update",
      entity: "questionário",
      entityId: q.id,
      summary: next ? `Questionário “${input.name ?? q.name}” editado: versão ${next} publicada (${items!.length} itens)` : `Questionário “${input.name ?? q.name}” editado`,
    })
    return c.superjson({ ok: true, version: next ?? current?.version ?? null })
  }),

  /** Cópia editável (serve para partir do NR-1 padrão ou de um importado). */
  duplicate: editorProcedure.input(z.object({ id: z.string() })).mutation(async ({ c, ctx, input }) => {
    await assertWritable(ctx.db, ctx.session.companyId)
    const source = await ctx.db.query.questionnaires.findFirst({ where: and(eq(questionnaires.id, input.id), visibleTo(ctx.session.companyId)) })
    if (!source) throw new HTTPException(404, { message: "Questionário não encontrado" })
    const version = await latestVersion(ctx.db, source.id)
    const row = await ctx.db.transaction(async (tx) => {
      const [q] = await tx
        .insert(questionnaires)
        .values({ companyId: ctx.session.companyId, name: `${source.name} (cópia)`.slice(0, 80), purpose: source.purpose, kind: source.kind, anonymous: true, origin: "manual" })
        .returning()
      await tx.insert(questionnaireVersions).values({ questionnaireId: q!.id, version: 1, items: version?.items ?? [] })
      return q!
    })
    await audit(ctx.db, ctx.session, { action: "create", entity: "questionário", entityId: row.id, summary: `Questionário “${row.name}” criado a partir de “${source.name}”` })
    return c.superjson(row)
  }),

  setStatus: editorProcedure.input(z.object({ id: z.string(), status: z.enum(["active", "archived"]) })).mutation(async ({ c, ctx, input }) => {
    const q = await ownQuestionnaire(ctx.db, ctx.session.companyId, input.id)
    await ctx.db.update(questionnaires).set({ status: input.status, updatedAt: new Date() }).where(eq(questionnaires.id, q.id))
    await audit(ctx.db, ctx.session, { action: "status", entity: "questionário", entityId: q.id, summary: `Questionário “${q.name}” ${input.status === "archived" ? "arquivado" : "restaurado"}` })
    return c.superjson({ ok: true })
  }),
})
