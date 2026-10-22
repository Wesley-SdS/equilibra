/* eslint-disable @typescript-eslint/no-explicit-any -- corpos HTTP dos provedores inspecionados livremente */
// Fiação de cada provedor sem chave real: o fetch é interceptado, conferimos o pedido (host, PDF/imagem,
// schema) e devolvemos uma resposta no formato do provedor.
import { afterEach, describe, expect, it, vi } from "vitest"
import { z } from "zod/v4"
import { agentModel, agentRoute, liveRunner } from "@/server/agents/client"

const schema = z.object({ questions: z.array(z.string()), identifiesPeople: z.boolean() })
const answer = { questions: ["Recebo retorno claro sobre o meu trabalho."], identifiesPeople: false }
const PDF = Buffer.from("%PDF-1.4 fake").toString("base64")

const ENV = ["AGENT_MODEL", "AGENT_MODEL_IMPORT_EXTRACTOR", "ANTHROPIC_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "OPENAI_API_KEY", "AI_GATEWAY_API_KEY", "VERCEL", "AGENTS_DISABLED"]
const saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]))
function env(values: Record<string, string>) {
  for (const k of ENV) delete process.env[k]
  Object.assign(process.env, values)
}
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  vi.unstubAllGlobals()
})

function capture(reply: (url: string) => object) {
  const calls: { url: string; body: any }[] = []
  vi.stubGlobal("fetch", async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null })
    return new Response(JSON.stringify(reply(url)), { status: 200, headers: { "content-type": "application/json" } })
  })
  return calls
}
const run = (model: string) =>
  liveRunner({ system: "Extraia.", model, schema, maxTokens: 1000, messages: [{ role: "user", content: [{ type: "file", data: PDF, mediaType: "application/pdf" }, { type: "text", text: "Extraia as perguntas." }] }] })

describe("modelo por agente", () => {
  it("agente > padrão geral > Opus; id sem provedor é da Anthropic", () => {
    env({})
    expect(agentModel("plan-copilot")).toBe("anthropic/claude-opus-5.5")
    env({ AGENT_MODEL: "claude-opus-5-5" })
    expect(agentModel("plan-copilot")).toBe("anthropic/claude-opus-5-5")
    env({ AGENT_MODEL: "openai/gpt-6-luna", AGENT_MODEL_IMPORT_EXTRACTOR: "google/gemini-3.8-flash" })
    expect(agentModel("import-extractor")).toBe("google/gemini-3.8-flash")
    expect(agentModel("listening")).toBe("openai/gpt-6-luna")
  })

  it("rota: chave do provedor do modelo, senão Gateway, senão desligado", () => {
    env({ AGENT_MODEL: "google/gemini-3.8-flash", ANTHROPIC_API_KEY: "x" })
    expect(agentRoute()).toBe("off")
    env({ AGENT_MODEL: "google/gemini-3.8-flash", GOOGLE_GENERATIVE_AI_API_KEY: "x" })
    expect(agentRoute()).toBe("direct")
    env({ AGENT_MODEL: "openai/gpt-6-luna", AI_GATEWAY_API_KEY: "x" })
    expect(agentRoute()).toBe("gateway")
    env({ AGENT_MODEL: "mistral/qualquer", AI_GATEWAY_API_KEY: "x" })
    expect(agentRoute()).toBe("off")
  })
})

describe("provedores (fetch interceptado)", () => {
  it("Gemini direto: PDF em inlineData e JSON validado", async () => {
    env({ GOOGLE_GENERATIVE_AI_API_KEY: "teste" })
    const calls = capture(() => ({
      candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(answer) }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 20, totalTokenCount: 140 },
    }))
    const r = await run("google/gemini-3.8-flash")
    expect(calls[0]!.url).toContain("generativelanguage.googleapis.com")
    expect(calls[0]!.url).toContain("gemini-3.8-flash")
    expect(JSON.stringify(calls[0]!.body)).toContain('"mimeType":"application/pdf"')
    expect(r).toMatchObject({ output: answer, model: "google/gemini-3.8-flash", inputTokens: 120, outputTokens: 20 })
  })

  it("OpenAI direto: PDF como arquivo e JSON validado", async () => {
    env({ OPENAI_API_KEY: "teste" })
    const calls = capture(() => ({
      id: "resp_1",
      object: "response",
      created_at: 1_790_000_000,
      model: "gpt-6-luna",
      status: "completed",
      output: [{ type: "message", id: "msg_1", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(answer), annotations: [] }] }],
      usage: { input_tokens: 90, output_tokens: 15, total_tokens: 105 },
    }))
    const r = await run("openai/gpt-6-luna")
    expect(calls[0]!.url).toContain("api.openai.com")
    expect(JSON.stringify(calls[0]!.body)).toContain("application/pdf")
    expect(r).toMatchObject({ output: answer, model: "openai/gpt-6-luna", inputTokens: 90, outputTokens: 15 })
  })

  it("Claude direto: id com hífen, PDF como documento", async () => {
    env({ ANTHROPIC_API_KEY: "teste" })
    const calls = capture(() => ({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-haiku-5-5",
      content: [{ type: "text", text: JSON.stringify(answer) }],
      stop_reason: "end_turn",
      usage: { input_tokens: 80, output_tokens: 12 },
    }))
    const r = await run("anthropic/claude-haiku-5.5")
    expect(calls[0]!.url).toContain("api.anthropic.com")
    expect(calls[0]!.body.model).toBe("claude-haiku-5-5")
    expect(JSON.stringify(calls[0]!.body)).toContain('"type":"document"')
    expect(r).toMatchObject({ output: answer, inputTokens: 80, outputTokens: 12 })
  })

  it("Gateway: um só endpoint para qualquer provedor", async () => {
    env({ AI_GATEWAY_API_KEY: "teste" })
    const calls = capture(() => ({
      content: [{ type: "text", text: JSON.stringify(answer) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: { inputTokens: { total: 50 }, outputTokens: { total: 10 } },
      warnings: [],
    }))
    const r = await run("google/gemini-3.8-flash")
    expect(calls[0]!.url).toContain("ai-gateway.vercel.sh")
    expect(r.output).toEqual(answer)
  })
})
