// Copiloto de questionários: o gestor descreve uma dor e recebe um rascunho de questionário.
// Regras do PRD v2 (frente 2), no prompt E verificadas em código depois da geração.

import { z } from "zod/v4"
import { DIMENSIONS, type DimensionId } from "@/lib/methodology"
import { MAX_ITEMS, type QuestionnaireKind } from "@/lib/questionnaire"
import { classifyQuestion } from "../decisions"
import { jevEnabled } from "../jev"
import { runAgent, type AgentContext } from "./client"

export const QUESTIONNAIRE_PROMPT_VERSION = "questionarios-2026-10-19"

const dimensionIds = DIMENSIONS.map((d) => d.id) as [DimensionId, ...DimensionId[]]

export const questionnaireProposalSchema = z.object({
  objective: z.string().describe("Objetivo do questionário em uma frase"),
  audience: z.string().describe("Público sugerido (setor, função, grupo)"),
  suggestedName: z.string().describe("Nome curto para o questionário"),
  suggestedKind: z.enum(["pulso", "clima", "nr1", "livre"]),
  suggestAnonymous: z.boolean().describe("true quando o tema pede anonimato"),
  anonymityReason: z.string(),
  notMeasurable: z.string().describe("O que não dá para medir bem por questionário e como levantar (entrevista, grupo, observação)"),
  message: z.string().describe("Resposta curta ao gestor, em português, explicando a proposta ou o ajuste feito"),
  items: z
    .array(
      z.object({
        text: z.string().describe("Afirmação de frequência na primeira pessoa, respondida de Nunca a Sempre"),
        dimension: z.enum(dimensionIds).nullable().describe("Dimensão psicossocial ou null se for fora do score"),
        risk: z.boolean().describe("true = fator de risco (mais frequente é pior); false = fator de proteção"),
        rationale: z.string().describe("Por que este item mede a dor descrita, em uma frase"),
      })
    )
    .describe("Entre 6 e 15 itens"),
})
export type QuestionnaireProposal = z.infer<typeof questionnaireProposalSchema>

const SYSTEM = `Você é o copiloto de questionários do Equilibra, um sistema brasileiro de gestão de riscos psicossociais do trabalho (NR-1).
Você ajuda gestores de pequenas e médias empresas que conhecem uma dor da equipe, mas não sabem escrever perguntas.

Como escrever os itens:
- Cada item é uma afirmação curta na primeira pessoa, respondida numa escala de frequência (Nunca, Raramente, Às vezes, Frequentemente, Sempre). Ex.: "Recebo mensagens de trabalho fora do meu horário."
- Um assunto por item, linguagem simples de chão de fábrica e balcão, no máximo 140 caracteres.
- Classifique cada item numa das dimensões: ${DIMENSIONS.map((d) => `${d.id} (${d.name})`).join(", ")}; use null só para itens operacionais fora do risco psicossocial.
- risk=true quando o item descreve um fator de risco (mais frequente é pior); risk=false quando descreve proteção (mais frequente é melhor). Misture os dois.
- Proponha entre 6 e 15 itens; nunca mais de ${MAX_ITEMS}.

Limites obrigatórios:
- Avalie as condições e a organização do trabalho, nunca a saúde de uma pessoa: nada de sintomas, diagnósticos, medicação, transtornos ou histórico médico.
- Nunca cite nomes de pessoas, apelidos ou cargos únicos que identifiquem alguém. Se o gestor citar uma pessoa, reescreva o item de forma geral ("minha liderança", "a supervisão") e avise na mensagem.
- Quando o tema envolver assédio, liderança, cobrança ou medo de retaliação, sugira anonimato (suggestAnonymous=true) e explique.
- Questionários do tipo nr1 são sempre anônimos.
- Diga em notMeasurable o que o questionário não captura bem; o Ministério do Trabalho orienta complementar questionários com observação e diálogo com os trabalhadores.

Quando receber um rascunho e um pedido de ajuste, devolva o questionário inteiro já ajustado, mantendo os itens que não precisam mudar com o mesmo texto.
Responda sempre em português do Brasil.`

const HEALTH = /\b(depress|ansiedade (diagnosticada|cronica)|transtorno|diagnostic|medicament|remedio|psiquiatr|cid\b|burnout diagnosticado|tentativa de suicidio|terapia que faco)/i
// Nome próprio depois de palavra de cargo: "supervisor João", "a gerente Maria".
const NAMED_PERSON = /\b(chefe|supervisor[a]?|gerente|lider|líder|coordenador[a]?|encarregad[oa]|diretor[a]?|gestor[a]?|colega)\s+(?:[a-zà-ú]+\s+)?[A-ZÀ-Ú][a-zà-ú]{2,}/

export type CopilotItem = QuestionnaireProposal["items"][number] & { flags: string[]; engine: "copiloto" | "jev" }

/** Verificações em código depois da geração: saúde individual, nomes de pessoas e limite de itens. */
export function enforceRules(proposal: QuestionnaireProposal, kind: QuestionnaireKind | undefined) {
  const warnings: string[] = []
  const items: CopilotItem[] = []
  for (const it of proposal.items) {
    const text = it.text.trim().replace(/\s+/g, " ").slice(0, 200)
    if (HEALTH.test(text.normalize("NFD").replace(/[̀-ͯ]/g, ""))) {
      warnings.push(`Item removido por tratar de saúde individual: “${text}”.`)
      continue
    }
    const flags: string[] = []
    if (NAMED_PERSON.test(text)) flags.push("Parece citar uma pessoa: reescreva de forma geral antes de aceitar.")
    if (text.length < 8) continue
    items.push({ ...it, text, flags, engine: "copiloto" })
  }
  if (items.length > MAX_ITEMS) {
    warnings.push(`O questionário foi limitado a ${MAX_ITEMS} itens.`)
    items.length = MAX_ITEMS
  }
  const anonymous = kind === "nr1" ? true : proposal.suggestAnonymous
  return { ...proposal, suggestAnonymous: anonymous, items, warnings }
}

/** Confere a dimensão de cada item com o Jev (quando houver credencial); o Jev prevalece se estiver confiante. */
async function crossCheckWithJev(items: CopilotItem[]) {
  if (!jevEnabled()) return items
  const checked = await Promise.all(items.map((it) => classifyQuestion(it.text)))
  return items.map((it, i) => {
    const jev = checked[i]!
    if (jev.confidence !== null && jev.confidence >= 75 && jev.dimension !== it.dimension) return { ...it, dimension: jev.dimension, engine: "jev" as const }
    return it
  })
}

export async function proposeQuestionnaire(
  ctx: AgentContext,
  input: { pain: string; instruction?: string; draft?: { name: string; kind: QuestionnaireKind; items: { text: string; dimension: DimensionId | null; risk: boolean }[] } }
) {
  const draft = input.draft?.items.length
    ? `\n\nRascunho atual (${input.draft.kind}, "${input.draft.name}"):\n${input.draft.items.map((it, i) => `${String(i + 1).padStart(2, "0")}. ${it.text} [${it.dimension ?? "fora do score"}, ${it.risk ? "risco" : "proteção"}]`).join("\n")}`
    : ""
  const ask = input.instruction ? `\n\nPedido de ajuste do gestor: ${input.instruction}` : ""
  const { runId, output } = await runAgent(ctx, {
    agent: "questionnaire-copilot",
    promptVersion: QUESTIONNAIRE_PROMPT_VERSION,
    system: SYSTEM,
    schema: questionnaireProposalSchema,
    input,
    messages: [{ role: "user", content: `Dor descrita pelo gestor: ${input.pain}${draft}${ask}` }],
  })
  const enforced = enforceRules(output, input.draft?.kind)
  return { runId, ...enforced, items: await crossCheckWithJev(enforced.items) }
}
