import { and, asc, eq, sql } from "drizzle-orm"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { customQuestions } from "../db/schema"
import { audit } from "../audit"
import { computeCustomResults } from "../insights"
import { editorProcedure, j, privateProcedure } from "../jstack"

export const MAX_CUSTOM_QUESTIONS = 10
const text = z.string().trim().min(8, "Escreva a pergunta com pelo menos 8 caracteres").max(200, "Máximo de 200 caracteres")

export const questionsRouter = j.router({
  list: privateProcedure.query(async ({ c, ctx }) => {
    const rows = await ctx.db
      .select()
      .from(customQuestions)
      .where(eq(customQuestions.companyId, ctx.session.companyId))
      .orderBy(asc(customQuestions.position), asc(customQuestions.createdAt))
    return c.superjson(rows)
  }),

  create: editorProcedure.input(z.object({ text })).mutation(async ({ c, ctx, input }) => {
    const [{ active, maxPos }] = (await ctx.db
      .select({
        active: sql<number>`count(*) filter (where ${customQuestions.active})::int`,
        maxPos: sql<number>`coalesce(max(${customQuestions.position}), -1)::int`,
      })
      .from(customQuestions)
      .where(eq(customQuestions.companyId, ctx.session.companyId))) as [{ active: number; maxPos: number }]
    if (active >= MAX_CUSTOM_QUESTIONS) {
      throw new HTTPException(400, { message: `Limite de ${MAX_CUSTOM_QUESTIONS} perguntas ativas. Desative uma para criar outra.` })
    }
    const [row] = await ctx.db
      .insert(customQuestions)
      .values({ companyId: ctx.session.companyId, text: input.text, position: maxPos + 1 })
      .returning()
    await audit(ctx.db, ctx.session, { action: "create", entity: "pergunta", entityId: row!.id, summary: `Pergunta personalizada criada: ${row!.text}` })
    return c.superjson(row!)
  }),

  update: editorProcedure
    .input(z.object({ id: z.string(), text: text.optional(), active: z.boolean().optional() }))
    .mutation(async ({ c, ctx, input }) => {
      const { id, ...data } = input
      if (data.active) {
        const [{ active }] = (await ctx.db
          .select({ active: sql<number>`count(*)::int` })
          .from(customQuestions)
          .where(and(eq(customQuestions.companyId, ctx.session.companyId), eq(customQuestions.active, true)))) as [{ active: number }]
        if (active >= MAX_CUSTOM_QUESTIONS) throw new HTTPException(400, { message: `Limite de ${MAX_CUSTOM_QUESTIONS} perguntas ativas.` })
      }
      const [row] = await ctx.db
        .update(customQuestions)
        .set(data)
        .where(and(eq(customQuestions.id, id), eq(customQuestions.companyId, ctx.session.companyId)))
        .returning()
      if (row) {
        const what = data.text ? "editada" : data.active ? "ativada" : "desativada"
        await audit(ctx.db, ctx.session, { action: "update", entity: "pergunta", entityId: row.id, summary: `Pergunta ${what}: ${row.text}` })
      }
      return c.superjson({ ok: true })
    }),

  /** Troca a posição com a vizinha de cima ou de baixo. */
  move: editorProcedure
    .input(z.object({ id: z.string(), dir: z.enum(["up", "down"]) }))
    .mutation(async ({ c, ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(customQuestions)
        .where(eq(customQuestions.companyId, ctx.session.companyId))
        .orderBy(asc(customQuestions.position), asc(customQuestions.createdAt))
      const i = rows.findIndex((r) => r.id === input.id)
      const j2 = input.dir === "up" ? i - 1 : i + 1
      if (i < 0 || j2 < 0 || j2 >= rows.length) return c.superjson({ ok: true })
      const order = rows.map((r) => r.id)
      ;[order[i], order[j2]] = [order[j2]!, order[i]!]
      for (const [pos, id] of order.entries()) {
        await ctx.db.update(customQuestions).set({ position: pos }).where(eq(customQuestions.id, id))
      }
      return c.superjson({ ok: true })
    }),

  remove: editorProcedure.input(z.object({ id: z.string() })).mutation(async ({ c, ctx, input }) => {
    const [row] = await ctx.db
      .delete(customQuestions)
      .where(and(eq(customQuestions.id, input.id), eq(customQuestions.companyId, ctx.session.companyId)))
      .returning()
    if (row) await audit(ctx.db, ctx.session, { action: "delete", entity: "pergunta", entityId: row.id, summary: `Pergunta excluída: ${row.text}` })
    return c.superjson({ ok: true })
  }),

  /** Resultados das perguntas personalizadas de uma campanha (ou da mais recente). */
  results: privateProcedure
    .input(z.object({ campaignId: z.string().optional() }).optional())
    .query(async ({ c, ctx, input }) => {
      return c.superjson(await computeCustomResults(ctx.db, ctx.session.companyId, input?.campaignId))
    }),
})
