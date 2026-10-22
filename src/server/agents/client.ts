// Módulo comum dos copilotos (IA generativa). Toda chamada passa por aqui:
//   - modelo por agente, de qualquer provedor (Anthropic, Google ou OpenAI) pelo AI SDK:
//       AGENT_MODEL_<AGENTE> (ex.: AGENT_MODEL_IMPORT_EXTRACTOR=google/gemini-3.8-flash) > AGENT_MODEL > padrão;
//   - credencial: chave direta do provedor (ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, OPENAI_API_KEY)
//     ou o Vercel AI Gateway (AI_GATEWAY_API_KEY ou OIDC na Vercel), que atende os três;
//   - cota mensal do plano (agent_runs) e bloqueio no excedente;
//   - saída estruturada validada por Zod — nada vira registro sem passar pelo schema;
//   - registro em agent_runs (hash da entrada, saída, modelo, tokens, latência) e na trilha de auditoria.
// Sem credencial para o modelo do agente, `agentsAvailable()` é false e as telas escondem os copilotos.
// O Jev (decisões tipadas) continua separado em ../jev.ts.

import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogle } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { APICallError, Output, createGateway, generateText, type LanguageModel, type ModelMessage } from "ai"
import { createHash } from "node:crypto"
import { HTTPException } from "hono/http-exception"
import type { z } from "zod/v4"
import type { Db } from "../db"
import { agentRuns } from "../db/schema"
import { assertLimit } from "../billing"
import { log } from "../log"

/** Agentes do Equilibra. Cada um pode usar um modelo diferente. */
export const AGENTS = ["import-extractor", "questionnaire-copilot", "plan-copilot", "channel-copilot", "report-summary", "listening"] as const
export type AgentName = (typeof AGENTS)[number]

export type AgentProvider = "anthropic" | "google" | "openai"
const PROVIDERS: AgentProvider[] = ["anthropic", "google", "openai"]
const DIRECT_KEY: Record<AgentProvider, string> = { anthropic: "ANTHROPIC_API_KEY", google: "GOOGLE_GENERATIVE_AI_API_KEY", openai: "OPENAI_API_KEY" }

export const DEFAULT_MODEL = "anthropic/claude-opus-5.5"

/** Modelo do agente no formato "provedor/modelo" (o mesmo id do AI Gateway). */
export function agentModel(agent?: AgentName) {
  const own = agent ? process.env[`AGENT_MODEL_${agent.toUpperCase().replace(/-/g, "_")}`] : undefined
  const id = (own || process.env.AGENT_MODEL || DEFAULT_MODEL).trim()
  // Compatibilidade: id sem provedor (ex.: "claude-opus-5-5") é da Anthropic.
  return id.includes("/") ? id : `anthropic/${id}`
}

function parseModel(id: string): { provider: AgentProvider; name: string } {
  const [provider, ...rest] = id.split("/")
  if (!PROVIDERS.includes(provider as AgentProvider)) throw new Error(`Provedor de IA desconhecido em "${id}" (use anthropic/, google/ ou openai/)`)
  return { provider: provider as AgentProvider, name: rest.join("/") }
}

const gatewayConfigured = () => Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL)

function routeFor(model: string): "direct" | "gateway" | "off" {
  if (process.env.AGENTS_DISABLED === "1") return "off"
  if (process.env[DIRECT_KEY[parseModel(model).provider]]) return "direct"
  return gatewayConfigured() ? "gateway" : "off"
}

/** Como o agente chega ao modelo: chave direta do provedor, Gateway ou nenhum. */
export function agentRoute(agent?: AgentName): "direct" | "gateway" | "off" {
  try {
    return routeFor(agentModel(agent))
  } catch (err) {
    log.error("agents.modelo_invalido", { agent, err })
    return "off"
  }
}

export function agentsAvailable(agent?: AgentName) {
  return testRunner !== null || agentRoute(agent) !== "off"
}

function languageModel(id: string, route: "direct" | "gateway"): LanguageModel {
  if (route === "gateway") return createGateway()(id)
  const { provider, name } = parseModel(id)
  // Na API direta da Anthropic o id usa hífen onde o Gateway usa ponto (claude-opus-5.5 → claude-opus-5-5).
  if (provider === "anthropic") return createAnthropic()(name.replace(/\./g, "-"))
  if (provider === "google") return createGoogle()(name)
  return createOpenAI()(name)
}

/** Conteúdo neutro de provedor: texto e arquivos (PDF ou imagem em base64). */
export type AgentPart = { type: "text"; text: string } | { type: "file"; data: string; mediaType: string }
export type AgentMessage = { role: "user" | "assistant"; content: string | AgentPart[] }

function toModelMessages(messages: AgentMessage[]): ModelMessage[] {
  return messages.map((m): ModelMessage => {
    if (m.role === "assistant") return { role: "assistant", content: typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? p.text : "")).join("\n") }
    if (typeof m.content === "string") return { role: "user", content: m.content }
    return {
      role: "user",
      content: m.content.map((p) =>
        p.type === "text" ? p : p.mediaType.startsWith("image/") ? { type: "image" as const, image: p.data, mediaType: p.mediaType } : { type: "file" as const, data: p.data, mediaType: p.mediaType }
      ),
    }
  })
}

/** Resultado bruto de uma geração (o que o modelo devolveu, antes da validação). */
export type RawGeneration = { output: unknown; stopReason: string | null; model: string; inputTokens: number; outputTokens: number }
export type AgentRequest = { system: string; messages: AgentMessage[]; schema: z.ZodType; maxTokens: number; model: string }
export type AgentRunner = (req: AgentRequest) => Promise<RawGeneration>

/** Nos testes, substitui a chamada ao modelo por uma função determinística. */
let testRunner: AgentRunner | null = null
export function setAgentRunner(runner: AgentRunner | null) {
  testRunner = runner
}

/** Chamada real ao modelo, sem cota nem registro (também usada pela avaliação de segurança em scripts/). */
export const liveRunner: AgentRunner = async ({ system, messages, schema, maxTokens, model }) => {
  const route = routeFor(model)
  if (route === "off") throw new HTTPException(503, { message: "Os copilotos não estão configurados neste ambiente." })
  const result = await generateText({
    model: languageModel(model, route),
    system,
    messages: toModelMessages(messages),
    maxOutputTokens: maxTokens,
    maxRetries: 1,
    timeout: 60_000,
    output: Output.object({ schema }),
    // Raciocínio em nível médio em cada provedor (cada um lê só a sua chave).
    providerOptions: {
      anthropic: { effort: "medium" },
      openai: { reasoningEffort: "medium" },
      google: { thinkingConfig: { thinkingLevel: "medium" } },
    },
  })
  let output: unknown = null
  try {
    output = result.output
  } catch {
    // Sem objeto válido: o schema recusa adiante e a execução fica registrada como erro.
  }
  const refused = result.rawFinishReason === "refusal" || result.finishReason === "content-filter"
  return {
    output,
    stopReason: refused ? "refusal" : result.finishReason,
    model,
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
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
    agent: AgentName
    promptVersion: string
    system: string
    messages: AgentMessage[]
    schema: S
    input: unknown
    maxTokens?: number
    /** Espaço de escuta: não consome a cota dos copilotos do RH (tem limite próprio). */
    skipQuota?: boolean
    /** false = não guarda a saída em agent_runs (conversa do trabalhador nunca é gravada em claro). */
    storeOutput?: boolean
  }
): Promise<{ runId: string; output: z.infer<S> }> {
  if (!agentsAvailable(params.agent)) throw new HTTPException(503, { message: "Os copilotos não estão configurados neste ambiente." })
  if (!params.skipQuota) await assertLimit(ctx.db, ctx.companyId, "agentRuns", 1)
  const model = agentModel(params.agent)
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
        model: gen?.model ?? model,
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
    gen = await (testRunner ?? liveRunner)({ system: params.system, messages: params.messages, schema: params.schema, maxTokens: params.maxTokens ?? 8000, model })
  } catch (err) {
    if (err instanceof HTTPException) throw err
    await record("error", null, null)
    if (APICallError.isInstance(err)) {
      log.error("agents.api_erro", { agent: params.agent, model, status: err.statusCode, err: err.message })
      if (err.statusCode === 429) throw new HTTPException(429, { message: "O copiloto está com muita demanda agora. Tente de novo em instantes." })
    } else log.error("agents.falha", { agent: params.agent, model, err })
    throw new HTTPException(502, { message: "O copiloto não respondeu. Tente de novo; o fluxo manual continua disponível." })
  }
  if (gen.stopReason === "refusal") {
    await record("refused", gen, null)
    throw new HTTPException(422, { message: "O copiloto não pode ajudar com este pedido. Reformule ou siga pelo fluxo manual." })
  }
  const parsed = params.schema.safeParse(gen.output)
  if (!parsed.success) {
    await record("error", gen, null)
    log.warn("agents.saida_invalida", { agent: params.agent, model, issues: parsed.error.issues.slice(0, 3) })
    throw new HTTPException(502, { message: "A resposta do copiloto veio incompleta. Tente de novo." })
  }
  const runId = await record("ok", gen, parsed.data)
  return { runId, output: parsed.data }
}
