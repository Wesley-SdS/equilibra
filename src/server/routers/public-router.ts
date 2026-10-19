import { and, eq } from "drizzle-orm"
import { getCookie, setCookie } from "hono/cookie"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { answers, campaigns, channelReports, companies, responses, sectors } from "../db/schema"
import { protocolCode, today } from "../auth"
import { j, publicProcedure } from "../jstack"
import { clientIp, rateLimit } from "../rate-limit"
import { addMessage, attachmentInput, loadThread, messageBody, retriageAfterReply } from "../channel-thread"
import { triageReport } from "../decisions"
import { entitlements } from "../billing"
import { loadCampaignQuestionnaire } from "../questionnaires"
import { DIMENSIONS } from "@/lib/methodology"

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
    const q = await loadCampaignQuestionnaire(ctx.db, campaign.questionnaireVersionId)
    // Itens da versão aplicada + perguntas da empresa copiadas na campanha, na ordem de resposta.
    const items = [
      ...q.items.map((i) => ({ id: i.id, text: i.text, label: DIMENSIONS.find((d) => d.id === i.dimension)?.name ?? q.name })),
      ...(campaign.customQuestions ?? []).map((i) => ({ id: i.id, text: i.text, label: "Perguntas da empresa" })),
    ]
    return c.superjson({
      campaign: { name: campaign.name, startsAt: campaign.startsAt, endsAt: campaign.endsAt, isOpen },
      questionnaire: { name: q.name, kind: q.kind, anonymous: q.anonymous },
      items,
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
        answers: z.array(z.object({ questionId: z.string(), value: z.number().int().min(1).max(5) })).min(1).max(200),
      })
    )
    .mutation(async ({ c, ctx, input }) => {
      await rateLimit(`survey:${input.token}`, 600, 60_000)
      const campaign = await ctx.db.query.campaigns.findFirst({ where: eq(campaigns.token, input.token) })
      if (!campaign) throw new HTTPException(404, { message: "Link de avaliação inválido" })
      if (campaign.status !== "active" || today() > campaign.endsAt) throw new HTTPException(410, { message: "Esta avaliação foi encerrada" })
      if (today() < campaign.startsAt) throw new HTTPException(425, { message: "Esta avaliação ainda não começou" })
      if (getCookie(c, `eq_r_${campaign.id}`) === "1") {
        throw new HTTPException(409, { message: "Você já respondeu esta avaliação neste dispositivo" })
      }
      const sector = await ctx.db.query.sectors.findFirst({
        where: and(eq(sectors.id, input.sectorId), eq(sectors.companyId, campaign.companyId)),
      })
      if (!sector) throw new HTTPException(400, { message: "Setor inválido" })
      // Exige exatamente os itens da versão aplicada + as perguntas da empresa desta campanha.
      const version = await loadCampaignQuestionnaire(ctx.db, campaign.questionnaireVersionId)
      const expected = new Set([...version.items.map((q) => q.id), ...(campaign.customQuestions ?? []).map((q) => q.id)])
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
      await rateLimit(`channel:${input.slug}`, 30, 60_000)
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

  /**
   * Conversa do autor do relato. O protocolo funciona como chave de acesso (cerca de 40 bits):
   * por isso as consultas têm limite por IP e por protocolo. Notas internas do RH nunca aparecem.
   */
  thread: publicProcedure.input(z.object({ protocol: z.string().trim().min(6).max(20) })).query(async ({ c, ctx, input }) => {
    await rateLimit(`thread:ip:${clientIp(c.req.raw.headers)}`, 60, 15 * 60_000)
    const protocol = input.protocol.toUpperCase()
    await rateLimit(`thread:${protocol}`, 120, 15 * 60_000)
    const report = await ctx.db.query.channelReports.findFirst({ where: eq(channelReports.protocol, protocol) })
    if (!report) throw new HTTPException(404, { message: "Protocolo não encontrado" })
    return c.superjson({
      protocol: report.protocol,
      status: report.status,
      createdDay: report.createdDay,
      category: report.category,
      messages: await loadThread(ctx.db, report.id, false),
    })
  }),

  /** Mensagem de acompanhamento do autor (texto e até 3 imagens). Reabre relatos resolvidos. */
  reply: publicProcedure
    .input(z.object({ protocol: z.string().trim().min(6).max(20), body: messageBody, attachments: z.array(attachmentInput).max(3).default([]) }))
    .mutation(async ({ c, ctx, input }) => {
      await rateLimit(`reply:ip:${clientIp(c.req.raw.headers)}`, 20, 60 * 60_000)
      const protocol = input.protocol.toUpperCase()
      await rateLimit(`reply:${protocol}`, 15, 60 * 60_000)
      const report = await ctx.db.query.channelReports.findFirst({ where: eq(channelReports.protocol, protocol) })
      if (!report) throw new HTTPException(404, { message: "Protocolo não encontrado" })
      await addMessage(ctx.db, report.id, "reporter", input.body, input.attachments)
      if (report.status === "resolved") await ctx.db.update(channelReports).set({ status: "analyzing" }).where(eq(channelReports.id, report.id))
      await retriageAfterReply(ctx.db, report, input.body)
      return c.superjson({ ok: true })
    }),
})
