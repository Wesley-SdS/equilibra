import { and, eq, lt } from "drizzle-orm"
import type { Db } from "./db"
import { auditLog, campaigns } from "./db/schema"
import { today } from "./auth"
import { purgeFinishedContacts } from "./dispatch"

/**
 * Fase de uma campanha pela data (a janela de resposta é sempre validada no servidor):
 * agendada (ainda não começou), aberta, vencida (passou do fim, aguardando o encerramento automático) ou encerrada.
 */
export type CampaignPhase = "scheduled" | "open" | "expired" | "closed"

export function phaseOf(c: { status: "active" | "closed"; startsAt: string; endsAt: string }, now = today()): CampaignPhase {
  if (c.status === "closed") return "closed"
  if (now < c.startsAt) return "scheduled"
  if (now > c.endsAt) return "expired"
  return "open"
}

/** Cron diário: encerra campanhas cujo prazo já passou e apaga a lista de envio delas. */
export async function closeExpiredCampaigns(db: Db) {
  const expired = await db
    .update(campaigns)
    .set({ status: "closed" })
    .where(and(eq(campaigns.status, "active"), lt(campaigns.endsAt, today())))
    .returning({ id: campaigns.id, companyId: campaigns.companyId, name: campaigns.name })
  if (expired.length) {
    await db.insert(auditLog).values(
      expired.map((c) => ({ companyId: c.companyId, userId: null, action: "status" as const, entity: "campanha", entityId: c.id, summary: `Campanha “${c.name}” encerrada automaticamente ao fim do prazo` }))
    )
    await purgeFinishedContacts(db)
  }
  return { closed: expired.length }
}
