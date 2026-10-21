// Copiloto do plano de ação: lê os agregados que o gestor já vê (k = 5), responde perguntas sobre os
// dados citando os números e propõe ações completas no formato 5W2H. Nunca executa: o gestor salva.

import { and, desc, eq } from "drizzle-orm"
import { z } from "zod/v4"
import type { Db } from "../db"
import { actions, campaigns, questionnaireVersions, questionnaires, sectors } from "../db/schema"
import { computeDimension, computeHistory, computeInsights } from "../insights"
import { DIMENSIONS, K_ANONYMITY, type DimensionId } from "@/lib/methodology"
import { runAgent, type AgentContext } from "./client"

export const PLAN_PROMPT_VERSION = "plano-2026-10-21"
const dimensionIds = DIMENSIONS.map((d) => d.id) as [DimensionId, ...DimensionId[]]

export const planAnswerSchema = z.object({
  answer: z.string().describe("Resposta ao gestor em português, 2 a 6 frases, citando os números usados"),
  citedNumbers: z.array(z.string()).describe("Os números dos dados que sustentam a resposta, ex.: 'Reconhecimento no Balcão: 34 → 48'"),
  actions: z
    .array(
      z.object({
        dimension: z.enum(dimensionIds),
        sectorKey: z.string().nullable().describe("id do setor dos dados, ou null para a empresa toda"),
        what: z.string().describe("O quê: a ação, começando por verbo"),
        why: z.string().describe("Por quê: o dado que motiva a ação"),
        who: z.string().describe("Quem: função responsável (não nomes de pessoas)"),
        dueInDays: z.number().describe("Prazo sugerido em dias a partir de hoje"),
        how: z.string().describe("Como: passos concretos em uma ou duas frases"),
        cost: z.string().describe("Quanto: custo estimado, ex.: 'R$ 0 · 2 h da liderança'"),
        steps: z.array(z.string()).describe("2 a 5 etapas curtas para acompanhar"),
      })
    )
    .describe("0 a 3 ações propostas; vazio quando a pergunta não pede ação"),
})

const SYSTEM = `Você é o copiloto do plano de ação do Equilibra, sistema brasileiro de gestão de riscos psicossociais (NR-1) para pequenas e médias empresas.
Você recebe os dados agregados da avaliação psicossocial da empresa (scores de 0 = sem risco a 100 = risco máximo; baixo < 25, moderado 25–49, alto 50–74, crítico ≥ 75), por dimensão e por setor, os itens com maior risco, o histórico entre campanhas e as ações que já estão no plano.

Como responder:
- Responda à pergunta do gestor em português claro, em 2 a 6 frases, e cite os números que sustentam a leitura. Não invente números: use só os que estão nos dados.
- Diga o que os dados não mostram quando for o caso (questionário não explica causas sozinho; sugira conversar com a equipe ou observar a rotina).
- Proponha no máximo 3 ações, só quando a pergunta pedir ou quando houver risco alto sem ação no plano. Cada ação segue o 5W2H, é organizacional (muda a organização do trabalho, a gestão, a comunicação, as metas, a escala) e evita duplicar ações já existentes.
- Prefira ações de baixo custo quando o gestor citar orçamento curto, e indique o custo de forma honesta.

Limites obrigatórios:
- Nunca recomende demitir, advertir, punir, transferir ou investigar pessoas; o foco é a organização do trabalho.
- Nunca tente identificar quem respondeu, nem infira nada sobre grupos com menos de ${K_ANONYMITY} respostas (eles não aparecem nos dados e você deve dizer isso se perguntarem).
- Não faça diagnóstico de saúde de pessoas.
- Em "who", use funções (RH, liderança do setor, diretoria), nunca nomes.`

/** Monta o contexto agregado (o mesmo que o gestor já vê no painel) para o copiloto. */
export async function planContext(db: Db, companyId: string, campaignId?: string) {
  let id = campaignId
  if (!id) {
    const [latest] = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .innerJoin(questionnaireVersions, eq(questionnaireVersions.id, campaigns.questionnaireVersionId))
      .innerJoin(questionnaires, eq(questionnaires.id, questionnaireVersions.questionnaireId))
      .where(and(eq(campaigns.companyId, companyId), eq(questionnaires.kind, "nr1")))
      .orderBy(desc(campaigns.createdAt))
      .limit(1)
    id = latest?.id
  }
  if (!id) return null
  const data = await computeInsights(db, companyId, id)
  if (!data || data.totals.responses < K_ANONYMITY) return null
  const [history, plan, sectorList] = await Promise.all([
    computeHistory(db, companyId),
    db.select().from(actions).where(eq(actions.companyId, companyId)),
    db.select({ id: sectors.id, name: sectors.name }).from(sectors).where(eq(sectors.companyId, companyId)),
  ])
  const top = data.ranking.filter((r) => r.score >= 25).slice(0, 4)
  const worstItems = await Promise.all(
    top.map(async (r) => {
      const detail = await computeDimension(db, companyId, id!, r.id)
      return { dimensao: r.name, itens: (detail?.items ?? []).slice(0, 3).map((i) => ({ texto: i.text, risco: i.risk })) }
    })
  )
  return {
    campaignId: id,
    state: {
      campanha: { nome: data.campaign.name, inicio: data.campaign.startsAt, respostas: data.totals.responses, participacao_pct: data.totals.rate, indice_geral: data.totals.index },
      dimensoes: data.ranking.map((r) => ({ id: r.id, nome: r.name, score: r.score, nivel: r.level })),
      setores: data.heatmap.map((h) => ({ id: h.grouped ? null : h.key, nome: h.label, respostas: h.responses, scores: h.scores })),
      itens_mais_criticos: worstItems,
      historico: history.map((p) => ({ campanha: p.name, inicio: p.startsAt, indice: p.index, scores: p.scores })),
      plano_atual: plan.map((a) => ({ o_que: a.what, dimensao: a.dimension, setor: sectorList.find((s) => s.id === a.sectorId)?.name ?? "Toda a empresa", status: a.status, prazo: a.due || null })),
    },
    sectorIds: new Set(sectorList.map((s) => s.id)),
  }
}

const PUNITIVE = /\b(demit|demiss|advert|puni|transferir (o|a) |investigar (o|a) |afastar (o|a) |desligar)/i

export async function askPlanCopilot(ctx: AgentContext, input: { question: string; campaignId?: string }) {
  const context = await planContext(ctx.db, ctx.companyId, input.campaignId)
  if (!context) return { runId: null, answer: "Ainda não há uma campanha com pelo menos 5 respostas. Lance a avaliação e volte quando houver dados.", citedNumbers: [], actions: [], warnings: [] }
  const { runId, output } = await runAgent(ctx, {
    agent: "plan-copilot",
    promptVersion: PLAN_PROMPT_VERSION,
    system: SYSTEM,
    schema: planAnswerSchema,
    input: { question: input.question, campaignId: context.campaignId },
    messages: [{ role: "user", content: `Dados da empresa (JSON):\n${JSON.stringify(context.state)}\n\nPergunta do gestor: ${input.question}` }],
  })
  // Verificações em código: nada punitivo, no máximo 3 ações, setor precisa existir.
  const warnings: string[] = []
  const proposed = output.actions.slice(0, 3).filter((a) => {
    if (PUNITIVE.test(`${a.what} ${a.how}`)) {
      warnings.push("Uma sugestão foi descartada por recomendar medida contra pessoas.")
      return false
    }
    return true
  })
  return {
    runId,
    answer: output.answer,
    citedNumbers: output.citedNumbers,
    actions: proposed.map((a) => ({ ...a, sectorKey: a.sectorKey && context.sectorIds.has(a.sectorKey) ? a.sectorKey : null, dueInDays: Math.min(365, Math.max(1, Math.round(a.dueInDays))), steps: a.steps.slice(0, 5) })),
    warnings,
  }
}
