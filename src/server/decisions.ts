// Decisões automáticas do Equilibra. Cada função tenta o Jev (TypeSafe, via Vercel AI Gateway)
// primeiro e, sem credencial do Gateway ou em caso de falha, usa regras locais — o resultado registra qual motor decidiu.
// O score de risco NR-1 NÃO passa por aqui: ele é determinístico (src/lib/methodology.ts).

import type { Decision, Triage } from "./db/schema"
import { choice, jevDecide, noul, rankedChoices, score } from "./jev"
import { CHANNEL_CATEGORIES } from "@/lib/channel"
import { ACTION_LIBRARY, DIMENSIONS, type DimensionId } from "@/lib/methodology"

const SEVERITY_RUBRIC = [
  "Baixa: desconforto pontual, sem repetição nem dano evidente",
  "Média: situação recorrente que afeta o bem-estar ou o trabalho",
  "Alta: assédio, humilhação, discriminação ou sobrecarga grave e contínua",
  "Crítica: ameaça, violência, assédio sexual ou risco à saúde/integridade",
]

// ---------------------------------------------------------------- canal de relato

const CATEGORY_CRITERIA = {
  assedio_moral: "Humilhação, gritos, ameaças, perseguição, isolamento proposital ou cobrança abusiva",
  assedio_sexual: "Comentários, toques, convites ou investidas de cunho sexual não desejados",
  discriminacao: "Tratamento desigual por raça, gênero, orientação, idade, religião, deficiência ou origem",
  sobrecarga: "Excesso de trabalho, jornada abusiva, metas impossíveis, falta de pausas",
  conflito: "Desentendimentos ou conflitos entre colegas ou com a liderança, sem assédio",
  outro: "Qualquer outro problema relacionado ao trabalho",
} satisfies Record<(typeof CHANNEL_CATEGORIES)[number]["id"], string>

/** Triagem de um relato anônimo: categoria, gravidade, urgência e identificação de pessoas. */
export async function triageReport(body: string, declaredCategory: string): Promise<Triage> {
  const result = await jevDecide(
    { relato: body, categoria_informada_por_quem_relatou: declaredCategory },
    {
      category: choice("Qual categoria descreve melhor o relato", CATEGORY_CRITERIA),
      severity: score("Gravidade da situação relatada para a saúde de quem trabalha", SEVERITY_RUBRIC),
      urgent: noul("O relato indica risco imediato à integridade física ou psicológica de alguém e exige ação nas próximas 24 horas"),
      identifiesPeople: noul("O texto permite identificar pessoas específicas (nomes, apelidos ou cargos únicos)"),
    }
  )
  if (result) {
    const a = result.answers
    return {
      engine: "jev",
      model: result.model,
      confidence: a.category.confidence,
      category: a.category.choice,
      categoryConfidence: a.category.confidence,
      severity: a.severity.score,
      urgent: a.urgent.noul,
      identifiesPeople: a.identifiesPeople.noul,
    }
  }
  return triageByRules(body, declaredCategory)
}

/** Regras de reserva (sem Jev): palavras-chave simples, deliberadamente conservadoras. */
export function triageByRules(body: string, declaredCategory: string): Triage {
  const t = body
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
  const has = (...words: string[]) => words.some((w) => t.includes(w))
  const critical = has("ameac", "agred", "bate", "soco", "violen", "estupr", "suicid", "me matar", "assedio sexual", "passou a mao", "toque")
  const high = has("grit", "humilh", "xing", "persegu", "discrimin", "racis", "homofob", "machis", "desconta", "ameaca")
  const medium = has("sobrecarg", "hora extra", "sem pausa", "exaust", "cansad", "meta", "pressao")
  const severity = critical ? 3 : high ? 2 : medium ? 1 : 0.5
  return {
    engine: "regras",
    category: declaredCategory,
    severity,
    urgent: critical ? 0.8 : 0.1,
    // Palavra com inicial maiúscula fora do começo de frase sugere um nome próprio.
    identifiesPeople: /(?<![.!?]\s|^)\b[A-ZÀ-Ú][a-zà-ú]{2,}/m.test(body) ? 0.5 : 0.1,
  }
}

/** Prioridade de atendimento na fila do RH (0–100). */
export function triagePriority(t: Triage | null | undefined) {
  if (!t) return 0
  return Math.round(Math.min(100, (t.severity / 3) * 70 + t.urgent * 30))
}

// ---------------------------------------------------------------- plano de ação

export type ActionContext = {
  dimension: DimensionId
  score: number
  worstSectors: { label: string; score: number }[]
  worstItems: string[]
  existing: string[]
}

/**
 * Escolhe as ações da biblioteca mais adequadas ao contexto real da empresa.
 * Com Jev: ranqueia pelas probabilidades da escolha. Sem Jev: ordem da biblioteca.
 */
export async function chooseActions(ctx: ActionContext, take = 2): Promise<{ what: string; how: string; decision: Decision }[]> {
  const library = ACTION_LIBRARY[ctx.dimension].filter((a) => !ctx.existing.includes(a.what))
  if (!library.length) return []
  const dim = DIMENSIONS.find((d) => d.id === ctx.dimension)!
  const criteria = Object.fromEntries(library.map((a, i) => [`a${i}`, `${a.what}. Como: ${a.how}`])) as Record<string, string>

  const result =
    library.length > 1
      ? await jevDecide(
          {
            dimensao: dim.name,
            score_de_risco: ctx.score,
            setores_mais_expostos: ctx.worstSectors,
            itens_com_maior_risco: ctx.worstItems,
          },
          { best: choice(`Qual medida de prevenção tem maior impacto para reduzir o risco de "${dim.name}" neste contexto`, criteria) }
        )
      : null

  if (result) {
    const ranked = rankedChoices(result.answers.best)
    return ranked.slice(0, take).map(({ key, p }) => {
      const a = library[Number(key.slice(1))]!
      return { ...a, decision: { engine: "jev", model: result.model, confidence: Math.round(p * 100) / 100 } }
    })
  }
  return library.slice(0, take).map((a) => ({ ...a, decision: { engine: "regras" } }))
}

// ---------------------------------------------------------------- perguntas da empresa

/** Indica a dimensão psicossocial mais próxima de uma pergunta criada pela empresa (informativo). */
export async function classifyQuestion(text: string): Promise<{ dimension: DimensionId | null; confidence: number | null }> {
  const criteria = Object.fromEntries(DIMENSIONS.map((d) => [d.id, d.name])) as Record<DimensionId, string>
  const result = await jevDecide(
    { pergunta: text },
    {
      dimension: choice("A qual dimensão de risco psicossocial esta pergunta mais se relaciona", { ...criteria, nenhuma: "Nenhuma: é sobre outro assunto (estrutura, benefícios, processos)" }),
    }
  )
  if (!result) return { dimension: null, confidence: null }
  const a = result.answers.dimension
  return a.choice === "nenhuma" ? { dimension: null, confidence: Math.round(a.confidence * 100) } : { dimension: a.choice as DimensionId, confidence: Math.round(a.confidence * 100) }
}
