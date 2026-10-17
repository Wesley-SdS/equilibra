import { authorizeAttachment } from "@/server/channel-thread"
import { getDb } from "@/server/db"
import { clientIp, rateLimit } from "@/server/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Serve uma imagem anexada ao canal de relato. Exige o protocolo do relato (?protocolo=) ou uma
 * sessão do painel com acesso à empresa. Respostas nunca são cacheadas e não carregam metadados.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await rateLimit(`anexo:${clientIp(req.headers)}`, 120, 60_000)
  } catch {
    return new Response("Muitas requisições", { status: 429 })
  }
  const protocol = new URL(req.url).searchParams.get("protocolo")
  const file = await authorizeAttachment(await getDb(), id, protocol, req.headers.get("cookie"))
  if (!file) return new Response("Não encontrado", { status: 404 })
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'none'",
      "Referrer-Policy": "no-referrer",
    },
  })
}
