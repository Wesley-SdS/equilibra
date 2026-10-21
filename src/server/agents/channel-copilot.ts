// Copiloto do canal de relato: ajuda o RH a entender o caso (resumo, enquadramento, o que falta
// perguntar, rascunho de resposta) sem nunca concluir culpa nem escrever ao autor sozinho.

import { eq } from "drizzle-orm"
import { HTTPException } from "hono/http-exception"
import { z } from "zod/v4"
import { channelReports, type ChannelCopilotAnalysis } from "../db/schema"
import { loadThread } from "../channel-thread"
import { DIMENSIONS, type DimensionId } from "@/lib/methodology"
import { categoryLabel } from "@/lib/channel"
import { runAgent, type AgentContext } from "./client"

export const CHANNEL_PROMPT_VERSION = "canal-2026-10-21"
const dimensionIds = DIMENSIONS.map((d) => d.id) as [DimensionId, ...DimensionId[]]

const schema = z.object({
  summary: z.string().describe("Resumo do caso em até 5 frases: fatos relatados, contexto, recorrência, testemunhas, o que o autor pede"),
  framing: z.string().describe("Enquadramento: que tipo de situação os fatos indicam (indícios, não conclusão) e as obrigações da empresa"),
  legalRefs: z.array(z.string()).describe("Referências normativas pertinentes, ex.: 'Lei 14.457/2022 (prevenção ao assédio)'"),
  questionsToAsk: z.array(z.string()).describe("2 a 4 perguntas que o RH ainda precisa fazer ao autor, sem pedir identificação"),
  replyDraft: z.string().describe("Rascunho de resposta ao autor: acolhedor, sem prometer resultado, sem pedir dados que o identifiquem, com prazo de retorno"),
  suggestedAction: z
    .object({ dimension: z.enum(dimensionIds), what: z.string(), why: z.string() })
    .nullable()
    .describe("Ação organizacional para o plano quando o relato indica causa na organização do trabalho; null se não couber"),
})

const SYSTEM = `Você é o copiloto do canal de relato anônimo do Equilibra, usado pelo RH de pequenas e médias empresas brasileiras.
Você lê um relato e a conversa com o autor (que é anônimo e acompanha pelo protocolo) e ajuda o RH a entender e conduzir o caso.

Faça:
- Um resumo objetivo dos fatos relatados, em até 5 frases, sem adjetivos e sem conclusões.
- O enquadramento: que tipo de situação os fatos indicam (fale em "indícios"), o que a empresa deve fazer (apuração com sigilo, não retaliação, prazos razoáveis) e as referências normativas pertinentes (por exemplo, Lei 14.457/2022 para prevenção e combate ao assédio, NR-1 para riscos psicossociais, CLT). Deixe claro que não é parecer jurídico.
- As perguntas que ainda faltam para entender o caso (quando, onde, frequência, se há registros), sem pedir nada que identifique o autor.
- Um rascunho de resposta ao autor: acolhedor, curto, sem prometer resultado, sem pedir nome, setor, telefone ou outros dados que o identifiquem, informando um prazo de retorno.
- Quando o relato apontar causa na organização do trabalho (metas, escala, sobrecarga, falta de regras, cobrança da liderança), sugira uma ação organizacional para o plano de ação.

Nunca:
- Conclua que alguém é culpado, nem recomende punir, demitir ou expor pessoas.
- Repita nomes, apelidos ou cargos únicos de pessoas citadas: refira-se a elas por papel ("a supervisão do turno", "um colega").
- Faça diagnóstico de saúde de quem relatou.
Português do Brasil.`

const ASKS_IDENTITY = /(seu nome|qual (é )?o seu nome|identifi(que|car)-?se|se identific|sua matr[íi]cula|seu telefone|seu e-?mail|seu setor|em qual setor voc[êe])/i
const PUNITIVE = /\b(demit|demiss|puni[rçc]|advert[êe]ncia|justa causa|expor )/i
const EMERGENCY_LINE =
  "Risco imediato indicado na triagem: priorize a segurança. Se houver ameaça à vida ou à integridade, oriente o contato com o SAMU 192, a polícia 190 ou o CVV 188 e acione a liderança responsável hoje, antes de qualquer outra providência."

export async function analyzeReport(ctx: AgentContext, reportId: string): Promise<ChannelCopilotAnalysis> {
  const report = await ctx.db.query.channelReports.findFirst({ where: eq(channelReports.id, reportId) })
  if (!report || report.companyId !== ctx.companyId) throw new HTTPException(404, { message: "Relato não encontrado" })
  const thread = await loadThread(ctx.db, report.id, true)
  const t = report.triage
  const emergency = Boolean(t && t.urgent >= 0.5)
  const identifies = Boolean(t && t.identifiesPeople >= 0.5)
  const state = {
    categoria_informada: categoryLabel(report.category),
    triagem: t ? { gravidade_0a3: Math.round(t.severity * 10) / 10, risco_imediato: emergency, pode_identificar_pessoas: identifies } : null,
    relato: report.body,
    conversa: thread.map((m) => ({ quem: m.author === "reporter" ? "autor" : m.author === "hr" ? "RH" : "nota interna do RH", dia: m.day, texto: m.body })),
  }
  const { runId, output } = await runAgent(ctx, {
    agent: "channel-copilot",
    promptVersion: CHANNEL_PROMPT_VERSION,
    system: SYSTEM,
    schema,
    input: { reportId, messages: thread.length },
    maxTokens: 6000,
    messages: [{ role: "user", content: `Caso (JSON):\n${JSON.stringify(state)}` }],
  })

  // Verificações em código, depois da geração.
  const warnings: string[] = []
  let replyDraft = output.replyDraft.trim()
  if (ASKS_IDENTITY.test(replyDraft)) {
    warnings.push("O rascunho pedia um dado que poderia identificar o autor e foi descartado. Escreva a resposta sem pedir identificação.")
    replyDraft = ""
  }
  let suggestedAction = output.suggestedAction
  if (suggestedAction && PUNITIVE.test(`${suggestedAction.what} ${suggestedAction.why}`)) {
    warnings.push("A ação sugerida recomendava medida contra pessoas e foi descartada.")
    suggestedAction = null
  }
  if (identifies) warnings.push("O relato pode identificar pessoas: trate com sigilo e não repasse o texto original.")
  const analysis: ChannelCopilotAnalysis = {
    summary: output.summary.trim(),
    framing: `${output.framing.trim()} Não é parecer jurídico.`,
    legalRefs: output.legalRefs.slice(0, 5),
    questionsToAsk: output.questionsToAsk.filter((q) => !ASKS_IDENTITY.test(q)).slice(0, 4),
    replyDraft,
    suggestedAction,
    emergency,
    warnings: emergency ? [EMERGENCY_LINE, ...warnings] : warnings,
    runId,
  }
  await ctx.db.update(channelReports).set({ copilot: analysis, copilotAt: new Date() }).where(eq(channelReports.id, report.id))
  return analysis
}

