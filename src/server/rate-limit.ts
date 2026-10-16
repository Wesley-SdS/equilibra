import { HTTPException } from "hono/http-exception"

// Limite simples em memória (por instância). Em produção com várias instâncias,
// trocar por um store compartilhado (ex.: Upstash Redis) — ver docs/backlog.md.
const hits = new Map<string, { n: number; at: number }>()

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const cur = hits.get(key)
  if (!cur || now - cur.at > windowMs) {
    hits.set(key, { n: 1, at: now })
    return
  }
  cur.n += 1
  if (cur.n > max) throw new HTTPException(429, { message: "Muitas tentativas. Aguarde um instante." })
}
