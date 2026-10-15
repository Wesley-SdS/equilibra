import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

export const SESSION_COOKIE = "eq_session"

function secret() {
  const s = process.env.SESSION_SECRET
  if (!s && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET é obrigatório em produção")
  }
  return s ?? "dev-only-secret-change-me"
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(password, salt, 64).toString("hex")
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":")
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, "hex")
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url")
}

export function createSessionToken(userId: string, companyId: string) {
  const payload = `${userId}.${companyId}`
  return `${payload}.${sign(payload)}`
}

export function readSessionToken(token: string | undefined) {
  if (!token) return null
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const [userId, companyId, sig] = parts as [string, string, string]
  const expected = sign(`${userId}.${companyId}`)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return { userId, companyId }
}

/** Token público URL-safe para links de campanha. */
export function publicToken(bytes = 18) {
  return randomBytes(bytes).toString("base64url")
}

/** Protocolo legível para o canal de relato, ex.: EQ-7F3K-92QD. */
export function protocolCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
  const pick = () => alphabet[randomBytes(1)[0]! % alphabet.length]
  const block = () => Array.from({ length: 4 }, pick).join("")
  return `EQ-${block()}-${block()}`
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}
