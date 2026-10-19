/**
 * Popula o banco local com dados de demonstração.
 * Acessos de teste (somente ambiente local):
 *   dona/consultora: demo@equilibra.app  · senha: equilibra-demo   (3 empresas na carteira)
 *   leitor do RH:    rh@equilibra.app    · senha: equilibra-demo
 */
import { eq, inArray } from "drizzle-orm"
import { getDb, type Db } from "../src/server/db"
import { actions, answers, auditLog, campaignParticipants, campaigns, channelMessages, channelReports, companies, customQuestions, employees, memberships, questionnaireVersions, questionnaires, responseIdentities, responses, sectors, users, type CustomQuestionSnapshot } from "../src/server/db/schema"
import { hashPassword } from "../src/server/auth"
import { LEGAL_VERSION } from "../src/lib/legal"
import { triageReport } from "../src/server/decisions"
import { QUESTIONS, type DimensionId } from "../src/lib/methodology"
import { NR1_STANDARD_VERSION_ID } from "../src/lib/questionnaire"

const PASSWORD = "equilibra-demo"

type Profile = Record<string, { headcount: number; answered: number; risk: Partial<Record<DimensionId, number>> }>

let seed = 42
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

async function addCampaign(
  db: Db,
  companyId: string,
  sectorIds: Record<string, string>,
  c: { name: string; token: string; startsAt: string; endsAt: string; status: "active" | "closed" },
  profile: Profile,
  /** Multiplicador sobre o risco de base (ex.: 1.15 = campanha anterior, pior). */
  factor = 1,
  /** Perguntas da empresa copiadas para a campanha, com a resposta média esperada (1–5). */
  extra: (CustomQuestionSnapshot & { mean: number })[] = []
) {
  const [campaign] = await db
    .insert(campaigns)
    .values({ companyId, ...c, questionnaireVersionId: NR1_STANDARD_VERSION_ID, customQuestions: extra.map(({ id, text }) => ({ id, text })) })
    .returning()
  for (const [name, p] of Object.entries(profile)) {
    const answered = Math.round(p.answered * (factor > 1 ? 0.85 : 1))
    for (let i = 0; i < answered; i++) {
      const [r] = await db
        .insert(responses)
        .values({ campaignId: campaign!.id, sectorId: sectorIds[name]!, createdDay: `${c.startsAt.slice(0, 8)}${String(1 + (i % 14)).padStart(2, "0")}` })
        .returning()
      await db.insert(answers).values(
        QUESTIONS.map((q) => {
          const target = Math.min(0.95, (p.risk[q.dimension] ?? 0.15) * factor)
          const riskVal = Math.max(0, Math.min(4, Math.round(target * 4 + (rand() - 0.5) * 2.2)))
          return { responseId: r!.id, questionId: q.id, value: q.risk ? riskVal + 1 : 5 - riskVal }
        })
      )
      if (extra.length) {
        await db.insert(answers).values(
          extra.map((q) => ({ responseId: r!.id, questionId: q.id, value: Math.max(1, Math.min(5, Math.round(q.mean + (rand() - 0.5) * 2.4))) }))
        )
      }
    }
  }
  return campaign!
}

type Billing = Partial<Pick<typeof companies.$inferInsert, "plan" | "subscriptionStatus" | "trialEndsAt" | "currentPeriodEnd" | "billingInterval">>

async function addCompany(db: Db, ownerId: string, data: { name: string; cnpj: string; slug: string }, profile: Profile, billing: Billing) {
  const employees = Object.values(profile).reduce((s, p) => s + p.headcount, 0)
  const [company] = await db.insert(companies).values({ ...data, employees, ...billing }).returning()
  await db.insert(memberships).values({ userId: ownerId, companyId: company!.id, role: "owner" })
  const sectorIds: Record<string, string> = {}
  for (const [name, p] of Object.entries(profile)) {
    const [s] = await db.insert(sectors).values({ companyId: company!.id, name, headcount: p.headcount }).returning()
    sectorIds[name] = s!.id
  }
  return { company: company!, sectorIds }
}

async function main() {
  const db = await getDb()

  // Limpa dados de demonstração anteriores.
  const old = await db.select().from(users).where(inArray(users.email, ["demo@equilibra.app", "rh@equilibra.app"]))
  if (old.length) {
    const ms = await db.select().from(memberships).where(inArray(memberships.userId, old.map((u) => u.id)))
    if (ms.length) await db.delete(companies).where(inArray(companies.id, ms.map((m) => m.companyId)))
    await db.delete(users).where(inArray(users.id, old.map((u) => u.id)))
  }

  const passwordHash = hashPassword(PASSWORD)
  const accepted = { termsAcceptedAt: new Date(), termsVersion: LEGAL_VERSION }
  const [carla] = await db.insert(users).values({ name: "Carla Mendes", email: "demo@equilibra.app", passwordHash, ...accepted }).returning()
  const [rafael] = await db.insert(users).values({ name: "Rafael Souza", email: "rh@equilibra.app", passwordHash, ...accepted }).returning()

  // 1) Padaria: duas campanhas para mostrar evolução.
  const padaria: Profile = {
    Produção: { headcount: 48, answered: 38, risk: { demandas: 0.9, controle: 0.68, lideranca: 0.5, relacoes: 0.28, reconhecimento: 0.66 } },
    Balcão: { headcount: 36, answered: 27, risk: { demandas: 0.66, controle: 0.52, lideranca: 0.26, relacoes: 0.36, papel: 0.38, reconhecimento: 0.5 } },
    Entregas: { headcount: 22, answered: 16, risk: { demandas: 0.62, controle: 0.5, lideranca: 0.7, colegas: 0.34, reconhecimento: 0.7 } },
    Administrativo: { headcount: 12, answered: 9, risk: { demandas: 0.36, papel: 0.3, reconhecimento: 0.4 } },
    Gerência: { headcount: 4, answered: 3, risk: { demandas: 0.5 } },
  }
  const inDays = (d: number) => new Date(Date.now() + d * 86_400_000)
  const p = await addCompany(db, carla!.id, { name: "Padaria Pão Dourado Ltda.", cnpj: "12345678000190", slug: "pao-dourado" }, padaria, {
    plan: "profissional",
    subscriptionStatus: "active",
    billingInterval: "yearly",
    currentPeriodEnd: inDays(210),
  })
  await db.insert(memberships).values({ userId: rafael!.id, companyId: p.company.id, role: "viewer" })
  await addCampaign(db, p.company.id, p.sectorIds, { name: "Diagnóstico inicial · abr/2026", token: "demo-pao-dourado-abr26", startsAt: "2026-04-06", endsAt: "2026-04-24", status: "closed" }, padaria, 1.18)
  const extraTexts = [
    { text: "Tenho os equipamentos e uniformes de que preciso para trabalhar.", mean: 3.9 },
    { text: "A temperatura do meu local de trabalho é confortável.", mean: 2.3 },
    { text: "Recebo treinamento suficiente para a minha função.", mean: 3.1 },
  ]
  const extra: (CustomQuestionSnapshot & { mean: number })[] = []
  for (const [position, q] of extraTexts.entries()) {
    const [row] = await db.insert(customQuestions).values({ companyId: p.company.id, text: q.text, position }).returning()
    extra.push({ id: `c:${row!.id}`, text: q.text, mean: q.mean })
  }
  const atual = await addCampaign(db, p.company.id, p.sectorIds, { name: "Avaliação psicossocial · out/2026", token: "demo-pao-dourado-out26", startsAt: "2026-10-01", endsAt: "2026-10-31", status: "active" }, padaria, 1, extra)

  await db.insert(actions).values([
    { companyId: p.company.id, campaignId: atual.id, dimension: "relacoes", what: "Divulgar o canal de relato anônimo e o fluxo de apuração", how: "Cartazes, QR code e comunicado da direção garantindo a não retaliação.", who: "RH · Rafael", due: "2026-11-15", status: "doing" },
    { companyId: p.company.id, campaignId: atual.id, dimension: "lideranca", what: "Capacitar lideranças em feedback e comunicação não violenta", how: "Trilha de 4 encontros de 1h30.", who: "Diretoria", due: "2026-08-30", status: "done", sectorId: p.sectorIds["Entregas"] },
  ])
  // Triagem pelo Jev (via AI Gateway) quando houver credencial; senão, regras locais.
  const reports = [
    { protocol: "EQ-7F3K-92QD", category: "sobrecarga", body: "No turno da madrugada da produção estamos fazendo a mesma quantidade de pães com duas pessoas a menos desde setembro. Ninguém consegue tirar a pausa.", status: "analyzing" as const, createdDay: "2026-10-08" },
    { protocol: "EQ-M4TR-6HXA", category: "conflito", body: "Um encarregado das entregas grita com a equipe na frente dos clientes quando há atraso, e ameaça descontar do salário.", status: "received" as const, createdDay: "2026-10-12" },
    { protocol: "EQ-Q8WN-3JTB", category: "outro", body: "O ar-condicionado da área do forno está quebrado há duas semanas e a temperatura passa de 40 graus à tarde. Uma colega passou mal ontem.", status: "received" as const, createdDay: "2026-10-14" },
  ]
  for (const r of reports) {
    await db.insert(channelReports).values({ companyId: p.company.id, ...r, triage: await triageReport(r.body, r.category) })
  }
  // Conversa de exemplo: RH respondeu ao autor, que acrescentou um detalhe (mensagem não lida).
  const [sobrecarga] = await db.select({ id: channelReports.id }).from(channelReports).where(eq(channelReports.protocol, "EQ-7F3K-92QD"))
  await db.insert(channelMessages).values([
    { reportId: sobrecarga!.id, author: "hr", body: "Recebemos o seu relato e já estamos revendo a escala da madrugada. Obrigado por avisar.", createdDay: "2026-10-09" },
    { reportId: sobrecarga!.id, author: "note", body: "Conversar com a gerência de produção e reavaliar o quadro do turno.", createdDay: "2026-10-09" },
    { reportId: sobrecarga!.id, author: "reporter", body: "Obrigado. Hoje também ficamos sem a pausa, só que dessa vez com três pessoas a menos.", createdDay: "2026-10-15" },
  ])
  await db.insert(auditLog).values([
    { companyId: p.company.id, userId: carla!.id, action: "create", entity: "campanha", entityId: atual.id, summary: `Campanha “${atual.name}” criada`, at: new Date("2026-09-30T14:02:00Z") },
    { companyId: p.company.id, userId: carla!.id, action: "invite", entity: "equipe", summary: "Convite enviado para rh@equilibra.app (Leitor)", at: new Date("2026-09-30T14:10:00Z") },
    { companyId: p.company.id, userId: rafael!.id, action: "access", entity: "equipe", entityId: rafael!.id, summary: "Rafael Souza entrou na equipe", at: new Date("2026-09-30T15:31:00Z") },
  ])

  // Pulso identificado das Entregas: pessoas cadastradas, link pessoal e quem já respondeu.
  const entregasPeople = ["Ana Souza", "Bruno Lima", "Carlos Pereira", "Daniela Rocha", "Eduardo Alves", "Fernanda Costa"]
  const people = await db
    .insert(employees)
    .values(entregasPeople.map((name, i) => ({ companyId: p.company.id, name, email: `${name.split(" ")[0]!.toLowerCase()}@paodourado.com.br`, phone: i % 2 ? `55119876543${10 + i}` : null, sectorId: p.sectorIds["Entregas"]! })))
    .returning()
  const [pulso] = await db
    .insert(questionnaires)
    .values({ companyId: p.company.id, name: "Pulso Entregas · rota e cobrança", purpose: "acompanhar a nova escala de rotas e o contato fora do horário", kind: "pulso", anonymous: false, origin: "manual" })
    .returning()
  const pulsoItems = [
    { id: "i_rota1", text: "Recebo mensagens de trabalho fora do meu horário.", type: "likert5" as const, dimension: "demandas" as const, risk: true },
    { id: "i_rota2", text: "A rota do dia é definida com tempo suficiente para eu me organizar.", type: "likert5" as const, dimension: "controle" as const, risk: false },
    { id: "i_rota3", text: "Consigo cumprir as entregas sem ultrapassar a jornada.", type: "likert5" as const, dimension: "demandas" as const, risk: false },
    { id: "i_rota4", text: "Sou cobrado(a) de forma agressiva ou humilhante.", type: "likert5" as const, dimension: "lideranca" as const, risk: true },
  ]
  const [pulsoV] = await db.insert(questionnaireVersions).values({ questionnaireId: pulso!.id, version: 1, items: pulsoItems }).returning()
  const [pulsoCampaign] = await db
    .insert(campaigns)
    .values({ companyId: p.company.id, name: "Pulso Entregas · out/2026", token: "demo-pao-dourado-pulso", startsAt: "2026-10-10", endsAt: "2026-10-30", status: "active", questionnaireVersionId: pulsoV!.id })
    .returning()
  for (const [i, person] of people.entries()) {
    const [part] = await db
      .insert(campaignParticipants)
      .values({ campaignId: pulsoCampaign!.id, employeeId: person.id, token: `demo-pulso-${i + 1}`, invitedAt: new Date("2026-10-10T12:00:00Z") })
      .returning()
    if (i >= 4) continue // duas pessoas ainda não responderam
    const [r] = await db.insert(responses).values({ campaignId: pulsoCampaign!.id, sectorId: p.sectorIds["Entregas"]!, createdDay: `2026-10-1${i + 1}` }).returning()
    await db.insert(answers).values(pulsoItems.map((it, k) => ({ responseId: r!.id, questionId: it.id, value: [5, 2, 2, 4, 4, 1, 2, 3, 5, 2, 1, 4, 3, 3, 3, 2][(i * 4 + k) % 16]! })))
    await db.insert(responseIdentities).values({ responseId: r!.id, campaignId: pulsoCampaign!.id, employeeId: person.id })
    await db.update(campaignParticipants).set({ respondedAt: new Date(`2026-10-1${i + 1}T15:00:00Z`), consentAt: new Date(`2026-10-1${i + 1}T15:00:00Z`) }).where(eq(campaignParticipants.id, part!.id))
  }

  // 2) Carteira da consultora: outras duas empresas clientes.
  const clinica: Profile = {
    Recepção: { headcount: 14, answered: 11, risk: { demandas: 0.55, relacoes: 0.45, reconhecimento: 0.4 } },
    Enfermagem: { headcount: 30, answered: 22, risk: { demandas: 0.85, controle: 0.6, relacoes: 0.5, lideranca: 0.45 } },
    Médicos: { headcount: 12, answered: 7, risk: { demandas: 0.6, papel: 0.3 } },
  }
  const cl = await addCompany(db, carla!.id, { name: "Clínica Vida Plena", cnpj: "45678912000155", slug: "vida-plena" }, clinica, {
    plan: "profissional",
    subscriptionStatus: "active",
    currentPeriodEnd: inDays(18),
  })
  await addCampaign(db, cl.company.id, cl.sectorIds, { name: "Avaliação psicossocial · set/2026", token: "demo-vida-plena-set26", startsAt: "2026-09-08", endsAt: "2026-09-26", status: "closed" }, clinica)

  const metal: Profile = {
    Usinagem: { headcount: 60, answered: 41, risk: { demandas: 0.4, controle: 0.45, reconhecimento: 0.35 } },
    Montagem: { headcount: 45, answered: 30, risk: { demandas: 0.35, colegas: 0.2 } },
    Escritório: { headcount: 18, answered: 14, risk: { papel: 0.25 } },
  }
  const mt = await addCompany(db, carla!.id, { name: "Metalúrgica Aço Forte S.A.", cnpj: "78912345000133", slug: "aco-forte" }, metal, {
    plan: "profissional",
    subscriptionStatus: "trialing",
    trialEndsAt: inDays(9),
  })
  await addCampaign(db, mt.company.id, mt.sectorIds, { name: "Avaliação psicossocial · out/2026", token: "demo-aco-forte-out26", startsAt: "2026-10-05", endsAt: "2026-10-30", status: "active" }, metal)

  const count = await db.select().from(memberships).where(eq(memberships.userId, carla!.id))
  console.log(`Seed concluído: ${count.length} empresas na carteira de demonstração.`)
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err)
    process.exit(1)
  }
)
