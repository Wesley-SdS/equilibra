import { and, desc, eq, sql } from "drizzle-orm"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import type { Db } from "../db"
import { campaignContacts, campaignDispatches, campaigns } from "../db/schema"
import { audit } from "../audit"
import { assertWritable } from "../billing"
import { MAX_CONTACTS, maskContact, parseContacts, sendCampaignDispatch } from "../dispatch"
import { appUrl } from "../email"
import { editorProcedure, j, privateProcedure } from "../jstack"
import { rateLimit } from "../rate-limit"
import { whatsappMode } from "../whatsapp"

async function ownCampaign(db: Db, companyId: string, id: string) {
  const campaign = await db.query.campaigns.findFirst({ where: and(eq(campaigns.id, id), eq(campaigns.companyId, companyId)) })
  if (!campaign) throw new HTTPException(404, { message: "Campanha não encontrada" })
  return campaign
}

/** Lista de distribuição e disparos do link anônimo (WhatsApp e e-mail). */
export const dispatchRouter = j.router({
  /** Contagens, amostra mascarada (para conferência) e histórico. Nunca devolve a lista completa. */
  summary: privateProcedure.input(z.object({ campaignId: z.string() })).query(async ({ c, ctx, input }) => {
    await ownCampaign(ctx.db, ctx.session.companyId, input.campaignId)
    const counts = await ctx.db
      .select({ channel: campaignContacts.channel, n: sql<number>`count(*)::int` })
      .from(campaignContacts)
      .where(eq(campaignContacts.campaignId, input.campaignId))
      .groupBy(campaignContacts.channel)
    const sample = await ctx.db.select().from(campaignContacts).where(eq(campaignContacts.campaignId, input.campaignId)).limit(3)
    const history = await ctx.db
      .select()
      .from(campaignDispatches)
      .where(eq(campaignDispatches.campaignId, input.campaignId))
      .orderBy(desc(campaignDispatches.at))
      .limit(10)
    return c.superjson({
      whatsapp: counts.find((x) => x.channel === "whatsapp")?.n ?? 0,
      email: counts.find((x) => x.channel === "email")?.n ?? 0,
      sample: sample.map((s) => maskContact(s.channel, s.address)),
      history,
      max: MAX_CONTACTS,
      whatsappMode,
      emailMode: process.env.RESEND_API_KEY ? "resend" : "simulacao",
    })
  }),

  /** Adiciona contatos colados pelo RH. Exige a declaração de base legal. */
  add: editorProcedure
    .input(z.object({ campaignId: z.string(), text: z.string().max(100_000), basis: z.literal(true, { error: "Confirme que a empresa pode contatar essas pessoas" }) }))
    .mutation(async ({ c, ctx, input }) => {
      await assertWritable(ctx.db, ctx.session.companyId)
      await ownCampaign(ctx.db, ctx.session.companyId, input.campaignId)
      const parsed = parseContacts(input.text)
      const [{ n }] = (await ctx.db
        .select({ n: sql<number>`count(*)::int` })
        .from(campaignContacts)
        .where(eq(campaignContacts.campaignId, input.campaignId))) as [{ n: number }]
      const room = Math.max(0, MAX_CONTACTS - n)
      const rows = [
        ...parsed.whatsapp.map((address) => ({ campaignId: input.campaignId, channel: "whatsapp" as const, address })),
        ...parsed.email.map((address) => ({ campaignId: input.campaignId, channel: "email" as const, address })),
      ]
      if (!rows.length && parsed.invalid) throw new HTTPException(422, { message: `Nenhum contato válido (${parsed.invalid} inválido(s)). Use telefones com DDD ou e-mails.` })
      const inserted = rows.length
        ? await ctx.db.insert(campaignContacts).values(rows.slice(0, room)).onConflictDoNothing().returning({ id: campaignContacts.id })
        : []
      await audit(ctx.db, ctx.session, {
        action: "create",
        entity: "lista de envio",
        entityId: input.campaignId,
        summary: `${inserted.length} contato(s) adicionados à lista de envio (declaração de base legal registrada)`,
      })
      return c.superjson({ added: inserted.length, duplicates: Math.min(rows.length, room) - inserted.length, invalid: parsed.invalid, overLimit: Math.max(0, rows.length - room) })
    }),

  clear: editorProcedure.input(z.object({ campaignId: z.string() })).mutation(async ({ c, ctx, input }) => {
    await ownCampaign(ctx.db, ctx.session.companyId, input.campaignId)
    await ctx.db.delete(campaignContacts).where(eq(campaignContacts.campaignId, input.campaignId))
    await audit(ctx.db, ctx.session, { action: "delete", entity: "lista de envio", entityId: input.campaignId, summary: "Lista de envio apagada" })
    return c.superjson({ ok: true })
  }),

  /** Envia agora o convite ou o lembrete à lista. */
  send: editorProcedure
    .input(z.object({ campaignId: z.string(), kind: z.enum(["invite", "reminder"]) }))
    .mutation(async ({ c, ctx, input }) => {
      await assertWritable(ctx.db, ctx.session.companyId)
      const campaign = await ownCampaign(ctx.db, ctx.session.companyId, input.campaignId)
      if (campaign.status !== "active") throw new HTTPException(409, { message: "A campanha está encerrada." })
      await rateLimit(`dispatch:${campaign.id}`, 4, 60 * 60_000)
      const result = await sendCampaignDispatch(ctx.db, campaign.id, input.kind, "manual", appUrl(c.req.url))
      if (!result || result.whatsappSent + result.emailSent + result.failed === 0) {
        throw new HTTPException(400, { message: "A lista de envio está vazia. Adicione contatos antes." })
      }
      await audit(ctx.db, ctx.session, {
        action: "status",
        entity: "campanha",
        entityId: campaign.id,
        summary: `${input.kind === "invite" ? "Convite" : "Lembrete"} enviado: ${result.whatsappSent} WhatsApp, ${result.emailSent} e-mail, ${result.failed} falha(s)`,
      })
      return c.superjson(result)
    }),
})
