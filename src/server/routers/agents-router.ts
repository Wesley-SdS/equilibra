import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { agentRuns } from "../db/schema"
import { audit } from "../audit"
import { entitlements, usage } from "../billing"
import { editorProcedure, j, privateProcedure } from "../jstack"
import { agentsAvailable } from "../agents/client"
import { proposeQuestionnaire } from "../agents/questionnaire-copilot"
import { DIMENSIONS, type DimensionId } from "@/lib/methodology"
import { QUESTIONNAIRE_KINDS, type QuestionnaireKind } from "@/lib/questionnaire"

const kindEnum = z.enum(QUESTIONNAIRE_KINDS.map((k) => k.id) as [QuestionnaireKind, ...QuestionnaireKind[]])
const dimensionEnum = z.enum(DIMENSIONS.map((d) => d.id) as [DimensionId, ...DimensionId[]])

export const agentsRouter = j.router({
  /** Se os copilotos estão disponíveis e quanto da cota do mês já foi usado. */
  usage: privateProcedure.query(async ({ c, ctx }) => {
    const company = await ctx.db.query.companies.findFirst({ where: (t, { eq: e }) => e(t.id, ctx.session.companyId) })
    const limit = company ? entitlements(company).limits.agentRuns : 0
    const used = (await usage(ctx.db, ctx.session.companyId)).agentRuns
    return c.superjson({ available: agentsAvailable() && limit > 0, configured: agentsAvailable(), used, limit })
  }),

  /** Copiloto de questionários: propõe (ou ajusta) itens a partir da dor descrita pelo gestor. */
  questionnaire: editorProcedure
    .input(
      z.object({
        pain: z.string().trim().min(10, "Descreva a situação com um pouco mais de detalhe").max(2000),
        instruction: z.string().trim().max(500).optional(),
        draft: z
          .object({
            name: z.string().max(80),
            kind: kindEnum,
            items: z.array(z.object({ text: z.string().max(200), dimension: dimensionEnum.nullable(), risk: z.boolean() })).max(40),
          })
          .optional(),
      })
    )
    .mutation(async ({ c, ctx, input }) => {
      const result = await proposeQuestionnaire({ db: ctx.db, companyId: ctx.session.companyId, userId: ctx.session.userId }, input)
      await audit(ctx.db, ctx.session, { action: "create", entity: "copiloto", entityId: result.runId, summary: `Copiloto de questionários propôs ${result.items.length} itens` })
      return c.superjson(result)
    }),

  /** O gestor aceitou (ou descartou) a proposta: alimenta a medição de qualidade dos copilotos. */
  feedback: editorProcedure.input(z.object({ runId: z.string(), accepted: z.boolean() })).mutation(async ({ c, ctx, input }) => {
    await ctx.db
      .update(agentRuns)
      .set({ accepted: input.accepted })
      .where(and(eq(agentRuns.id, input.runId), eq(agentRuns.companyId, ctx.session.companyId)))
    return c.superjson({ ok: true })
  }),
})
