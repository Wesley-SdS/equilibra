import { and, desc, eq, getTableColumns, ne, sql } from "drizzle-orm"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import type { Db } from "../db"
import { actions, campaigns, channelMessages, channelReports, companies, customQuestions, questionnaireVersions, questionnaires, responses, sectors } from "../db/schema"
import { publicToken, today } from "../auth"
import { phaseOf } from "../campaigns"
import { stageOf } from "@/lib/deadline"
import { audit } from "../audit"
import { computeDimension, computeHistory, computeInsights, computePortfolio } from "../insights"
import { editorProcedure, j, privateProcedure } from "../jstack"
import { appUrl } from "../email"
import { sendCampaignReminder } from "../reminders"
import { buildReport } from "../report"
import { purgeFinishedContacts } from "../dispatch"
import { addMessage, attachmentInput, loadThread, messageBody } from "../channel-thread"
import { chooseActions, triagePriority } from "../decisions"
import { assertLimit, assertWritable } from "../billing"
import { rateLimit } from "../rate-limit"
import { latestVersion, resolveVersionForCampaign } from "../questionnaires"
import { DIMENSIONS, type DimensionId } from "@/lib/methodology"

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
    await assertLimit(ctx.db, ctx.session.companyId, "employees", input.headcount)
    const [row] = await ctx.db
      .insert(sectors)
      .values({ ...input, companyId: ctx.session.companyId })
      .returning()
    await audit(ctx.db, ctx.session, { action: "create", entity: "setor", entityId: row!.id, summary: `Setor ${row!.name} criado (${row!.headcount} pessoas)` })
    return c.superjson(row!)
  }),
  update: editorProcedure.input(sectorInput.extend({ id: z.string() })).mutation(async ({ c, ctx, input }) => {
    const { id, ...data } = input
    const current = await ctx.db.query.sectors.findFirst({ where: and(eq(sectors.id, id), eq(sectors.companyId, ctx.session.companyId)) })
    await assertLimit(ctx.db, ctx.session.companyId, "employees", data.headcount - (current?.headcount ?? 0))
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
  questionnaireVersionId: campaigns.questionnaireVersionId,
  questionnaire: {
    id: questionnaires.id,
    name: questionnaires.name,
    kind: questionnaires.kind,
    anonymous: questionnaires.anonymous,
    version: questionnaireVersions.version,
    itemCount: sql<number>`jsonb_array_length(${questionnaireVersions.items})::int`,
  },
}

/** Campanhas com o questionário aplicado (versão + questionário). */
const campaignRows = (db: Db) =>
  db
    .select(campaignSelect)
    .from(campaigns)
    .innerJoin(questionnaireVersions, eq(questionnaireVersions.id, campaigns.questionnaireVersionId))
    .innerJoin(questionnaires, eq(questionnaires.id, questionnaireVersions.questionnaireId))

export const campaignsRouter = j.router({
  list: privateProcedure.query(async ({ c, ctx }) => {
    const rows = await campaignRows(ctx.db).where(eq(campaigns.companyId, ctx.session.companyId)).orderBy(desc(campaigns.createdAt))
    return c.superjson(rows.map((r) => ({ ...r, phase: phaseOf(r) })))
  }),
  get: privateProcedure.input(z.object({ id: z.string() })).query(async ({ c, ctx, input }) => {
    const [row] = await campaignRows(ctx.db).where(and(eq(campaigns.id, input.id), eq(campaigns.companyId, ctx.session.companyId)))
    if (!row) throw new HTTPException(404, { message: "Campanha não encontrada" })
    const company = await ctx.db.query.companies.findFirst({ where: eq(companies.id, ctx.session.companyId) })
    return c.superjson({ ...row, phase: phaseOf(row), companyName: company!.name })
  }),
  create: editorProcedure
    .input(
      z
        .object({
          name: z.string().trim().min(2, "Dê um nome à campanha").max(80),
          startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
          endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
          // Questionário da biblioteca; sem ele, o NR-1 padrão.
          questionnaireId: z.string().optional(),
        })
        .refine((v) => v.endsAt >= v.startsAt, { message: "O fim deve ser depois do início", path: ["endsAt"] })
    )
    .mutation(async ({ c, ctx, input }) => {
      const { questionnaireId, ...data } = input
      const chosen = await resolveVersionForCampaign(ctx.db, ctx.session.companyId, questionnaireId)
      const hasSectors = await ctx.db.query.sectors.findFirst({
        where: eq(sectors.companyId, ctx.session.companyId),
      })
      if (!hasSectors) throw new HTTPException(400, { message: "Cadastre ao menos um setor antes" })
      await assertLimit(ctx.db, ctx.session.companyId, "campaignsPerYear", 1)
      const extra = await ctx.db
        .select({ id: customQuestions.id, text: customQuestions.text })
        .from(customQuestions)
        .where(and(eq(customQuestions.companyId, ctx.session.companyId), eq(customQuestions.active, true)))
        .orderBy(customQuestions.position, customQuestions.createdAt)
      const [row] = await ctx.db
        .insert(campaigns)
        .values({
          ...data,
          companyId: ctx.session.companyId,
          token: publicToken(),
          questionnaireVersionId: chosen.version.id,
          customQuestions: extra.map((q) => ({ id: `c:${q.id}`, text: q.text })),
        })
        .returning()
      await audit(ctx.db, ctx.session, { action: "create", entity: "campanha", entityId: row!.id, summary: `Campanha “${row!.name}” criada com o questionário “${chosen.questionnaire.name}” (v${chosen.version.version})` })
      return c.superjson(row!)
    }),
  /** Edita nome e datas (agendar, adiar ou estender o prazo). O link e as respostas não mudam. */
  update: editorProcedure
    .input(
      z
        .object({
          id: z.string(),
          name: z.string().trim().min(2, "Dê um nome à campanha").max(80),
          startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
          endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
        })
        .refine((v) => v.endsAt >= v.startsAt, { message: "O fim deve ser depois do início", path: ["endsAt"] })
    )
    .mutation(async ({ c, ctx, input }) => {
      const where = and(eq(campaigns.id, input.id), eq(campaigns.companyId, ctx.session.companyId))
      const current = await ctx.db.query.campaigns.findFirst({ where })
      if (!current) throw new HTTPException(404, { message: "Campanha não encontrada" })
      // Campanha encerrada que ganha um prazo futuro volta a ser aberta/agendada: exige plano ativo.
      const reopens = current.status === "closed" && input.endsAt >= today()
      if (reopens) await assertWritable(ctx.db, ctx.session.companyId)
      const [row] = await ctx.db
        .update(campaigns)
        .set({ name: input.name, startsAt: input.startsAt, endsAt: input.endsAt, ...(reopens ? { status: "active" as const } : {}), lastReminderAt: null })
        .where(where)
        .returning()
      await audit(ctx.db, ctx.session, {
        action: "update",
        entity: "campanha",
        entityId: row!.id,
        summary: `Campanha “${row!.name}” editada (${current.startsAt} a ${current.endsAt} → ${row!.startsAt} a ${row!.endsAt})${reopens ? " e reaberta" : ""}`,
      })
      return c.superjson(row!)
    }),
  /** Nova campanha com o mesmo nome e duração, já com o link novo e as perguntas atuais da empresa. */
  duplicate: editorProcedure
    .input(z.object({ id: z.string(), startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }))
    .mutation(async ({ c, ctx, input }) => {
      const source = await ctx.db.query.campaigns.findFirst({
        where: and(eq(campaigns.id, input.id), eq(campaigns.companyId, ctx.session.companyId)),
      })
      if (!source) throw new HTTPException(404, { message: "Campanha não encontrada" })
      await assertLimit(ctx.db, ctx.session.companyId, "campaignsPerYear", 1)
      const extra = await ctx.db
        .select({ id: customQuestions.id, text: customQuestions.text })
        .from(customQuestions)
        .where(and(eq(customQuestions.companyId, ctx.session.companyId), eq(customQuestions.active, true)))
        .orderBy(customQuestions.position, customQuestions.createdAt)
      // A cópia usa a versão mais recente do mesmo questionário.
      const sourceVersion = await ctx.db.query.questionnaireVersions.findFirst({ where: eq(questionnaireVersions.id, source.questionnaireVersionId) })
      const version = sourceVersion ? await latestVersion(ctx.db, sourceVersion.questionnaireId) : null
      if (!version) throw new HTTPException(400, { message: "O questionário desta campanha não existe mais." })
      const days = Math.max(0, Math.round((Date.parse(`${source.endsAt}T00:00:00Z`) - Date.parse(`${source.startsAt}T00:00:00Z`)) / 86_400_000))
      const startsAt = input.startsAt ?? today()
      const endsAt = new Date(Date.parse(`${startsAt}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
      const [row] = await ctx.db
        .insert(campaigns)
        .values({
          companyId: ctx.session.companyId,
          name: `${source.name} (cópia)`.slice(0, 80),
          token: publicToken(),
          startsAt,
          endsAt,
          questionnaireVersionId: version.id,
          customQuestions: extra.map((q) => ({ id: `c:${q.id}`, text: q.text })),
        })
        .returning()
      await audit(ctx.db, ctx.session, { action: "create", entity: "campanha", entityId: row!.id, summary: `Campanha “${row!.name}” criada a partir de “${source.name}”` })
      return c.superjson({ ...row!, phase: phaseOf(row!) })
    }),
  /** Envia agora o lembrete com a taxa de resposta para donos e admins. */
  remind: editorProcedure.input(z.object({ id: z.string() })).mutation(async ({ c, ctx, input }) => {
    await rateLimit(`remind:${input.id}`, 3, 60 * 60_000)
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
      if (input.status === "active") {
        await assertWritable(ctx.db, ctx.session.companyId)
        const current = await ctx.db.query.campaigns.findFirst({ where: and(eq(campaigns.id, input.id), eq(campaigns.companyId, ctx.session.companyId)) })
        if (current && current.endsAt < today()) throw new HTTPException(400, { message: "O prazo desta campanha já passou. Edite a data de encerramento para reabri-la." })
      }
      const [row] = await ctx.db
        .update(campaigns)
        .set({ status: input.status })
        .where(and(eq(campaigns.id, input.id), eq(campaigns.companyId, ctx.session.companyId)))
        .returning()
      if (row) {
        if (input.status === "closed") await purgeFinishedContacts(ctx.db, ctx.session.companyId)
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
  /** Quantas ações abertas estão atrasadas ou vencendo (indicador do menu). */
  deadlines: privateProcedure.query(async ({ c, ctx }) => {
    const rows = await ctx.db
      .select({ status: actions.status, due: actions.due })
      .from(actions)
      .where(and(eq(actions.companyId, ctx.session.companyId), ne(actions.status, "done")))
    const stages = rows.map((r) => stageOf(r))
    return c.superjson({ overdue: stages.filter((s) => s === "overdue").length, soon: stages.filter((s) => s === "soon").length })
  }),
  create: editorProcedure.input(actionInput).mutation(async ({ c, ctx, input }) => {
    await assertWritable(ctx.db, ctx.session.companyId)
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
        // Mudou o prazo ou o andamento: o próximo cron volta a avaliar a ação do zero.
        .set(data.due !== undefined || data.status !== undefined ? { ...data, notifiedStage: "", notifiedAt: null } : data)
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
    await assertWritable(ctx.db, ctx.session.companyId)
    const data = await computeInsights(ctx.db, ctx.session.companyId, input.campaignId)
    if (!data) throw new HTTPException(404, { message: "Campanha não encontrada" })
    const existing = await ctx.db
      .select({ what: actions.what })
      .from(actions)
      .where(eq(actions.companyId, ctx.session.companyId))
    const known = new Set(existing.map((e) => e.what))

    // Para cada dimensão em alerta, o Jev escolhe as medidas da biblioteca que melhor
    // se encaixam no contexto (setores e itens mais críticos). Sem Jev: ordem da biblioteca.
    const alerts = data.ranking.filter((r) => r.score >= 50)
    const perDimension = await Promise.all(
      alerts.map(async (r) => {
        const sectorsByRisk = data.heatmap
          .filter((h) => !h.grouped)
          .map((h) => ({ key: h.key, label: h.label, score: h.scores[r.id] ?? 0 }))
          .sort((x, y) => y.score - x.score)
        const detail = await computeDimension(ctx.db, ctx.session.companyId, input.campaignId, r.id)
        const chosen = await chooseActions({
          dimension: r.id,
          score: r.score,
          worstSectors: sectorsByRisk.slice(0, 3).map(({ label, score }) => ({ label, score })),
          worstItems: (detail?.items ?? []).filter((i) => i.risk >= 50).map((i) => i.text),
          existing: [...known],
        })
        return chosen.map((a) => ({
          companyId: ctx.session.companyId,
          campaignId: input.campaignId,
          dimension: r.id,
          what: a.what,
          how: a.how,
          why: `${r.name} com risco ${r.level === "critico" ? "crítico" : "alto"} (${r.score}/100).`,
          sectorId: sectorsByRisk[0]?.key ?? null,
          decision: a.decision,
        }))
      })
    )
    const toInsert = perDimension.flat()
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
      .select({
        ...getTableColumns(channelReports),
        // Colunas qualificadas à mão: em select de uma tabela só o Drizzle omite o prefixo e o `id` viraria o da mensagem.
        unread: sql<boolean>`exists (select 1 from ${channelMessages} m where m.report_id = channel_reports.id and m.author = 'reporter' and m.seq > channel_reports.hr_seen_seq)`,
        messageCount: sql<number>`(select count(*)::int from ${channelMessages} m where m.report_id = channel_reports.id and m.author <> 'note')`,
      })
      .from(channelReports)
      .where(eq(channelReports.companyId, ctx.session.companyId))
      .orderBy(desc(channelReports.createdDay))
    // Fila do RH: abertos primeiro, depois por prioridade da triagem (gravidade + urgência).
    const withPriority = rows.map((r) => ({ ...r, priority: triagePriority(r.triage) }))
    withPriority.sort(
      (a, b) => Number(a.status === "resolved") - Number(b.status === "resolved") || Number(b.unread) - Number(a.unread) || b.priority - a.priority
    )
    return c.superjson(withPriority)
  }),
  /** Relatos com mensagem nova do autor ainda não vista (para o indicador do menu). */
  unreadCount: privateProcedure.query(async ({ c, ctx }) => {
    const [row] = (await ctx.db
      .select({
        n: sql<number>`count(*)::int`,
      })
      .from(channelReports)
      .where(
        and(
          eq(channelReports.companyId, ctx.session.companyId),
          sql`exists (select 1 from ${channelMessages} m where m.report_id = ${channelReports.id} and m.author = 'reporter' and m.seq > ${channelReports.hrSeenSeq})`
        )
      )) as { n: number }[]
    return c.superjson({ n: row?.n ?? 0 })
  }),

  /** Conversa completa (com notas internas). Abrir a conversa marca as mensagens do autor como vistas. */
  thread: privateProcedure.input(z.object({ reportId: z.string() })).query(async ({ c, ctx, input }) => {
    const report = await ctx.db.query.channelReports.findFirst({
      where: and(eq(channelReports.id, input.reportId), eq(channelReports.companyId, ctx.session.companyId)),
    })
    if (!report) throw new HTTPException(404, { message: "Relato não encontrado" })
    const messages = await loadThread(ctx.db, report.id, true)
    const lastReporter = Math.max(0, ...messages.filter((m) => m.author === "reporter").map((m) => m.seq))
    if (lastReporter > report.hrSeenSeq) await ctx.db.update(channelReports).set({ hrSeenSeq: lastReporter }).where(eq(channelReports.id, report.id))
    return c.superjson({ protocol: report.protocol, status: report.status, messages })
  }),

  /** Resposta ao autor (visível a ele) ou nota interna (só RH). Responder move "Recebido" para "Em análise". */
  reply: editorProcedure
    .input(z.object({ reportId: z.string(), body: messageBody, internal: z.boolean().default(false), attachments: z.array(attachmentInput).max(3).default([]) }))
    .mutation(async ({ c, ctx, input }) => {
      await assertWritable(ctx.db, ctx.session.companyId)
      const report = await ctx.db.query.channelReports.findFirst({
        where: and(eq(channelReports.id, input.reportId), eq(channelReports.companyId, ctx.session.companyId)),
      })
      if (!report) throw new HTTPException(404, { message: "Relato não encontrado" })
      await addMessage(ctx.db, report.id, input.internal ? "note" : "hr", input.body, input.attachments)
      if (!input.internal && report.status === "received") await ctx.db.update(channelReports).set({ status: "analyzing" }).where(eq(channelReports.id, report.id))
      // Auditoria sem o conteúdo da mensagem: ela pode conter dados sensíveis.
      await audit(ctx.db, ctx.session, {
        action: "create",
        entity: "relato",
        entityId: report.id,
        summary: `${input.internal ? "Nota interna" : "Resposta ao autor"} no relato ${report.protocol}${input.attachments.length ? ` (${input.attachments.length} imagem(ns))` : ""}`,
      })
      return c.superjson({ ok: true })
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
