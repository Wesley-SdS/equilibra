import { renderToBuffer } from "@react-pdf/renderer"
import { and, eq } from "drizzle-orm"
import { cookies } from "next/headers"
import { createElement } from "react"
import { SESSION_COOKIE, readSessionToken } from "@/server/auth"
import { getDb } from "@/server/db"
import { memberships } from "@/server/db/schema"
import { ReportPdf } from "@/server/pdf/report-pdf"
import { buildReport } from "@/server/report"
import { slugify } from "@/lib/utils"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Gera o relatório PGR em PDF no servidor (A4, pronto para anexar ao PGR). */
export async function GET(req: Request) {
  const session = readSessionToken((await cookies()).get(SESSION_COOKIE)?.value)
  if (!session) return new Response("Sessão expirada. Entre novamente.", { status: 401 })
  const db = await getDb()
  const member = await db.query.memberships.findFirst({
    where: and(eq(memberships.userId, session.userId), eq(memberships.companyId, session.companyId)),
  })
  if (!member) return new Response("Sem acesso a esta empresa.", { status: 403 })

  const campaignId = new URL(req.url).searchParams.get("campanha") ?? undefined
  const report = await buildReport(db, session.companyId, campaignId)
  const buffer = await renderToBuffer(createElement(ReportPdf, { report }) as Parameters<typeof renderToBuffer>[0])
  const file = `relatorio-pgr-${slugify(report.company.name)}-${new Date().toISOString().slice(0, 10)}.pdf`
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  })
}
