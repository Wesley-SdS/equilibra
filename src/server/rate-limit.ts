import { createHash } from "node:crypto"
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import { HTTPException } from "hono/http-exception"
import { log } from "./log"

// Limite de requisições distribuído (Upstash Redis, compartilhado entre instâncias da Vercel).
// Sem credenciais (desenvolvimento e testes), usa um contador em memória por instância.
// Aceita os nomes de variável da integração Upstash da Vercel (KV_*) e os nativos (UPSTASH_*).

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN
const redis = url && token ? new Redis({ url, token }) : null

const limiters = new Map<string, Ratelimit>()
function limiterFor(max: number, windowMs: number) {
  const id = `${max}:${windowMs}`
  let l = limiters.get(id)
  if (!l) {
    l = new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(max, `${windowMs} ms`), prefix: "eq:rl", analytics: false })
    limiters.set(id, l)
  }
  return l
}

const memory = new Map<string, { n: number; at: number }>()
function memoryHit(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const cur = memory.get(key)
  if (!cur || now - cur.at > windowMs) {
    memory.set(key, { n: 1, at: now })
    return true
  }
  cur.n += 1
  return cur.n <= max
}

/** A chave nunca vai em claro para o Redis (pode conter e-mail ou IP). */
const hashKey = (key: string) => createHash("sha256").update(key).digest("base64url").slice(0, 32)

export const rateLimitBackend = redis ? "upstash" : "memoria"

/**
 * Lança 429 quando `key` passar de `max` requisições em `windowMs`.
 * Se o Redis estiver fora do ar, deixa passar (fail-open) e registra o erro.
 */
export async function rateLimit(key: string, max: number, windowMs: number) {
  let allowed: boolean
  if (redis) {
    try {
      allowed = (await limiterFor(max, windowMs).limit(hashKey(key))).success
    } catch (err) {
      log.error("rate_limit.redis_indisponivel", { err })
      allowed = true
    }
  } else {
    allowed = memoryHit(key, max, windowMs)
  }
  if (!allowed) throw new HTTPException(429, { message: "Muitas tentativas. Aguarde um instante." })
}

/** IP do cliente (só para compor chaves de limite; nunca é armazenado em claro). */
export function clientIp(headers: Headers) {
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido"
}
