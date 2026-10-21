import { eq } from "drizzle-orm"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { companies, listeningConversations } from "../db/schema"
import { audit } from "../audit"
import { j, ownerProcedure, privateProcedure, publicProcedure } from "../jstack"
import { clientIp, rateLimit } from "../rate-limit"
import { RETENTION_DAYS, conversationFromCookie, listeningInsights, listeningPlatformEnabled, listeningStatus, readMessages, sendMessage, startConversation } from "../listening"

const slug = z.string().min(1).max(80)
const cookieName = (companyId: string) => `eq_escuta_${companyId.slice(0, 8)}`
const cookieOpts = { httpOnly: true, sameSite: "Lax" as const, path: "/", maxAge: RETENTION_DAYS * 86_400 }

/** Espaço de escuta, lado do trabalhador (público e anônimo: a identidade é só o cookie do aparelho). */
export const listeningRouter = j.router({
  status: publicProcedure.input(z.object({ slug })).query(async ({ c, ctx, input }) => {
    const { company, available } = await listeningStatus(ctx.db, input.slug)
    const found = available ? await conversationFromCookie(ctx.db, company.id, getCookie(c, cookieName(company.id))) : null
    return c.superjson({
      available,
      companyName: company.name,
      hasConversation: Boolean(found),
      crisis: Boolean(found?.conv.crisisAt && Date.now() - found.conv.crisisAt.getTime() < 86_400_000),
    })
  }),

  /** Aceite do termo específico e início da conversa. */
  start: publicProcedure.input(z.object({ slug, consent: z.literal(true) })).mutation(async ({ c, ctx, input }) => {
    const { company, available } = await listeningStatus(ctx.db, input.slug)
    // Por empresa e IP: num escritório, todos saem pelo mesmo IP.
    await rateLimit(`escuta:start:${company.id}:${clientIp(c.req.raw.headers)}`, 60, 60 * 60_000)
    if (!available) throw new HTTPException(403, { message: "O Espaço de escuta não está ativo nesta empresa." })
    const existing = await conversationFromCookie(ctx.db, company.id, getCookie(c, cookieName(company.id)))
    if (existing) return c.superjson({ ok: true })
    const { cookie } = await startConversation(ctx.db, company.id)
    setCookie(c, cookieName(company.id), cookie, cookieOpts)
    return c.superjson({ ok: true })
  }),

  messages: publicProcedure.input(z.object({ slug })).query(async ({ c, ctx, input }) => {
    const { company, available } = await listeningStatus(ctx.db, input.slug)
    if (!available) return c.superjson([])
    const found = await conversationFromCookie(ctx.db, company.id, getCookie(c, cookieName(company.id)))
    if (!found) return c.superjson([])
    return c.superjson(await readMessages(ctx.db, found.conv.id, found.secret))
  }),

  send: publicProcedure.input(z.object({ slug, text: z.string().trim().min(1).max(2000) })).mutation(async ({ c, ctx, input }) => {
    const { company, available } = await listeningStatus(ctx.db, input.slug)
    if (!available) throw new HTTPException(403, { message: "O Espaço de escuta não está ativo nesta empresa." })
    const found = await conversationFromCookie(ctx.db, company.id, getCookie(c, cookieName(company.id)))
    if (!found) throw new HTTPException(401, { message: "Conversa não encontrada neste aparelho. Comece de novo." })
    await rateLimit(`escuta:conv:${found.conv.id}`, 40, 60 * 60_000)
    await rateLimit(`escuta:ip:${company.id}:${clientIp(c.req.raw.headers)}`, 600, 60 * 60_000)
    return c.superjson(await sendMessage(ctx.db, found.conv, found.secret, input.text))
  }),

  /** Apaga a conversa inteira (mensagens incluídas) e o cookie do aparelho. */
  remove: publicProcedure.input(z.object({ slug })).mutation(async ({ c, ctx, input }) => {
    const company = await ctx.db.query.companies.findFirst({ where: eq(companies.slug, input.slug) })
    if (!company) throw new HTTPException(404, { message: "Espaço não encontrado" })
    const found = await conversationFromCookie(ctx.db, company.id, getCookie(c, cookieName(company.id)))
    if (found) await ctx.db.delete(listeningConversations).where(eq(listeningConversations.id, found.conv.id))
    deleteCookie(c, cookieName(company.id), { path: "/" })
    return c.superjson({ ok: true })
  }),
})

/** Lado da empresa: adesão (só o dono) e temas agregados (nunca conversas). */
export const listeningAdminRouter = j.router({
  insights: privateProcedure.query(async ({ c, ctx }) => {
    return c.superjson(await listeningInsights(ctx.db, ctx.session.companyId))
  }),

  setEnabled: ownerProcedure.input(z.object({ enabled: z.boolean(), acknowledge: z.boolean().optional() })).mutation(async ({ c, ctx, input }) => {
    if (input.enabled && !listeningPlatformEnabled()) {
      throw new HTTPException(400, { message: "O Espaço de escuta ainda está em piloto fechado e não pode ser ativado nesta instalação." })
    }
    if (input.enabled && input.acknowledge !== true) {
      throw new HTTPException(400, { message: "Confirme que leu os limites do Espaço de escuta antes de ativar." })
    }
    await ctx.db.update(companies).set({ listeningEnabled: input.enabled, listeningEnabledAt: input.enabled ? new Date() : null }).where(eq(companies.id, ctx.session.companyId))
    await audit(ctx.db, ctx.session, { action: "update", entity: "escuta", entityId: ctx.session.companyId, summary: `Espaço de escuta ${input.enabled ? "ativado" : "desativado"}` })
    return c.superjson({ ok: true })
  }),
})
