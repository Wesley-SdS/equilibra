import { and, isNotNull, isNull, lt, or } from "drizzle-orm"
import type { Db } from "./db"
import { purgeFinishedContacts } from "./dispatch"
import { purgeListening } from "./listening"
import { invites, passwordResets } from "./db/schema"

const DAY = 86_400_000

/** Expurgo diário dos prazos da Política de Privacidade §8 (chamado pelo cron). */
export async function runRetention(db: Db, now = new Date()) {
  const dayAgo = new Date(now.getTime() - DAY)
  const tokens = await db
    .delete(passwordResets)
    .where(or(lt(passwordResets.expiresAt, dayAgo), and(isNotNull(passwordResets.usedAt), lt(passwordResets.usedAt, dayAgo))))
    .returning({ id: passwordResets.id })
  const staleInvites = await db
    .delete(invites)
    .where(and(isNull(invites.acceptedAt), lt(invites.createdAt, new Date(now.getTime() - 30 * DAY))))
    .returning({ id: invites.id })
  const contacts = await purgeFinishedContacts(db)
  const listening = await purgeListening(db, now)
  return { passwordResets: tokens.length, invites: staleInvites.length, contacts, listening }
}
