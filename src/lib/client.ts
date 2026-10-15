import { createClient } from "jstack"
import type { AppRouter } from "@/server"

function baseUrl() {
  if (typeof window !== "undefined") return window.location.origin
  return process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`
}

/** Client RPC type-safe: tipos de entrada e saída inferidos do servidor. */
export const client = createClient<AppRouter>({
  baseUrl: `${baseUrl()}/api`,
  credentials: "include",
})
