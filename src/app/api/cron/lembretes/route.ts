import { getDb } from "@/server/db"
import { appUrl } from "@/server/email"
import { runDailyReminders } from "@/server/reminders"
import { runRetention } from "@/server/retention"
import { log } from "@/server/log"

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
  const db = await getDb()
  const reminders = await runDailyReminders(db, appUrl(req.url))
  const retention = await runRetention(db)
  log.info("cron.diario", { reminders, retention })
  return Response.json({ reminders, retention })
}
