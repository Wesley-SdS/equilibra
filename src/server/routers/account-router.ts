import { and, asc, eq, inArray, ne } from "drizzle-orm"
import { deleteCookie, setCookie } from "hono/cookie"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import {
  actions,
  answers,
  auditLog,
  campaigns,
  channelMessages,
  channelReports,
  companies,
  customQuestions,
  employees,
  memberships,
  questionnaireVersions,
  questionnaires,
  responses,
  sectors,
  users,
} from "../db/schema"
import { SESSION_COOKIE, createSessionToken } from "../auth"
import { j, ownerProcedure, privateProcedure } from "../jstack"
import { LEGAL_VERSION } from "@/lib/legal"

/** Direitos do titular e encerramento: portabilidade (art. 18, V) e eliminação (arts. 16 e 18, VI). */
export const accountRouter = j.router({
  /** Exporta todos os dados da empresa ativa em JSON estruturado (portabilidade). */
  exportData: ownerProcedure.query(async ({ c, ctx }) => {
    const companyId = ctx.session.companyId
    const company = await ctx.db.query.companies.findFirst({ where: eq(companies.id, companyId) })
    const campaignRows = await ctx.db.select().from(campaigns).where(eq(campaigns.companyId, companyId))
    const responseRows = campaignRows.length
      ? await ctx.db.select().from(responses).where(inArray(responses.campaignId, campaignRows.map((r) => r.id)))
      : []
    const answerRows = responseRows.length
      ? await ctx.db.select().from(answers).where(inArray(answers.responseId, responseRows.map((r) => r.id)))
      : []
    const team = await ctx.db
      .select({ name: users.name, email: users.email, role: memberships.role, since: memberships.createdAt })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.companyId, companyId))
    const answersByResponse = new Map<string, { questionId: string; value: number }[]>()
    for (const a of answerRows) {
      const list = answersByResponse.get(a.responseId) ?? []
      list.push({ questionId: a.questionId, value: a.value })
      answersByResponse.set(a.responseId, list)
    }
    return c.superjson({
      exportedAt: new Date().toISOString(),
      format: "equilibra-export/v1",
      legalVersion: LEGAL_VERSION,
      company: company && {
        name: company.name,
        cnpj: company.cnpj,
        employees: company.employees,
        plan: company.plan,
        subscriptionStatus: company.subscriptionStatus,
        createdAt: company.createdAt,
      },
      team,
      sectors: await ctx.db.select({ id: sectors.id, name: sectors.name, headcount: sectors.headcount }).from(sectors).where(eq(sectors.companyId, companyId)),
      customQuestions: await ctx.db.select({ id: customQuestions.id, text: customQuestions.text, active: customQuestions.active }).from(customQuestions).where(eq(customQuestions.companyId, companyId)),
      people: await ctx.db.select({ id: employees.id, name: employees.name, email: employees.email, phone: employees.phone, sectorId: employees.sectorId, active: employees.active }).from(employees).where(eq(employees.companyId, companyId)),
      questionnaires: await ctx.db
        .select({ id: questionnaires.id, name: questionnaires.name, kind: questionnaires.kind, anonymous: questionnaires.anonymous, status: questionnaires.status, version: questionnaireVersions.version, items: questionnaireVersions.items })
        .from(questionnaires)
        .innerJoin(questionnaireVersions, eq(questionnaireVersions.questionnaireId, questionnaires.id))
        .where(eq(questionnaires.companyId, companyId)),
      campaigns: campaignRows.map((cp) => ({
        id: cp.id,
        name: cp.name,
        status: cp.status,
        startsAt: cp.startsAt,
        endsAt: cp.endsAt,
        customQuestions: cp.customQuestions,
        questionnaireVersionId: cp.questionnaireVersionId,
        responses: responseRows
          .filter((r) => r.campaignId === cp.id)
          .map((r) => ({ sectorId: r.sectorId, day: r.createdDay, answers: answersByResponse.get(r.id) ?? [] })),
      })),
      actionPlan: await ctx.db.select().from(actions).where(eq(actions.companyId, companyId)),
      channelReports: await ctx.db
        .select({ protocol: channelReports.protocol, category: channelReports.category, body: channelReports.body, status: channelReports.status, day: channelReports.createdDay })
        .from(channelReports)
        .where(eq(channelReports.companyId, companyId)),
      // Conversas do canal (sem o conteúdo binário dos anexos, só a contagem).
      channelMessages: await ctx.db
        .select({ protocol: channelReports.protocol, author: channelMessages.author, body: channelMessages.body, day: channelMessages.createdDay })
        .from(channelMessages)
        .innerJoin(channelReports, eq(channelReports.id, channelMessages.reportId))
        .where(eq(channelReports.companyId, companyId))
        .orderBy(channelMessages.seq),
      auditLog: await ctx.db.select({ at: auditLog.at, action: auditLog.action, entity: auditLog.entity, summary: auditLog.summary }).from(auditLog).where(eq(auditLog.companyId, companyId)),
    })
  }),

  /** Exclui a empresa ativa e todos os seus dados (cascata). Exige digitar o nome da empresa. */
  deleteCompany: ownerProcedure.input(z.object({ confirmName: z.string() })).mutation(async ({ c, ctx, input }) => {
    const company = await ctx.db.query.companies.findFirst({ where: eq(companies.id, ctx.session.companyId) })
    if (!company) throw new HTTPException(404, { message: "Empresa não encontrada" })
    if (input.confirmName.trim() !== company.name) throw new HTTPException(400, { message: "Digite o nome exato da empresa para confirmar" })
    await ctx.db.delete(companies).where(eq(companies.id, company.id))
    // Continua logado em outra empresa da carteira, se houver; senão, encerra a sessão.
    const next = await ctx.db.query.memberships.findFirst({ where: eq(memberships.userId, ctx.session.userId), orderBy: asc(memberships.createdAt) })
    if (next) {
      setCookie(c, SESSION_COOKIE, createSessionToken(ctx.session.userId, next.companyId), { httpOnly: true, sameSite: "Lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 })
    } else {
      deleteCookie(c, SESSION_COOKIE, { path: "/" })
    }
    return c.superjson({ ok: true, hasOtherCompany: !!next })
  }),

  /**
   * Exclui a conta do usuário. Se ele for o único dono de alguma empresa com outras pessoas,
   * precisa transferir a posse ou excluir a empresa antes, para não deixá-la sem dono.
   */
  deleteMe: privateProcedure.input(z.object({ confirm: z.literal("EXCLUIR") })).mutation(async ({ c, ctx }) => {
    const userId = ctx.session.userId
    const owned = await ctx.db.select({ companyId: memberships.companyId }).from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.role, "owner")))
    for (const { companyId } of owned) {
      const otherOwners = await ctx.db
        .select({ id: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.companyId, companyId), eq(memberships.role, "owner"), ne(memberships.userId, userId)))
      const others = await ctx.db.select({ id: memberships.userId }).from(memberships).where(and(eq(memberships.companyId, companyId), ne(memberships.userId, userId)))
      if (!otherOwners.length && others.length) {
        throw new HTTPException(409, { message: "Você é o único dono de uma empresa com outras pessoas. Torne outra pessoa dona ou exclua a empresa antes." })
      }
      // Empresa só sua: sai junto com a conta.
      if (!others.length) await ctx.db.delete(companies).where(eq(companies.id, companyId))
    }
    await ctx.db.delete(users).where(eq(users.id, userId))
    deleteCookie(c, SESSION_COOKIE, { path: "/" })
    return c.superjson({ ok: true })
  }),
})
