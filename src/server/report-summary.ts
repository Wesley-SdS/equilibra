// Resumo executivo do relatório PGR: uma página que responde em 1 minuto o que a direção e o auditor
// precisam saber. O copiloto escreve a partir dos agregados; sem IA, um texto por regras.

import { z } from "zod/v4"
import type { Db } from "./db"
import type { Report } from "./report"
import { computeEvolution } from "./evolution"
import { runAgent, agentsAvailable, type AgentContext } from "./agents/client"
import { RISK_LEVELS } from "@/lib/methodology"

export const SUMMARY_PROMPT_VERSION = "resumo-pgr-2026-10-21"

const STATUS = { todo: "a fazer", doing: "em andamento", done: "concluída" } as const

/** Fatos objetivos do relatório, usados pelas regras e enviados ao copiloto. */
export async function summaryFacts(db: Db, companyId: string, report: Report) {
  const ins = report.insights!
  const evo = await computeEvolution(db, companyId, { toId: ins.campaign.id })
  const high = ins.ranking.filter((r) => r.score >= 50)
  const today = new Date().toISOString().slice(0, 10)
  return {
    empresa: report.company.name,
    campanha: ins.campaign.name,
    respostas: ins.totals.responses,
    participacao_pct: ins.totals.rate,
    indice: ins.totals.index,
    nivel: RISK_LEVELS[ins.totals.level].label,
    variacao: evo.enough ? { de: evo.from.name, indice_anterior: evo.from.index, delta: evo.kpis.delta, leitura: evo.lead } : null,
    principais_riscos: ins.ranking.slice(0, 3).map((r) => ({ dimensao: r.name, score: r.score, nivel: RISK_LEVELS[r.level].label })),
    dimensoes_alto_ou_critico: high.map((r) => r.name),
    setores_mais_expostos: ins.heatmap
      .flatMap((h) => ins.ranking.map((r) => ({ setor: h.label, dimensao: r.name, score: h.scores[r.id] ?? 0 })))
      .filter((x) => x.score >= 50)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4),
    plano: report.plan.map((a) => ({ acao: a.what, dimensao: a.dimension, status: STATUS[a.status], atrasada: a.status !== "done" && !!a.due && a.due < today })),
    riscos_sem_acao: high.filter((r) => !report.plan.some((a) => a.dimension === r.id && a.status !== "done")).map((r) => r.name),
  }
}

/** Resumo por regras (funciona sem IA). */
export function rulesSummary(f: Awaited<ReturnType<typeof summaryFacts>>) {
  const parts: string[] = []
  parts.push(
    `Em ${f.campanha}, ${f.respostas} pessoas responderam (${f.participacao_pct}% de participação) e o índice geral de risco psicossocial ficou em ${f.indice}/100, nível ${f.nivel.toLowerCase()}${
      f.variacao ? `, ${f.variacao.delta < -2 ? `queda de ${-f.variacao.delta} pontos` : f.variacao.delta > 2 ? `alta de ${f.variacao.delta} pontos` : "estável"} em relação a ${f.variacao.de}` : ""
    }.`
  )
  if (f.dimensoes_alto_ou_critico.length) {
    parts.push(`${f.dimensoes_alto_ou_critico.length === 1 ? "A dimensão" : "As dimensões"} em nível alto ou crítico: ${f.dimensoes_alto_ou_critico.join(", ")}.`)
  } else {
    parts.push("Nenhuma dimensão ficou em nível alto ou crítico.")
  }
  if (f.setores_mais_expostos.length) {
    const top = f.setores_mais_expostos[0]!
    parts.push(`O ponto mais exposto é ${top.dimensao} em ${top.setor} (${top.score}/100).`)
  }
  const open = f.plano.filter((a) => a.status !== "concluída")
  const late = f.plano.filter((a) => a.atrasada)
  parts.push(
    `O plano tem ${f.plano.length} ${f.plano.length === 1 ? "ação" : "ações"}, ${f.plano.length - open.length} concluída(s)${late.length ? ` e ${late.length} atrasada(s)` : ""}.`
  )
  if (f.riscos_sem_acao.length) parts.push(`Ainda não há ação aberta para: ${f.riscos_sem_acao.join(", ")}.`)
  return parts.join(" ")
}

const schema = z.object({ summary: z.string().describe("Resumo executivo em português, 4 a 7 frases, em prosa, sem listas") })

const SYSTEM = `Você escreve o resumo executivo da página 1 do relatório de riscos psicossociais (NR-1) de uma pequena ou média empresa brasileira.
Leitores: a direção da empresa e o auditor fiscal do trabalho. Eles precisam saber em 1 minuto: o nível de risco, se melhorou ou piorou, onde está o problema e se há ações cobrindo cada risco alto.
Regras: use só os números dos fatos recebidos, sem inventar; escreva 4 a 7 frases em prosa corrida, tom técnico e direto, sem adjetivos de marketing; cite os riscos sem ação aberta; não identifique pessoas; não faça diagnóstico de saúde. Português do Brasil.`

export async function generateSummary(ctx: AgentContext, report: Report) {
  const facts = await summaryFacts(ctx.db, ctx.companyId, report)
  if (!agentsAvailable()) return { text: rulesSummary(facts), engine: "regras" as const, runId: null }
  try {
    const { runId, output } = await runAgent(ctx, {
      agent: "report-summary",
      promptVersion: SUMMARY_PROMPT_VERSION,
      system: SYSTEM,
      schema,
      input: facts,
      maxTokens: 4000,
      messages: [{ role: "user", content: `Fatos do relatório (JSON):\n${JSON.stringify(facts)}` }],
    })
    return { text: output.summary.trim(), engine: "copiloto" as const, runId }
  } catch {
    // Sem cota ou com falha do modelo, o relatório não fica sem resumo.
    return { text: rulesSummary(facts), engine: "regras" as const, runId: null }
  }
}

