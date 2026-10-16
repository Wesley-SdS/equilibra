// Cliente do Jev, o modelo de decisão ("System One") da TypeSafe AI, chamado pelo
// Vercel AI Gateway: https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe
// O Jev não gera texto: recebe um estado + perguntas tipadas e devolve, em uma única
// chamada, escolhas (choice), notas em rubrica (score) e probabilidades sim/não (noul).

const ENDPOINT = process.env.JEV_GATEWAY_URL ?? "https://ai-gateway.vercel.sh/typesafe/v1/systemone"
const MODEL = process.env.JEV_MODEL ?? "typesafe-ai/jev"
const TIMEOUT_MS = 4000

/**
 * Credencial do AI Gateway: AI_GATEWAY_API_KEY (local/qualquer lugar) ou, em deploy na
 * Vercel, o token OIDC que a plataforma injeta automaticamente (VERCEL_OIDC_TOKEN).
 */
function gatewayToken() {
  return process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN ?? null
}

export type ChoiceQ<K extends string = string> = { type: "choice"; instructions: string; criteria: Record<K, string> }
export type ScoreQ = { type: "score"; instructions: string; criteria: string[] }
export type NoulQ = { type: "noul"; instructions: string }
export type Question = ChoiceQ | ScoreQ | NoulQ

export const choice = <K extends string>(instructions: string, criteria: Record<K, string>): ChoiceQ<K> => ({ type: "choice", instructions, criteria })
export const score = (instructions: string, criteria: string[]): ScoreQ => ({ type: "score", instructions, criteria })
export const noul = (instructions: string): NoulQ => ({ type: "noul", instructions })

export type ChoiceA<K extends string = string> = { type: "choice"; choice: K; confidence: number; probabilities: Record<K, number> }
export type ScoreA = { type: "score"; score: number; confidence: number; legend: Record<string, string>; probabilities: Record<string, number> }
export type NoulA = { type: "noul"; noul: number }

type AnswerFor<Q> = Q extends ChoiceQ<infer K> ? ChoiceA<K> : Q extends ScoreQ ? ScoreA : NoulA

export type JevResult<T extends Record<string, Question>> = {
  model: string
  answers: { [K in keyof T]: AnswerFor<T[K]> }
  usage?: { input_tokens: number; output_tokens: number }
}

export function jevEnabled() {
  return Boolean(gatewayToken())
}

/**
 * Faz uma chamada ao Jev pelo AI Gateway. Retorna null (e o chamador usa as regras locais) quando
 * não há chave, quando a API falha ou passa do tempo limite — nunca derruba a ação do usuário.
 */
export async function jevDecide<T extends Record<string, Question>>(state: string | object, questions: T): Promise<JevResult<T> | null> {
  const key = gatewayToken()
  if (!key) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, state, questions }),
      signal: controller.signal,
    })
    if (!res.ok) {
      console.error(`[jev] HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
      return null
    }
    return (await res.json()) as JevResult<T>
  } catch (err) {
    console.error("[jev] falha na chamada", err instanceof Error ? err.message : err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Opções de uma resposta `choice` ordenadas da mais para a menos provável. */
export function rankedChoices<K extends string>(answer: ChoiceA<K>): { key: K; p: number }[] {
  return (Object.entries(answer.probabilities) as [K, number][]).map(([key, p]) => ({ key, p })).sort((a, b) => b.p - a.p)
}
