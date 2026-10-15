/**
 * Popula o banco local com uma empresa de demonstração.
 * Acesso de teste (somente ambiente local):
 *   e-mail: demo@equilibra.app
 *   senha:  equilibra-demo
 */
import { eq } from "drizzle-orm"
import { getDb } from "../src/server/db"
import { actions, answers, campaigns, companies, responses, sectors, users } from "../src/server/db/schema"
import { hashPassword } from "../src/server/auth"
import { QUESTIONS, type DimensionId } from "../src/lib/methodology"

const DEMO_EMAIL = "demo@equilibra.app"
const DEMO_PASSWORD = "equilibra-demo"

// Perfil de risco (0..1) por setor e dimensão para gerar respostas realistas.
const PROFILE: Record<string, { headcount: number; answered: number; risk: Partial<Record<DimensionId, number>> }> = {
  Produção: { headcount: 48, answered: 38, risk: { demandas: 0.9, controle: 0.68, lideranca: 0.5, relacoes: 0.28, reconhecimento: 0.66 } },
  Balcão: { headcount: 36, answered: 27, risk: { demandas: 0.66, controle: 0.52, lideranca: 0.26, relacoes: 0.36, papel: 0.38, reconhecimento: 0.5 } },
  Entregas: { headcount: 22, answered: 16, risk: { demandas: 0.62, controle: 0.5, lideranca: 0.7, colegas: 0.34, reconhecimento: 0.7 } },
  Administrativo: { headcount: 12, answered: 9, risk: { demandas: 0.36, papel: 0.3, reconhecimento: 0.4 } },
  Gerência: { headcount: 4, answered: 3, risk: { demandas: 0.5 } },
}

let seed = 42
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

async function main() {
  const db = await getDb()

  const existing = await db.query.users.findFirst({ where: eq(users.email, DEMO_EMAIL) })
  if (existing) {
    await db.delete(companies).where(eq(companies.id, existing.companyId))
  }

  const [company] = await db
    .insert(companies)
    .values({ name: "Padaria Pão Dourado Ltda.", cnpj: "12345678000190", employees: 122, slug: "pao-dourado" })
    .returning()
  await db.insert(users).values({
    companyId: company!.id,
    name: "Carla Mendes",
    email: DEMO_EMAIL,
    passwordHash: hashPassword(DEMO_PASSWORD),
  })

  const [campaign] = await db
    .insert(campaigns)
    .values({
      companyId: company!.id,
      name: "Avaliação psicossocial · out/2026",
      token: "demo-pao-dourado-out26",
      startsAt: "2026-10-01",
      endsAt: "2026-10-31",
    })
    .returning()

  for (const [name, p] of Object.entries(PROFILE)) {
    const [sector] = await db.insert(sectors).values({ companyId: company!.id, name, headcount: p.headcount }).returning()
    for (let i = 0; i < p.answered; i++) {
      const [r] = await db
        .insert(responses)
        .values({ campaignId: campaign!.id, sectorId: sector!.id, createdDay: `2026-10-${String(1 + (i % 14)).padStart(2, "0")}` })
        .returning()
      await db.insert(answers).values(
        QUESTIONS.map((q) => {
          const target = p.risk[q.dimension] ?? 0.15
          const riskVal = Math.max(0, Math.min(4, Math.round(target * 4 + (rand() - 0.5) * 2.2)))
          return { responseId: r!.id, questionId: q.id, value: q.risk ? riskVal + 1 : 5 - riskVal }
        })
      )
    }
  }

  await db.insert(actions).values({
    companyId: company!.id,
    campaignId: campaign!.id,
    dimension: "relacoes",
    what: "Divulgar o canal de relato anônimo e o fluxo de apuração",
    how: "Cartazes, QR code e comunicado da direção garantindo a não retaliação.",
    who: "RH · Rafael",
    due: "2026-11-15",
    status: "doing",
  })

  console.log("Seed concluído: empresa de demonstração criada.")
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err)
    process.exit(1)
  }
)
