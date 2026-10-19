import { and, asc, eq, inArray } from "drizzle-orm"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import type { Db } from "../db"
import { answers, campaignParticipants, campaigns, companies, employees, responseIdentities, sectors } from "../db/schema"
import { audit } from "../audit"
import { appUrl, sendEmail } from "../email"
import { identifiedEmail } from "../email/templates"
import { assertWritable } from "../billing"
import { editorProcedure, j, privateProcedure } from "../jstack"
import { loadCampaignQuestionnaire } from "../questionnaires"
import { rateLimit } from "../rate-limit"
import { normalizePhone, sendWhatsApp } from "../whatsapp"
import { DIMENSIONS } from "@/lib/methodology"
import { estimatedMinutes } from "@/lib/questionnaire"
import { formatDate } from "@/lib/utils"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const MAX_EMPLOYEES = 2000

const personInput = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(160)
    .refine((v) => !v || EMAIL.test(v), "E-mail inválido")
    .transform((v) => v || null)
    .nullable()
    .default(null),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((v) => !v || normalizePhone(v) !== null, "Telefone inválido")
    .transform((v) => (v ? normalizePhone(v) : null))
    .nullable()
    .default(null),
  sectorId: z.string().nullable().default(null),
})

async function assertSector(db: Db, companyId: string, sectorId: string | null) {
  if (!sectorId) return
  const s = await db.query.sectors.findFirst({ where: and(eq(sectors.id, sectorId), eq(sectors.companyId, companyId)) })
  if (!s) throw new HTTPException(400, { message: "Setor inválido" })
}

/** Lê a lista colada: "Nome; e-mail ou telefone; setor" (um por linha; setor opcional). */
export function parsePeople(text: string, sectorByName: Map<string, string>) {
  const ok: { name: string; email: string | null; phone: string | null; sectorId: string | null }[] = []
  const invalid: string[] = []
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const parts = line.split(/[;\t]/).map((p) => p.trim())
    const name = parts[0] ?? ""
    const contacts = parts.slice(1).filter(Boolean)
    let email: string | null = null
    let phone: string | null = null
    let sectorId: string | null = null
    for (const c of contacts) {
      if (c.includes("@") && EMAIL.test(c.toLowerCase())) email = c.toLowerCase()
      else if (normalizePhone(c)) phone = normalizePhone(c)
      else if (sectorByName.has(c.toLowerCase())) sectorId = sectorByName.get(c.toLowerCase())!
    }
    if (name.length < 2 || (!email && !phone)) invalid.push(line)
    else ok.push({ name: name.slice(0, 120), email, phone, sectorId })
  }
  return { ok, invalid }
}

export const employeesRouter = j.router({
  list: privateProcedure.query(async ({ c, ctx }) => {
    const rows = await ctx.db
      .select({ id: employees.id, name: employees.name, email: employees.email, phone: employees.phone, sectorId: employees.sectorId, active: employees.active, sectorName: sectors.name })
      .from(employees)
      .leftJoin(sectors, eq(sectors.id, employees.sectorId))
      .where(eq(employees.companyId, ctx.session.companyId))
      .orderBy(asc(employees.name))
    return c.superjson(rows)
  }),

  create: editorProcedure.input(personInput).mutation(async ({ c, ctx, input }) => {
    await assertWritable(ctx.db, ctx.session.companyId)
    if (!input.email && !input.phone) throw new HTTPException(422, { message: "Informe e-mail ou telefone para enviar o link pessoal." })
    await assertSector(ctx.db, ctx.session.companyId, input.sectorId)
    const [row] = await ctx.db.insert(employees).values({ ...input, companyId: ctx.session.companyId }).returning()
    await audit(ctx.db, ctx.session, { action: "create", entity: "pessoa", entityId: row!.id, summary: `Pessoa ${row!.name} cadastrada` })
    return c.superjson(row!)
  }),

  /** Cadastro em lote a partir de uma lista colada. Ignora quem já existe com o mesmo e-mail ou telefone. */
  bulk: editorProcedure.input(z.object({ text: z.string().max(200_000) })).mutation(async ({ c, ctx, input }) => {
    await assertWritable(ctx.db, ctx.session.companyId)
    const companySectors = await ctx.db.select().from(sectors).where(eq(sectors.companyId, ctx.session.companyId))
    const parsed = parsePeople(input.text, new Map(companySectors.map((s) => [s.name.toLowerCase(), s.id])))
    const existing = await ctx.db.select({ email: employees.email, phone: employees.phone }).from(employees).where(eq(employees.companyId, ctx.session.companyId))
    const seen = new Set(existing.flatMap((e) => [e.email, e.phone]).filter(Boolean) as string[])
    const fresh = parsed.ok.filter((p) => {
      const keys = [p.email, p.phone].filter(Boolean) as string[]
      if (keys.some((k) => seen.has(k))) return false
      keys.forEach((k) => seen.add(k))
      return true
    })
    if (existing.length + fresh.length > MAX_EMPLOYEES) throw new HTTPException(400, { message: `Limite de ${MAX_EMPLOYEES} pessoas cadastradas.` })
    if (fresh.length) await ctx.db.insert(employees).values(fresh.map((p) => ({ ...p, companyId: ctx.session.companyId })))
    await audit(ctx.db, ctx.session, { action: "create", entity: "pessoa", summary: `${fresh.length} pessoas cadastradas em lote` })
    return c.superjson({ added: fresh.length, duplicates: parsed.ok.length - fresh.length, invalid: parsed.invalid.length })
  }),

  update: editorProcedure.input(personInput.partial().extend({ id: z.string(), active: z.boolean().optional() })).mutation(async ({ c, ctx, input }) => {
    const { id, ...data } = input
    if (data.sectorId !== undefined) await assertSector(ctx.db, ctx.session.companyId, data.sectorId ?? null)
    const [row] = await ctx.db
      .update(employees)
      .set(data)
      .where(and(eq(employees.id, id), eq(employees.companyId, ctx.session.companyId)))
      .returning()
    if (!row) throw new HTTPException(404, { message: "Pessoa não encontrada" })
    await audit(ctx.db, ctx.session, { action: "update", entity: "pessoa", entityId: row.id, summary: `Pessoa ${row.name} atualizada` })
    return c.superjson({ ok: true })
  }),

  /** Exclui a pessoa e, junto, o vínculo dela com respostas identificadas (LGPD: eliminação). */
  remove: editorProcedure.input(z.object({ id: z.string() })).mutation(async ({ c, ctx, input }) => {
    const [row] = await ctx.db.delete(employees).where(and(eq(employees.id, input.id), eq(employees.companyId, ctx.session.companyId))).returning()
    if (row) await audit(ctx.db, ctx.session, { action: "delete", entity: "pessoa", entityId: row.id, summary: `Pessoa ${row.name} excluída` })
    return c.superjson({ ok: true })
  }),
})

async function identifiedCampaign(db: Db, companyId: string, campaignId: string) {
  const campaign = await db.query.campaigns.findFirst({ where: and(eq(campaigns.id, campaignId), eq(campaigns.companyId, companyId)) })
  if (!campaign) throw new HTTPException(404, { message: "Campanha não encontrada" })
  const q = await loadCampaignQuestionnaire(db, campaign.questionnaireVersionId)
  if (q.anonymous) throw new HTTPException(403, { message: "Campanha anônima: não há participantes identificados." })
  return { campaign, questionnaire: q }
}

export const participantsRouter = j.router({
  /** Quem foi convidado, quem respondeu e quando. Só existe em campanhas de questionário identificado. */
  list: privateProcedure.input(z.object({ campaignId: z.string() })).query(async ({ c, ctx, input }) => {
    const { campaign, questionnaire } = await identifiedCampaign(ctx.db, ctx.session.companyId, input.campaignId)
    const rows = await ctx.db
      .select({
        id: campaignParticipants.id,
        employeeId: employees.id,
        name: employees.name,
        email: employees.email,
        phone: employees.phone,
        sectorId: employees.sectorId,
        sectorName: sectors.name,
        token: campaignParticipants.token,
        invitedAt: campaignParticipants.invitedAt,
        remindedAt: campaignParticipants.remindedAt,
        respondedAt: campaignParticipants.respondedAt,
      })
      .from(campaignParticipants)
      .innerJoin(employees, eq(employees.id, campaignParticipants.employeeId))
      .leftJoin(sectors, eq(sectors.id, employees.sectorId))
      .where(eq(campaignParticipants.campaignId, campaign.id))
      .orderBy(asc(employees.name))
    // Respostas individuais (o gestor escolheu um questionário identificado e o respondente aceitou).
    const identities = await ctx.db.select().from(responseIdentities).where(eq(responseIdentities.campaignId, campaign.id))
    const ans = identities.length ? await ctx.db.select().from(answers).where(inArray(answers.responseId, identities.map((i) => i.responseId))) : []
    const byEmployee = new Map<string, Record<string, number>>()
    for (const i of identities) byEmployee.set(i.employeeId, {})
    const employeeOf = new Map(identities.map((i) => [i.responseId, i.employeeId]))
    for (const a of ans) byEmployee.get(employeeOf.get(a.responseId)!)![a.questionId] = a.value
    return c.superjson({
      campaign: { id: campaign.id, name: campaign.name, status: campaign.status, endsAt: campaign.endsAt },
      questionnaire: {
        name: questionnaire.name,
        items: questionnaire.items.map((i) => ({ id: i.id, text: i.text, dimension: i.dimension, risk: i.risk, dimensionName: DIMENSIONS.find((d) => d.id === i.dimension)?.short ?? null })),
      },
      participants: rows.map(({ token, ...r }) => ({ ...r, answers: byEmployee.get(r.employeeId) ?? null, link: `/r/${token}` })),
    })
  }),

  /** Envia o link pessoal por e-mail e WhatsApp (convite ou lembrete só para quem ainda não respondeu). */
  send: editorProcedure.input(z.object({ campaignId: z.string(), kind: z.enum(["invite", "reminder"]) })).mutation(async ({ c, ctx, input }) => {
    await assertWritable(ctx.db, ctx.session.companyId)
    await rateLimit(`participants:${input.campaignId}`, 6, 60 * 60_000)
    const { campaign, questionnaire } = await identifiedCampaign(ctx.db, ctx.session.companyId, input.campaignId)
    if (campaign.status !== "active") throw new HTTPException(400, { message: "A campanha está encerrada." })
    const company = await ctx.db.query.companies.findFirst({ where: eq(companies.id, ctx.session.companyId) })
    const purpose = (await ctx.db.query.questionnaires.findFirst({ where: (q, { eq: e }) => e(q.id, questionnaire.id) }))?.purpose ?? ""
    const rows = await ctx.db
      .select({ p: campaignParticipants, e: employees })
      .from(campaignParticipants)
      .innerJoin(employees, eq(employees.id, campaignParticipants.employeeId))
      .where(eq(campaignParticipants.campaignId, campaign.id))
    const targets = rows.filter((r) => !r.p.respondedAt && (input.kind === "invite" ? !r.p.invitedAt : true))
    const base = appUrl(c.req.url)
    const minutes = estimatedMinutes(questionnaire.items.length + campaign.customQuestions.length)
    let emailSent = 0
    let whatsappSent = 0
    let failed = 0
    for (const { p, e } of targets) {
      const link = `${base}/r/${p.token}`
      const endsAt = formatDate(campaign.endsAt)
      let ok = false
      if (e.email) {
        const mail = identifiedEmail({ company: company!.name, campaign: campaign.name, person: e.name, endsAt, link, reminder: input.kind === "reminder", minutes, purpose })
        if (await sendEmail({ to: e.email, ...mail })) {
          emailSent++
          ok = true
        }
      }
      if (e.phone) {
        if (await sendWhatsApp({ to: e.phone, template: input.kind, params: [company!.name, campaign.name, link, endsAt] })) {
          whatsappSent++
          ok = true
        }
      }
      if (!ok) failed++
      else await ctx.db.update(campaignParticipants).set(input.kind === "invite" ? { invitedAt: new Date() } : { remindedAt: new Date() }).where(eq(campaignParticipants.id, p.id))
    }
    await audit(ctx.db, ctx.session, {
      action: "status",
      entity: "campanha",
      entityId: campaign.id,
      summary: `${input.kind === "invite" ? "Convites" : "Lembretes"} pessoais enviados (${emailSent} e-mails, ${whatsappSent} WhatsApp${failed ? `, ${failed} falhas` : ""})`,
    })
    return c.superjson({ people: targets.length, emailSent, whatsappSent, failed })
  }),
})
