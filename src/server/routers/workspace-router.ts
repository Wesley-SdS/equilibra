import { and, desc, eq, sql } from "drizzle-orm"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import type { Db } from "../db"
import { actions, campaigns, channelReports, companies, customQuestions, responses, sectors } from "../db/schema"
import { publicToken } from "../auth"
import { audit } from "../audit"
import { computeDimension, computeHistory, computeInsights, computePortfolio } from "../insights"
import { editorProcedure, j, privateProcedure } from "../jstack"
import { appUrl } from "../email"
import { sendCampaignReminder } from "../reminders"
import { buildReport } from "../report"
import { rateLimit } from "../rate-limit"
import { ACTION_LIBRARY, DIMENSIONS, type DimensionId } from "@/lib/methodology"

const dimensionEnum = z.enum(DIMENSIONS.map((d) => d.id) as [DimensionId, ...DimensionId[]])
const STATUS_LABEL = { todo: "A fazer", doing: "Em andamento", done: "Concluída" } as const

async function latestCampaignId(db: Db, companyId: string) {
  const latest = await db.query.campaigns.findFirst({
    where: eq(campaigns.companyId, companyId),
    orderBy: desc(campaigns.createdAt),
  })
  return latest?.id
}

const sectorInput = z.object({
  name: z.string().trim().min(1, "Informe o nome do setor").max(60),
  headcount: z.coerce.number().int().min(1, "Mínimo 1 pessoa").max(100000),
})

export const sectorsRouter = j.router({
  list: privateProcedure.query(async ({ c, ctx }) => {
    const rows = await ctx.db
      .select()
      .from(sectors)
      .where(eq(sectors.companyId, ctx.session.companyId))
      .orderBy(sectors.name)
    return c.superjson(rows)
  }),
  create: editorProcedure.input(sectorInput).mutation(async ({ c, ctx, input }) => {
    const [row] = await ctx.db
      .insert(sectors)
      .values({ ...input, companyId: ctx.session.companyId })
      .returning()
    await audit(ctx.db, ctx.session, { action: "create", entity: "setor", entityId: row!.id, summary: `Setor ${row!.name} criado (${row!.headcount} pessoas)` })
    return c.superjson(row!)
  }),
  update: editorProcedure.input(sectorInput.extend({ id: z.string() })).mutation(async ({ c, ctx, input }) => {
    const { id, ...data } = input
    await ctx.db
      .update(sectors)
      .set(data)
      .where(and(eq(sectors.id, id), eq(sectors.companyId, ctx.session.companyId)))
    await audit(ctx.db, ctx.session, { action: "update", entity: "setor", entityId: id, summary: `Setor ${data.name} atualizado (${data.headcount} pessoas)` })
    return c.superjson({ ok: true })
  }),
  remove: editorProcedure.input(z.object({ id: z.string() })).mutation(async ({ c, ctx, input }) => {
    const [row] = await ctx.db
      .delete(sectors)
      .where(and(eq(sectors.id, input.id), eq(sectors.companyId, ctx.session.companyId)))
      .returning()
    if (row) await audit(ctx.db, ctx.session, { action: "delete", entity: "setor", entityId: row.id, summary: `Setor ${row.name} removido` })
    return c.superjson({ ok: true })
  }),
})

const campaignSelect = {
  id: campaigns.id,
  name: campaigns.name,
  token: campaigns.token,
  status: campaigns.status,
  startsAt: campaigns.startsAt,
  endsAt: campaigns.endsAt,
  createdAt: campaigns.createdAt,
  responses: sql<number>`(select count(*)::int from ${responses} where ${responses.campaignId} = ${campaigns.id})`,
  customCount: sql<number>`jsonb_array_length(${campaigns.customQuestions})::int`,
}

export const campaignsRouter = j.router({
  list: privateProcedure.query(async ({ c, ctx }) => {
    const rows = await ctx.db
      .select(campaignSelect)
      .from(campaigns)
      .where(eq(campaigns.companyId, ctx.session.companyId))
      .orderBy(desc(campaigns.createdAt))
    return c.superjson(rows)
  }),
  get: privateProcedure.input(z.object({ id: z.string() })).query(async ({ c, ctx, input }) => {
    const [row] = await ctx.db
      .select(campaignSelect)
      .from(campaigns)
      .where(and(eq(campaigns.id, input.id), eq(campaigns.companyId, ctx.session.companyId)))
    if (!row) throw new HTTPException(404, { message: "Campanha não encontrada" })
    const company = await ctx.db.query.companies.findFirst({ where: eq(companies.id, ctx.session.companyId) })
    return c.superjson({ ...row, companyName: company!.name })
  }),
  create: editorProcedure
    .input(
      z
        .object({
          name: z.string().trim().min(2, "Dê um nome à campanha").max(80),
          startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
          endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
        })
        .refine((v) => v.endsAt >= v.startsAt, { message: "O fim deve ser depois do início", path: ["endsAt"] })
    )
    .mutation(async ({ c, ctx, input }) => {
      const hasSectors = await ctx.db.query.sectors.findFirst({
        where: eq(sectors.companyId, ctx.session.companyId),
      })
      if (!hasSectors) throw new HTTPException(400, { message: "Cadastre ao menos um setor antes" })
      const extra = await ctx.db
        .select({ id: customQuestions.id, text: customQuestions.text })
        .from(customQuestions)
        .where(and(eq(customQuestions.companyId, ctx.session.companyId), eq(customQuestions.active, true)))
        .orderBy(customQuestions.position, customQuestions.createdAt)
      const [row] = await ctx.db
        .insert(campaigns)
        .values({
          ...input,
          companyId: ctx.session.companyId,
          token: publicToken(),
          customQuestions: extra.map((q) => ({ id: `c:${q.id}`, text: q.text })),
        })
        .returning()
      await audit(ctx.db, ctx.session, { action: "create", entity: "campanha", entityId: row!.id, summary: `Campanha “${row!.name}” criada` })
      return c.superjson(row!)
    }),
  /** Envia agora o lembrete com a taxa de resposta para donos e admins. */
  remind: editorProcedure.input(z.object({ id: z.string() })).mutation(async ({ c, ctx, input }) => {
    rateLimit(`remind:${input.id}`, 3, 60 * 60_000)
    const campaign = await ctx.db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, input.id), eq(campaigns.companyId, ctx.session.companyId)),
    })
    if (!campaign) throw new HTTPException(404, { message: "Campanha não encontrada" })
    const sent = await sendCampaignReminder(ctx.db, campaign.id, appUrl(c.req.url))
    await audit(ctx.db, ctx.session, { action: "status", entity: "campanha", entityId: campaign.id, summary: `Lembrete da campanha “${campaign.name}” enviado (${sent} e-mails)` })
    return c.superjson({ sent })
  }),
  setStatus: editorProcedure
    .input(z.object({ id: z.string(), status: z.enum(["active", "closed"]) }))
    .mutation(async ({ c, ctx, input }) => {
      const [row] = await ctx.db
        .update(campaigns)
        .set({ status: input.status })
        .where(and(eq(campaigns.id, input.id), eq(campaigns.companyId, ctx.session.companyId)))
        .returning()
      if (row) {
        await audit(ctx.db, ctx.session, { action: "status", entity: "campanha", entityId: row.id, summary: `Campanha “${row.name}” ${input.status === "active" ? "reaberta" : "encerrada"}` })
      }
      return c.superjson({ ok: true })
    }),
})

export const insightsRouter = j.router({
  overview: privateProcedure
    .input(z.object({ campaignId: z.string().optional() }).optional())
    .query(async ({ c, ctx, input }) => {
      const campaignId = input?.campaignId ?? (await latestCampaignId(ctx.db, ctx.session.companyId))
      if (!campaignId) return c.superjson(null)
      return c.superjson(await computeInsights(ctx.db, ctx.session.companyId, campaignId))
    }),
  history: privateProcedure.query(async ({ c, ctx }) => {
    return c.superjson(await computeHistory(ctx.db, ctx.session.companyId))
  }),
  dimension: privateProcedure
    .input(z.object({ dimension: dimensionEnum, campaignId: z.string().optional() }))
    .query(async ({ c, ctx, input }) => {
      const campaignId = input.campaignId ?? (await latestCampaignId(ctx.db, ctx.session.companyId))
      if (!campaignId) return c.superjson(null)
      return c.superjson(await computeDimension(ctx.db, ctx.session.companyId, campaignId, input.dimension))
    }),
  portfolio: privateProcedure.query(async ({ c, ctx }) => {
    return c.superjson(await computePortfolio(ctx.db, ctx.session.userId))
  }),
})

const actionInput = z.object({
  dimension: dimensionEnum,
  what: z.string().trim().min(3, "Descreva a ação").max(300),
  why: z.string().max(500).default(""),
  sectorId: z.string().nullable().default(null),
  who: z.string().max(120).default(""),
  due: z.string().max(10).default(""),
  how: z.string().max(800).default(""),
  cost: z.string().max(60).default(""),
  status: z.enum(["todo", "doing", "done"]).default("todo"),
})

export const actionsRouter = j.router({
  list: privateProcedure.query(async ({ c, ctx }) => {
    const rows = await ctx.db
      .select()
      .from(actions)
      .where(eq(actions.companyId, ctx.session.companyId))
      .orderBy(desc(actions.createdAt))
    return c.superjson(rows)
  }),
  create: editorProcedure.input(actionInput).mutation(async ({ c, ctx, input }) => {
    const [row] = await ctx.db
      .insert(actions)
      .values({ ...input, companyId: ctx.session.companyId })
      .returning()
    await audit(ctx.db, ctx.session, { action: "create", entity: "ação", entityId: row!.id, summary: `Ação criada: ${row!.what}` })
    return c.superjson(row!)
  }),
  update: editorProcedure
    .input(actionInput.partial().extend({ id: z.string() }))
    .mutation(async ({ c, ctx, input }) => {
      const { id, ...data } = input
      const [row] = await ctx.db
        .update(actions)
        .set(data)
        .where(and(eq(actions.id, id), eq(actions.companyId, ctx.session.companyId)))
        .returning()
      if (row) {
        const onlyStatus = Object.keys(data).length === 1 && data.status
        await audit(ctx.db, ctx.session, {
          action: onlyStatus ? "status" : "update",
          entity: "ação",
          entityId: row.id,
          summary: onlyStatus ? `Ação movida para ${STATUS_LABEL[row.status]}: ${row.what}` : `Ação editada: ${row.what}`,
        })
      }
      return c.superjson({ ok: true })
    }),
  remove: editorProcedure.input(z.object({ id: z.string() })).mutation(async ({ c, ctx, input }) => {
    const [row] = await ctx.db
      .delete(actions)
      .where(and(eq(actions.id, input.id), eq(actions.companyId, ctx.session.companyId)))
      .returning()
    if (row) await audit(ctx.db, ctx.session, { action: "delete", entity: "ação", entityId: row.id, summary: `Ação excluída: ${row.what}` })
    return c.superjson({ ok: true })
  }),
  /** Gera ações sugeridas para as dimensões em risco alto ou crítico que ainda não têm ação. */
  suggest: editorProcedure.input(z.object({ campaignId: z.string() })).mutation(async ({ c, ctx, input }) => {
    const data = await computeInsights(ctx.db, ctx.session.companyId, input.campaignId)
    if (!data) throw new HTTPException(404, { message: "Campanha não encontrada" })
    const existing = await ctx.db
      .select({ what: actions.what })
      .from(actions)
      .where(eq(actions.companyId, ctx.session.companyId))
    const known = new Set(existing.map((e) => e.what))

    const toInsert = data.ranking
      .filter((r) => r.score >= 50)
      .flatMap((r) => {
        const worst = data.heatmap
          .filter((h) => !h.grouped)
          .sort((x, y) => (y.scores[r.id] ?? 0) - (x.scores[r.id] ?? 0))[0]
        return ACTION_LIBRARY[r.id]
          .filter((a) => !known.has(a.what))
          .slice(0, 2)
          .map((a) => ({
            companyId: ctx.session.companyId,
            campaignId: input.campaignId,
            dimension: r.id,
            what: a.what,
            how: a.how,
            why: `${r.name} com risco ${r.level === "critico" ? "crítico" : "alto"} (${r.score}/100).`,
            sectorId: worst?.key ?? null,
          }))
      })
    if (toInsert.length) {
      await ctx.db.insert(actions).values(toInsert)
      await audit(ctx.db, ctx.session, { action: "create", entity: "ação", summary: `${toInsert.length} ações sugeridas adicionadas ao plano` })
    }
    return c.superjson({ created: toInsert.length })
  }),
})

export const reportRouter = j.router({
  get: privateProcedure
    .input(z.object({ campaignId: z.string().optional() }).optional())
    .query(async ({ c, ctx, input }) => {
      return c.superjson(await buildReport(ctx.db, ctx.session.companyId, input?.campaignId))
    }),
})

export const channelAdminRouter = j.router({
  list: privateProcedure.query(async ({ c, ctx }) => {
    const rows = await ctx.db
      .select()
      .from(channelReports)
      .where(eq(channelReports.companyId, ctx.session.companyId))
      .orderBy(desc(channelReports.createdDay))
    return c.superjson(rows)
  }),
  setStatus: editorProcedure
    .input(z.object({ id: z.string(), status: z.enum(["received", "analyzing", "resolved"]) }))
    .mutation(async ({ c, ctx, input }) => {
      const [row] = await ctx.db
        .update(channelReports)
        .set({ status: input.status })
        .where(and(eq(channelReports.id, input.id), eq(channelReports.companyId, ctx.session.companyId)))
        .returning()
      if (row) await audit(ctx.db, ctx.session, { action: "status", entity: "relato", entityId: row.id, summary: `Relato ${row.protocol} atualizado` })
      return c.superjson({ ok: true })
    }),
})
