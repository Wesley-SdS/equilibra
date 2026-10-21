// Módulo comum dos copilotos (IA generativa). Toda chamada passa por aqui:
//   - credencial: ANTHROPIC_API_KEY (direto na Anthropic) ou o Vercel AI Gateway (AI_GATEWAY_API_KEY ou OIDC na Vercel);
//   - cota mensal do plano (agent_runs) e bloqueio no excedente;
//   - saída estruturada validada por Zod (output_config.format) — nada vira registro sem passar pelo schema;
//   - registro em agent_runs (hash da entrada, saída, modelo, tokens, latência) e na trilha de auditoria.
// Sem credencial, `agentsAvailable()` é false e as telas escondem os copilotos: o fluxo manual segue igual.
// O Jev (decisões tipadas) continua separado em ../jev.ts.

import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { createHash } from "node:crypto"
import { HTTPException } from "hono/http-exception"
import type { z } from "zod/v4"
import type { Db } from "../db"
import { agentRuns } from "../db/schema"
import { assertLimit } from "../billing"
import { log } from "../log"

const GATEWAY_URL = process.env.AI_GATEWAY_ANTHROPIC_URL ?? "https://ai-gateway.vercel.sh"

export type AgentMode = "anthropic" | "gateway" | "off"

export function agentMode(): AgentMode {
  if (process.env.AGENTS_DISABLED === "1") return "off"
  if (process.env.ANTHROPIC_API_KEY) return "anthropic"
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL) return "gateway"
  return "off"
}

export function agentsAvailable() {
  return agentMode() !== "off" || testRunner !== null
}

/** Modelo: Claude Opus 5.5. No Gateway o id tem o prefixo do provedor. */
export function agentModel() {
  if (process.env.AGENT_MODEL) return process.env.AGENT_MODEL
  return agentMode() === "gateway" ? "anthropic/claude-opus-5.5" : "claude-opus-5-5"
}

async function gatewayToken(): Promise<string | null> {
  if (process.env.AI_GATEWAY_API_KEY) return process.env.AI_GATEWAY_API_KEY
  if (!process.env.VERCEL) return null
  try {
    const { getVercelOidcToken } = await import("@vercel/oidc")
    return await getVercelOidcToken()
  } catch (err) {
    log.warn("agents.oidc_indisponivel", { err })
    return null
  }
}

async function makeClient(): Promise<Anthropic | null> {
  const mode = agentMode()
  if (mode === "anthropic") return new Anthropic({ timeout: 60_000, maxRetries: 1 })
  if (mode === "gateway") {
    const token = await gatewayToken()
    if (!token) return null
    // O Gateway aceita o token no cabeçalho Authorization (Bearer).
    return new Anthropic({ apiKey: null, authToken: token, baseURL: GATEWAY_URL, timeout: 60_000, maxRetries: 1 })
  }
  return null
}

/** Resultado bruto de uma geração (o que o modelo devolveu, antes da validação). */
export type RawGeneration = { output: unknown; stopReason: string | null; model: string; inputTokens: number; outputTokens: number }
export type AgentRunner = (req: { system: string; messages: Anthropic.MessageParam[]; schema: z.ZodType; maxTokens: number }) => Promise<RawGeneration>

/** Nos testes, substitui a chamada ao modelo por uma função determinística. */
let testRunner: AgentRunner | null = null
export function setAgentRunner(runner: AgentRunner | null) {
  testRunner = runner
}

/** Chamada real ao modelo, sem cota nem registro (usada pela avaliação de segurança em scripts/). */
export const anthropicRunner: AgentRunner = async ({ system, messages, schema, maxTokens }) => {
  const client = await makeClient()
  if (!client) throw new HTTPException(503, { message: "Os copilotos não estão configurados neste ambiente." })
  const response = await client.messages.parse({
    model: agentModel(),
    max_tokens: maxTokens,
    system,
    messages,
    // Opus 5.5: pensamento adaptativo sempre ligado; o esforço controla a profundidade (padrão medium).
    output_config: { effort: "medium", format: zodOutputFormat(schema) },
  })
  return {
    output: response.parsed_output,
    stopReason: response.stop_reason,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
}

export type AgentContext = { db: Db; companyId: string; userId: string | null }

/**
 * Executa um agente: confere a cota, chama o modelo, valida a saída com o schema e registra a
 * execução. Erros do modelo viram mensagens amigáveis; o chamador recebe `{ runId, output }`.
 */
export async function runAgent<S extends z.ZodType>(
  ctx: AgentContext,
  params: {
    agent: string
    promptVersion: string
    system: string
    messages: Anthropic.MessageParam[]
    schema: S
    input: unknown
    maxTokens?: number
    /** Espaço de escuta: não consome a cota dos copilotos do RH (tem limite próprio). */
    skipQuota?: boolean
    /** false = não guarda a saída em agent_runs (conversa do trabalhador nunca é gravada em claro). */
    storeOutput?: boolean
  }
): Promise<{ runId: string; output: z.infer<S> }> {
  if (!agentsAvailable()) throw new HTTPException(503, { message: "Os copilotos não estão configurados neste ambiente." })
  if (!params.skipQuota) await assertLimit(ctx.db, ctx.companyId, "agentRuns", 1)
  const inputHash = createHash("sha256").update(JSON.stringify(params.input)).digest("hex")
  const started = Date.now()
  const record = async (status: "ok" | "refused" | "error", gen: Partial<RawGeneration> | null, output: unknown) => {
    const [row] = await ctx.db
      .insert(agentRuns)
      .values({
        companyId: ctx.companyId,
        userId: ctx.userId,
        agent: params.agent,
        promptVersion: params.promptVersion,
        inputHash,
        output: params.storeOutput === false ? null : (output ?? null),
        model: gen?.model ?? agentModel(),
        status,
        inputTokens: gen?.inputTokens ?? 0,
        outputTokens: gen?.outputTokens ?? 0,
        latencyMs: Date.now() - started,
      })
      .returning({ id: agentRuns.id })
    return row!.id
  }

  let gen: RawGeneration
  try {
    gen = await (testRunner ?? anthropicRunner)({ system: params.system, messages: params.messages, schema: params.schema, maxTokens: params.maxTokens ?? 8000 })
  } catch (err) {
    if (err instanceof HTTPException) throw err
    await record("error", null, null)
    if (err instanceof Anthropic.RateLimitError) throw new HTTPException(429, { message: "O copiloto está com muita demanda agora. Tente de novo em instantes." })
    if (err instanceof Anthropic.APIError) log.error("agents.api_erro", { agent: params.agent, status: err.status, err: err.message })
    else log.error("agents.falha", { agent: params.agent, err })
    throw new HTTPException(502, { message: "O copiloto não respondeu. Tente de novo; o fluxo manual continua disponível." })
  }
  if (gen.stopReason === "refusal") {
    await record("refused", gen, null)
    throw new HTTPException(422, { message: "O copiloto não pode ajudar com este pedido. Reformule ou siga pelo fluxo manual." })
  }
  const parsed = params.schema.safeParse(gen.output)
  if (!parsed.success) {
    await record("error", gen, null)
    log.warn("agents.saida_invalida", { agent: params.agent, issues: parsed.error.issues.slice(0, 3) })
    throw new HTTPException(502, { message: "A resposta do copiloto veio incompleta. Tente de novo." })
  }
  const runId = await record("ok", gen, parsed.data)
  return { runId, output: parsed.data }
}
