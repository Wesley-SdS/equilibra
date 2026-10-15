import { and, desc, eq, sql } from "drizzle-orm"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { actions, campaigns, channelReports, companies, responses, sectors } from "../db/schema"
import { publicToken } from "../auth"
import { computeInsights } from "../insights"
import { j, privateProcedure } from "../jstack"
import { ACTION_LIBRARY, DIMENSIONS, type DimensionId } from "@/lib/methodology"

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
  create: privateProcedure.input(sectorInput).mutation(async ({ c, ctx, input }) => {
    const [row] = await ctx.db
      .insert(sectors)
      .values({ ...input, companyId: ctx.session.companyId })
      .returning()
    return c.superjson(row!)
  }),
  update: privateProcedure
    .input(sectorInput.extend({ id: z.string() }))
    .mutation(async ({ c, ctx, input }) => {
      const { id, ...data } = input
      await ctx.db
        .update(sectors)
        .set(data)
        .where(and(eq(sectors.id, id), eq(sectors.companyId, ctx.session.companyId)))
      return c.superjson({ ok: true })
    }),
  remove: privateProcedure.input(z.object({ id: z.string() })).mutation(async ({ c, ctx, input }) => {
    await ctx.db
      .delete(sectors)
      .where(and(eq(sectors.id, input.id), eq(sectors.companyId, ctx.session.companyId)))
    return c.superjson({ ok: true })
  }),
})

export const campaignsRouter = j.router({
  list: privateProcedure.query(async ({ c, ctx }) => {
    const rows = await ctx.db
      .select({
        id: campaigns.id,
        name: campaigns.name,
        token: campaigns.token,
        status: campaigns.status,
        startsAt: campaigns.startsAt,
        endsAt: campaigns.endsAt,
        createdAt: campaigns.createdAt,
        responses: sql<number>`(select count(*)::int from ${responses} where ${responses.campaignId} = ${campaigns.id})`,
      })
      .from(campaigns)
      .where(eq(campaigns.companyId, ctx.session.companyId))
      .orderBy(desc(campaigns.createdAt))
    return c.superjson(rows)
  }),
  create: privateProcedure
    .input(
      z
        .object({
          name: z.string().trim().min(2, "Dê um nome à campanha").max(80),
          startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
        .refine((v) => v.endsAt >= v.startsAt, { message: "O fim deve ser depois do início", path: ["endsAt"] })
    )
    .mutation(async ({ c, ctx, input }) => {
      const hasSectors = await ctx.db.query.sectors.findFirst({
        where: eq(sectors.companyId, ctx.session.companyId),
      })
      if (!hasSectors) throw new HTTPException(400, { message: "Cadastre ao menos um setor antes" })
      const [row] = await ctx.db
        .insert(campaigns)
        .values({ ...input, companyId: ctx.session.companyId, token: publicToken() })
        .returning()
      return c.superjson(row!)
    }),
  setStatus: privateProcedure
    .input(z.object({ id: z.string(), status: z.enum(["active", "closed"]) }))
    .mutation(async ({ c, ctx, input }) => {
      await ctx.db
        .update(campaigns)
        .set({ status: input.status })
        .where(and(eq(campaigns.id, input.id), eq(campaigns.companyId, ctx.session.companyId)))
      return c.superjson({ ok: true })
    }),
})

export const insightsRouter = j.router({
  overview: privateProcedure
    .input(z.object({ campaignId: z.string().optional() }).optional())
    .query(async ({ c, ctx, input }) => {
      let campaignId = input?.campaignId
      if (!campaignId) {
        const latest = await ctx.db.query.campaigns.findFirst({
          where: eq(campaigns.companyId, ctx.session.companyId),
          orderBy: desc(campaigns.createdAt),
        })
        if (!latest) return c.superjson(null)
        campaignId = latest.id
      }
      const data = await computeInsights(ctx.db, ctx.session.companyId, campaignId)
      return c.superjson(data)
    }),
})

const actionInput = z.object({
  dimension: z.enum(DIMENSIONS.map((d) => d.id) as [DimensionId, ...DimensionId[]]),
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
  create: privateProcedure.input(actionInput).mutation(async ({ c, ctx, input }) => {
    const [row] = await ctx.db
      .insert(actions)
      .values({ ...input, companyId: ctx.session.companyId })
      .returning()
    return c.superjson(row!)
  }),
  update: privateProcedure
    .input(actionInput.partial().extend({ id: z.string() }))
    .mutation(async ({ c, ctx, input }) => {
      const { id, ...data } = input
      await ctx.db
        .update(actions)
        .set(data)
        .where(and(eq(actions.id, id), eq(actions.companyId, ctx.session.companyId)))
      return c.superjson({ ok: true })
    }),
  remove: privateProcedure.input(z.object({ id: z.string() })).mutation(async ({ c, ctx, input }) => {
    await ctx.db
      .delete(actions)
      .where(and(eq(actions.id, input.id), eq(actions.companyId, ctx.session.companyId)))
    return c.superjson({ ok: true })
  }),
  /** Gera ações sugeridas para as dimensões em risco alto ou crítico que ainda não têm ação. */
  suggest: privateProcedure
    .input(z.object({ campaignId: z.string() }))
    .mutation(async ({ c, ctx, input }) => {
      const data = await computeInsights(ctx.db, ctx.session.companyId, input.campaignId)
      if (!data) throw new HTTPException(404, { message: "Campanha não encontrada" })
      const existing = await ctx.db
        .select({ what: actions.what })
        .from(actions)
        .where(eq(actions.companyId, ctx.session.companyId))
      const known = new Set(existing.map((e) => e.what))

      const toInsert = data.ranking
        .filter((r) => r.score >= 50)
        .flatMap((r) =>
          ACTION_LIBRARY[r.id]
            .filter((a) => !known.has(a.what))
            .slice(0, 2)
            .map((a) => {
              const worst = data.heatmap
                .filter((h) => !h.grouped)
                .sort((x, y) => (y.scores[r.id] ?? 0) - (x.scores[r.id] ?? 0))[0]
              return {
                companyId: ctx.session.companyId,
                campaignId: input.campaignId,
                dimension: r.id,
                what: a.what,
                how: a.how,
                why: `${r.name} com risco ${r.level === "critico" ? "crítico" : "alto"} (${r.score}/100).`,
                sectorId: worst?.key ?? null,
              }
            })
        )
      if (toInsert.length) await ctx.db.insert(actions).values(toInsert)
      return c.superjson({ created: toInsert.length })
    }),
})

export const reportRouter = j.router({
  get: privateProcedure
    .input(z.object({ campaignId: z.string().optional() }).optional())
    .query(async ({ c, ctx, input }) => {
      const company = await ctx.db.query.companies.findFirst({
        where: eq(companies.id, ctx.session.companyId),
      })
      let campaignId = input?.campaignId
      if (!campaignId) {
        const latest = await ctx.db.query.campaigns.findFirst({
          where: eq(campaigns.companyId, ctx.session.companyId),
          orderBy: desc(campaigns.createdAt),
        })
        campaignId = latest?.id
      }
      const insights = campaignId ? await computeInsights(ctx.db, ctx.session.companyId, campaignId) : null
      const plan = await ctx.db.select().from(actions).where(eq(actions.companyId, ctx.session.companyId))
      const sectorList = await ctx.db.select().from(sectors).where(eq(sectors.companyId, ctx.session.companyId))
      return c.superjson({ company: company!, insights, plan, sectors: sectorList })
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
  setStatus: privateProcedure
    .input(z.object({ id: z.string(), status: z.enum(["received", "analyzing", "resolved"]) }))
    .mutation(async ({ c, ctx, input }) => {
      await ctx.db
        .update(channelReports)
        .set({ status: input.status })
        .where(and(eq(channelReports.id, input.id), eq(channelReports.companyId, ctx.session.companyId)))
      return c.superjson({ ok: true })
    }),
})
