import type { Db } from "./db"
import { auditLog } from "./db/schema"

type Session = { userId: string; companyId: string }

/** Registra uma ação na trilha de auditoria da empresa (requisito F12 do PRD). */
export async function audit(
  db: Db,
  session: Session,
  entry: { action: "create" | "update" | "delete" | "status" | "invite" | "access"; entity: string; entityId?: string | null; summary: string }
) {
  await db.insert(auditLog).values({
    companyId: session.companyId,
    userId: session.userId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    summary: entry.summary,
  })
}
