import { getDb } from "@/server/db"
import { appUrl } from "@/server/email"
import { runDailyReminders } from "@/server/reminders"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Chamado pelo Vercel Cron (vercel.json) uma vez por dia.
 * A Vercel envia `Authorization: Bearer <CRON_SECRET>`; sem o segredo correto, 401.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Não autorizado", { status: 401 })
  }
  const result = await runDailyReminders(await getDb(), appUrl(req.url))
  return Response.json(result)
}
