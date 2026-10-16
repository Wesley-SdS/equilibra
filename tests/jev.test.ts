import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { chooseActions, classifyQuestion, triageByRules, triagePriority, triageReport } from "@/server/decisions"

// Só a chamada HTTP ao Vercel AI Gateway é simulada; o resto do código roda de verdade.
const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  process.env.AI_GATEWAY_API_KEY = "test-gateway-key"
})
afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockReset()
  delete process.env.AI_GATEWAY_API_KEY
})

function gatewayReturns(answers: Record<string, unknown>) {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ model: "jev-1.14.0", answers }), { status: 200 }))
}

describe("Jev via Vercel AI Gateway", () => {
  it("faz a triagem do relato com o Jev e envia o formato do AI Gateway", async () => {
    gatewayReturns({
      category: { type: "choice", choice: "assedio_moral", confidence: 0.93, probabilities: { assedio_moral: 0.93, conflito: 0.07 } },
      severity: { type: "score", score: 2.4, confidence: 0.8, legend: {}, probabilities: {} },
      urgent: { type: "noul", noul: 0.71 },
      identifiesPeople: { type: "noul", noul: 0.12 },
    })
    const t = await triageReport("O encarregado grita e ameaça descontar do salário na frente de todos.", "conflito")

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe("https://ai-gateway.vercel.sh/typesafe/v1/systemone")
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer test-gateway-key" })
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.model).toBe("typesafe-ai/jev")
    expect(Object.keys(body.questions)).toEqual(["category", "severity", "urgent", "identifiesPeople"])
    expect(body.questions.severity.type).toBe("score")

    expect(t).toMatchObject({ engine: "jev", model: "jev-1.14.0", category: "assedio_moral", severity: 2.4, urgent: 0.71 })
    expect(triagePriority(t)).toBeGreaterThan(70)
  })

  it("cai nas regras locais quando o Gateway falha, sem quebrar", async () => {
    fetchMock.mockResolvedValueOnce(new Response("upstream error", { status: 502 }))
    const t = await triageReport("Ele me ameaçou depois da reunião.", "assedio_moral")
    expect(t.engine).toBe("regras")
    expect(t.severity).toBe(3)
  })

  it("usa as regras locais sem credencial do Gateway (nenhuma chamada externa)", async () => {
    delete process.env.AI_GATEWAY_API_KEY
    const t = await triageReport("Estamos sem pausa e fazendo hora extra todo dia.", "sobrecarga")
    expect(fetchMock).not.toHaveBeenCalled()
    expect(t).toMatchObject({ engine: "regras", category: "sobrecarga", severity: 1 })
  })

  it("ordena as ações do plano pelas probabilidades do Jev", async () => {
    gatewayReturns({ best: { type: "choice", choice: "a2", confidence: 0.6, probabilities: { a0: 0.15, a1: 0.25, a2: 0.6 } } })
    const chosen = await chooseActions({
      dimension: "demandas",
      score: 72,
      worstSectors: [{ label: "Produção", score: 90 }],
      worstItems: ["Levo trabalho para fora do horário ou faço horas extras para não atrasar."],
      existing: [],
    })
    expect(chosen.map((c) => c.what)).toEqual(["Monitorar horas extras e banco de horas por setor", "Instituir pausas programadas nos horários de pico"])
    expect(chosen[0]!.decision).toMatchObject({ engine: "jev", confidence: 0.6 })
  })

  it("classifica a pergunta da empresa em uma dimensão", async () => {
    gatewayReturns({ dimension: { type: "choice", choice: "lideranca", confidence: 0.88, probabilities: { lideranca: 0.88 } } })
    expect(await classifyQuestion("Minha liderança reconhece quando faço um bom trabalho.")).toEqual({ dimension: "lideranca", confidence: 88 })
  })
})

describe("regras de reserva", () => {
  it("marca risco imediato em relatos de violência", () => {
    const t = triageByRules("Fui agredido no estoque.", "outro")
    expect(t.urgent).toBeGreaterThanOrEqual(0.8)
    expect(triagePriority(t)).toBeGreaterThanOrEqual(90)
  })
})

describe("regras de reserva: agressão física e retaliação", () => {
  it("classifica empurrão e ameaça de demissão como críticos", () => {
    const t = triageByRules("O supervisor disse que vai me demitir se eu reclamar e me empurrou contra a parede.", "outro")
    expect(t.severity).toBe(3)
    expect(t.urgent).toBeGreaterThanOrEqual(0.8)
  })
})
