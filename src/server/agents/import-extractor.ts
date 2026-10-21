// Leitura de questionário em PDF escaneado ou foto (papel fotografado): o Claude lê o documento e
// devolve só as perguntas e a escala. O resultado entra no mesmo fluxo de revisão da importação:
// nada vira questionário sem o gestor conferir.

import { z } from "zod/v4"
import { runAgent, type AgentContext } from "./client"

export const EXTRACT_PROMPT_VERSION = "importacao-ocr-2026-10-21"

const schema = z.object({
  questions: z.array(z.string()).describe("As perguntas ou afirmações do questionário, na ordem, exatamente como escritas (sem numeração)"),
  scale: z.array(z.string()).describe("Os rótulos da escala de resposta, se houver (ex.: Nunca, Raramente, Às vezes, Frequentemente, Sempre)"),
  identifiesPeople: z.boolean().describe("true se o documento tiver nomes, assinaturas ou dados pessoais de quem respondeu"),
})

const SYSTEM = `Você extrai questionários de documentos escaneados ou fotografados para um sistema brasileiro de avaliação de riscos psicossociais.
Devolva somente as perguntas (ou afirmações) que o respondente deve avaliar, na ordem em que aparecem, com o texto exato, sem numeração e sem as opções de resposta.
Ignore títulos, instruções, cabeçalhos, rodapés, campos de identificação (nome, matrícula, assinatura) e respostas marcadas à mão.
Se houver uma escala de resposta comum, devolva os rótulos em "scale".
Nunca transcreva nomes ou dados pessoais de quem respondeu; apenas sinalize em "identifiesPeople".`

export type ExtractMedia = "application/pdf" | "image/png" | "image/jpeg" | "image/webp"

export async function extractQuestionsWithClaude(ctx: AgentContext, data: Buffer, mediaType: ExtractMedia) {
  const b64 = data.toString("base64")
  const source = mediaType === "application/pdf" ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } } as const) : ({ type: "image", source: { type: "base64", media_type: mediaType, data: b64 } } as const)
  const { output } = await runAgent(ctx, {
    agent: "import-extractor",
    promptVersion: EXTRACT_PROMPT_VERSION,
    system: SYSTEM,
    schema,
    input: { bytes: data.length, mediaType },
    maxTokens: 8000,
    // Não guarda o conteúdo do documento no registro do copiloto, só a contagem.
    storeOutput: false,
    messages: [{ role: "user", content: [source, { type: "text", text: "Extraia as perguntas deste questionário." }] }],
  })
  return output
}
