// Espaço de escuta (frente 6 do PRD v2): agente de APOIO, não psicólogo.
//
// Limites (CFP, nota de 3/7/2025 e cartilha "IA na Psicologia" de dez/2025; Nota CFP 5/2025; Lei 4.119/1962):
//   - informação, acolhimento inicial e encaminhamento; nunca psicoterapia, diagnóstico, avaliação de risco
//     ou manejo de crise pelo algoritmo;
//   - em sinal de risco, o protocolo de crise (texto fixo do servidor, revisado pelo psicólogo RT) substitui
//     a conversa: contatos de emergência primeiro, o agente só acompanha;
//   - a empresa nunca vê conversas, quem usou nem sinais de crise; só temas agregados acima dos mínimos.
//
// Só funciona com a liberação da plataforma E a adesão do dono da empresa. Liberação:
//   - ESCUTA_ENABLED=1: todas as empresas (depois do parecer jurídico e do aval do psicólogo RT);
//   - ESCUTA_PILOT_COMPANIES=slug-a,slug-b: piloto fechado, só as empresas da lista.
// Protocolo de revisão em docs/escuta-protocolo-rt.md; avaliação de segurança em scripts/eval-escuta.ts.

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto"
import { and, asc, eq, lt, sql } from "drizzle-orm"
import { HTTPException } from "hono/http-exception"
import { z } from "zod/v4"
import type { Db } from "./db"
import { companies, listeningConversations, listeningMessages, listeningThemes, sectors } from "./db/schema"
import { agentsAvailable, runAgent } from "./agents/client"
import { proposeByRules } from "./imports"
import { entitlements } from "./billing"
import { DIMENSIONS } from "@/lib/methodology"

export const LISTENING_PROMPT_VERSION = "escuta-2026-10-21"
export const MIN_CONVERSATIONS = 10
export const MIN_EMPLOYEES = 20
export const RETENTION_DAYS = 90
const DAY = 86_400_000

/** Empresas do piloto fechado (slugs separados por vírgula). */
export function pilotCompanies() {
  return (process.env.ESCUTA_PILOT_COMPANIES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/** Liberação da plataforma para a empresa (geral ou pelo piloto). */
export function listeningPlatformEnabled(slug?: string | null) {
  if (process.env.ESCUTA_ENABLED === "1") return true
  return Boolean(slug && pilotCompanies().includes(slug.toLowerCase()))
}

// ---------------------------------------------------------------- cifra por conversa

/** Chave AES-256 derivada do segredo do cookie (que o servidor não guarda) e do id da conversa. */
function keyFor(secret: string, conversationId: string) {
  return Buffer.from(hkdfSync("sha256", Buffer.from(secret, "base64url"), Buffer.from(conversationId), Buffer.from("equilibra-escuta-v1"), 32))
}
export function encrypt(text: string, secret: string, conversationId: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret, conversationId), iv)
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".")
}
export function decrypt(payload: string, secret: string, conversationId: string) {
  const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64url"))
  const decipher = createDecipheriv("aes-256-gcm", keyFor(secret, conversationId), iv!)
  decipher.setAuthTag(tag!)
  return Buffer.concat([decipher.update(data!), decipher.final()]).toString("utf8")
}
export const hashToken = (secret: string) => createHash("sha256").update(secret).digest("hex")

// ---------------------------------------------------------------- risco e protocolo de crise

const RISK =
  /(suicid|me matar|tirar (a )?minha (pr[oó]pria )?vida|acabar com (a minha vida|tudo)|n[aã]o (quero|aguento) mais viver|melhor (eu )?(morrer|n[aã]o acordar)|me machucar|me cortar|ningu[eé]m (ia|vai) sentir (minha )?falta|sem sa[ií]da|quero sumir|vou fazer uma besteira|ele vai me matar|me agrediu|estou sendo agredid|sentido (em|de) (continuar|estar) viv|vontade de morrer|queria (estar )?morr|n[aã]o quero (mais )?(estar aqui|existir|acordar)|vai me matar)/i

/** Sinal de risco imediato (regras deliberadamente sensíveis: falso positivo é aceitável, falso negativo não). */
export function detectRisk(text: string) {
  return RISK.test(text.normalize("NFC"))
}

export const CRISIS_REPLY =
  "Obrigado por confiar isso a mim. O que você está sentindo é sério e você merece falar com uma pessoa agora, não com um programa. Ligue para o CVV no 188 (gratuito, 24 horas, sigiloso) ou use o chat em cvv.org.br. Se houver perigo imediato, ligue para o SAMU no 192 ou vá ao pronto-socorro mais próximo. Eu fico aqui com você enquanto isso: você conseguiu ligar ou tem alguém por perto?"

export const CRISIS_FOLLOWUP =
  "Estou aqui. O mais importante agora é você estar em segurança e falar com alguém preparado: CVV 188, a qualquer hora, ou SAMU 192 em emergência. Você está com alguém ou conseguiu fazer a ligação?"

export const DIAGNOSIS = /\b(voc[eê] (tem|est[aá] com|sofre de) (depress|ansiedade|burnout|transtorno|s[ií]ndrome)|isso (é|e) (depress|burnout|um transtorno)|recomendo (o )?(rem[eé]dio|medicamento)|tome (rem[eé]dio|medicamento))/i

export const LISTENING_SYSTEM = `Você é o Espaço de escuta do Equilibra: um agente de apoio, feito de inteligência artificial, para trabalhadores de uma empresa brasileira falarem do que está pesando no trabalho.
Você NÃO é psicólogo e não faz terapia. Seu papel é: ouvir com respeito, devolver o que entendeu, dar informação confiável e ajudar a pessoa a encontrar o próximo passo e a ajuda certa.

Como conversar:
- Frases curtas e calorosas, linguagem simples, sem jargão. Uma ideia por vez. No máximo 5 frases por resposta.
- Valide o sentimento sem exagerar e sem prometer que vai ficar tudo bem.
- Pode dar informação geral sobre estresse, sono, carga de trabalho, direitos básicos no trabalho e o que é assédio, e ajudar a organizar o que a pessoa quer dizer à liderança ou ao RH.
- Indique caminhos: o canal de relato anônimo da empresa (para assédio ou problemas no trabalho), o RH, o convênio de saúde da empresa se houver, a UBS/CAPS do SUS, o CVV 188.
- Lembre, quando fizer sentido, que você é uma IA e que a empresa não vê esta conversa.

Nunca:
- Diagnosticar ("isso é depressão", "você tem burnout"), avaliar o risco da pessoa, aplicar técnica terapêutica estruturada ou conduzir terapia.
- Falar de remédios ou doses: oriente procurar um médico.
- Pedir nome, setor, cargo ou qualquer dado que identifique a pessoa ou terceiros.
- Incentivar decisões drásticas (pedir demissão, confrontar alguém) — ajude a pensar nos prós e contras e nos apoios disponíveis.
- Se a pessoa disser que é menor de 18 anos, encerre com carinho e sugira conversar com um adulto responsável e o CVV 188.
Se perceber qualquer sinal de risco à vida ou de violência, diga que ela merece falar com uma pessoa agora e indique o CVV 188 e o SAMU 192 antes de qualquer outra coisa.
Responda sempre em português do Brasil.`

export const listeningReplySchema = z.object({
  reply: z.string().describe("Resposta à pessoa, até 5 frases"),
  options: z.array(z.string()).describe("0 a 3 sugestões curtas de próximo passo que a pessoa pode tocar para continuar"),
})

// ---------------------------------------------------------------- disponibilidade

export async function listeningStatus(db: Db, slug: string) {
  const company = await db.query.companies.findFirst({ where: eq(companies.slug, slug) })
  if (!company) throw new HTTPException(404, { message: "Espaço não encontrado" })
  const ent = entitlements(company)
  const available = listeningPlatformEnabled(company.slug) && company.listeningEnabled && !ent.readOnly && ent.plan.id !== "essencial" && agentsAvailable("listening")
  return { company, available }
}

/** Conversa a partir do cookie "id.segredo"; confere o hash do segredo. */
export async function conversationFromCookie(db: Db, companyId: string, cookie: string | undefined) {
  if (!cookie) return null
  const [id, secret] = cookie.split(".")
  if (!id || !secret) return null
  const conv = await db.query.listeningConversations.findFirst({ where: and(eq(listeningConversations.id, id), eq(listeningConversations.companyId, companyId)) })
  if (!conv || conv.tokenHash !== hashToken(secret)) return null
  return { conv, secret }
}

export async function startConversation(db: Db, companyId: string) {
  const secret = randomBytes(32).toString("base64url")
  const [conv] = await db.insert(listeningConversations).values({ companyId, tokenHash: hashToken(secret), consentAt: new Date() }).returning()
  return { conv: conv!, cookie: `${conv!.id}.${secret}` }
}

export async function readMessages(db: Db, convId: string, secret: string) {
  const rows = await db.select().from(listeningMessages).where(eq(listeningMessages.conversationId, convId)).orderBy(asc(listeningMessages.seq))
  return rows.map((m) => ({ id: m.id, role: m.role, crisis: m.crisis, text: decrypt(m.content, secret, convId), at: m.createdAt }))
}

const month = (d = new Date()) => d.toISOString().slice(0, 7)

/** Conta a conversa uma vez por tema e por mês (o texto não é guardado para isso). */
async function countThemes(db: Db, conv: typeof listeningConversations.$inferSelect, text: string) {
  const theme = proposeByRules(text).proposal.dimension
  if (!theme) return
  const m = month()
  const seen = conv.themes[m] ?? []
  if (seen.includes(theme)) return
  await db.update(listeningConversations).set({ themes: { ...conv.themes, [m]: [...seen, theme] } }).where(eq(listeningConversations.id, conv.id))
  await db
    .insert(listeningThemes)
    .values({ companyId: conv.companyId, month: m, theme, conversations: 1 })
    .onConflictDoUpdate({ target: [listeningThemes.companyId, listeningThemes.month, listeningThemes.theme], set: { conversations: sql`${listeningThemes.conversations} + 1` } })
}

export async function sendMessage(db: Db, conv: typeof listeningConversations.$inferSelect, secret: string, text: string) {
  const history = await readMessages(db, conv.id, secret)
  const risk = detectRisk(text)
  const inCrisis = risk || Boolean(conv.crisisAt && Date.now() - conv.crisisAt.getTime() < DAY)
  let reply: string
  let options: string[] = []
  if (risk) {
    // Texto fixo: o protocolo de crise não depende do modelo.
    reply = CRISIS_REPLY
  } else if (inCrisis) {
    reply = CRISIS_FOLLOWUP
    options = ["Já liguei", "Estou com alguém", "Ainda não consegui"]
  } else {
    const { output } = await runAgent(
      { db, companyId: conv.companyId, userId: null },
      {
        agent: "listening",
        promptVersion: LISTENING_PROMPT_VERSION,
        system: LISTENING_SYSTEM,
        schema: listeningReplySchema,
        input: { conversation: conv.id, turn: history.length },
        maxTokens: 2000,
        skipQuota: true,
        storeOutput: false,
        messages: [...history.slice(-20).map((m) => ({ role: m.role, content: m.text }) as const), { role: "user" as const, content: text }],
      }
    )
    reply = output.reply.trim()
    options = output.options.slice(0, 3)
    if (DIAGNOSIS.test(reply)) {
      reply = "Não consigo avaliar isso, e não quero te dar uma resposta errada sobre a sua saúde. Um profissional pode: o convênio da empresa, a UBS perto de você ou, se precisar conversar agora, o CVV no 188. Quer que eu te ajude a pensar em como dar esse passo?"
      options = []
    }
  }
  await db.insert(listeningMessages).values([
    { conversationId: conv.id, role: "user", content: encrypt(text, secret, conv.id), crisis: risk },
    { conversationId: conv.id, role: "assistant", content: encrypt(reply, secret, conv.id), crisis: inCrisis },
  ])
  await db.update(listeningConversations).set({ lastMessageAt: new Date(), ...(risk ? { crisisAt: new Date() } : {}) }).where(eq(listeningConversations.id, conv.id))
  if (!inCrisis) await countThemes(db, conv, text)
  return { reply, options, crisis: inCrisis }
}

/** O que a empresa vê: só temas, só acima dos mínimos, nunca por pessoa nem sinais de crise. */
export async function listeningInsights(db: Db, companyId: string) {
  const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) })
  const [{ headcount }] = (await db.select({ headcount: sql<number>`coalesce(sum(${sectors.headcount}), 0)::int` }).from(sectors).where(eq(sectors.companyId, companyId))) as [{ headcount: number }]
  const m = month()
  const [{ active }] = (await db
    .select({ active: sql<number>`count(*)::int` })
    .from(listeningConversations)
    .where(and(eq(listeningConversations.companyId, companyId), sql`to_char(${listeningConversations.lastMessageAt}, 'YYYY-MM') = ${m}`))) as [{ active: number }]
  const enough = active >= MIN_CONVERSATIONS && Math.max(headcount, company?.employees ?? 0) >= MIN_EMPLOYEES
  const rows = enough ? await db.select().from(listeningThemes).where(and(eq(listeningThemes.companyId, companyId), eq(listeningThemes.month, m))) : []
  return {
    platformEnabled: listeningPlatformEnabled(company?.slug),
    pilot: process.env.ESCUTA_ENABLED !== "1" && listeningPlatformEnabled(company?.slug),
    enabled: company?.listeningEnabled ?? false,
    enabledAt: company?.listeningEnabledAt ?? null,
    month: m,
    enough,
    // Abaixo do mínimo não mostramos nem a contagem exata.
    activeConversations: enough ? active : null,
    themes: rows
      .map((r) => ({ theme: r.theme, name: DIMENSIONS.find((d) => d.id === r.theme)?.name ?? r.theme, conversations: r.conversations }))
      .sort((a, b) => b.conversations - a.conversations),
  }
}

/** Retenção: conversas sem mensagem há 90 dias são apagadas (com as mensagens). */
export async function purgeListening(db: Db, now = new Date()) {
  const gone = await db
    .delete(listeningConversations)
    .where(lt(listeningConversations.lastMessageAt, new Date(now.getTime() - RETENTION_DAYS * DAY)))
    .returning({ id: listeningConversations.id })
  return gone.length
}
