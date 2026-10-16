import { and, eq } from "drizzle-orm"
import { getCookie, setCookie } from "hono/cookie"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { answers, campaigns, channelReports, companies, responses, sectors } from "../db/schema"
import { protocolCode, today } from "../auth"
import { j, publicProcedure } from "../jstack"
import { rateLimit } from "../rate-limit"
import { triageReport } from "../decisions"
import { entitlements } from "../billing"
import { QUESTIONS } from "@/lib/methodology"

const questionIds = new Set(QUESTIONS.map((q) => q.id))

export const surveyRouter = j.router({
  byToken: publicProcedure.input(z.object({ token: z.string().min(10) })).query(async ({ c, ctx, input }) => {
    const campaign = await ctx.db.query.campaigns.findFirst({ where: eq(campaigns.token, input.token) })
    if (!campaign) throw new HTTPException(404, { message: "Link de avaliação inválido" })
    const company = await ctx.db.query.companies.findFirst({ where: eq(companies.id, campaign.companyId) })
    const sectorList = await ctx.db
      .select({ id: sectors.id, name: sectors.name })
      .from(sectors)
      .where(eq(sectors.companyId, campaign.companyId))
      .orderBy(sectors.name)
    const isOpen = campaign.status === "active" && today() >= campaign.startsAt && today() <= campaign.endsAt
    return c.superjson({
      campaign: { name: campaign.name, endsAt: campaign.endsAt, isOpen },
      companyName: company?.name ?? "",
      sectors: sectorList,
      alreadyAnswered: getCookie(c, `eq_r_${campaign.id}`) === "1",
      customQuestions: campaign.customQuestions ?? [],
    })
  }),

  submit: publicProcedure
    .input(
      z.object({
        token: z.string().min(10),
        sectorId: z.string(),
        answers: z
          .array(z.object({ questionId: z.string(), value: z.number().int().min(1).max(5) }))
          .min(QUESTIONS.length)
          .max(QUESTIONS.length + 20),
      })
    )
    .mutation(async ({ c, ctx, input }) => {
      rateLimit(`survey:${input.token}`, 600, 60_000)
      const campaign = await ctx.db.query.campaigns.findFirst({ where: eq(campaigns.token, input.token) })
      if (!campaign) throw new HTTPException(404, { message: "Link de avaliação inválido" })
      if (campaign.status !== "active") throw new HTTPException(410, { message: "Esta avaliação foi encerrada" })
      if (getCookie(c, `eq_r_${campaign.id}`) === "1") {
        throw new HTTPException(409, { message: "Você já respondeu esta avaliação neste dispositivo" })
      }
      const sector = await ctx.db.query.sectors.findFirst({
        where: and(eq(sectors.id, input.sectorId), eq(sectors.companyId, campaign.companyId)),
      })
      if (!sector) throw new HTTPException(400, { message: "Setor inválido" })
      // Exige exatamente as 28 perguntas padrão + as perguntas da empresa desta campanha.
      const expected = new Set([...questionIds, ...(campaign.customQuestions ?? []).map((q) => q.id)])
      const ids = new Set(input.answers.map((a) => a.questionId))
      if (ids.size !== input.answers.length || ids.size !== expected.size || [...ids].some((id) => !expected.has(id))) {
        throw new HTTPException(422, { message: "Respostas incompletas" })
      }

      await ctx.db.transaction(async (tx) => {
        const [r] = await tx
          .insert(responses)
          .values({ campaignId: campaign.id, sectorId: sector.id, createdDay: today() })
          .returning()
        await tx.insert(answers).values(input.answers.map((a) => ({ ...a, responseId: r!.id })))
      })

      setCookie(c, `eq_r_${campaign.id}`, "1", {
        httpOnly: true,
        sameSite: "Lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 120,
      })
      return c.superjson({ ok: true })
    }),
})

export const channelRouter = j.router({
  company: publicProcedure.input(z.object({ slug: z.string() })).query(async ({ c, ctx, input }) => {
    const company = await ctx.db.query.companies.findFirst({ where: eq(companies.slug, input.slug) })
    if (!company) throw new HTTPException(404, { message: "Canal não encontrado" })
    return c.superjson({ name: company.name })
  }),
  submit: publicProcedure
    .input(
      z.object({
        slug: z.string(),
        category: z.enum(["assedio_moral", "assedio_sexual", "discriminacao", "sobrecarga", "conflito", "outro"]),
        body: z.string().trim().min(20, "Descreva com pelo menos 20 caracteres").max(5000),
      })
    )
    .mutation(async ({ c, ctx, input }) => {
      rateLimit(`channel:${input.slug}`, 30, 60_000)
      const company = await ctx.db.query.companies.findFirst({ where: eq(companies.slug, input.slug) })
      if (!company) throw new HTTPException(404, { message: "Canal não encontrado" })
      if (!entitlements(company).limits.channel) throw new HTTPException(403, { message: "O canal de relato não está ativo para esta empresa." })
      const protocol = protocolCode()
      // Triagem automática (Jev): gravidade, urgência e se o texto identifica pessoas.
      const triage = await triageReport(input.body, input.category)
      await ctx.db.insert(channelReports).values({
        companyId: company.id,
        protocol,
        category: input.category,
        body: input.body,
        createdDay: today(),
        triage,
      })
      return c.superjson({ protocol })
    }),
  status: publicProcedure.input(z.object({ protocol: z.string() })).query(async ({ c, ctx, input }) => {
    const row = await ctx.db.query.channelReports.findFirst({
      where: eq(channelReports.protocol, input.protocol.trim().toUpperCase()),
    })
    if (!row) throw new HTTPException(404, { message: "Protocolo não encontrado" })
    return c.superjson({ status: row.status, createdDay: row.createdDay, category: row.category })
  }),
})
