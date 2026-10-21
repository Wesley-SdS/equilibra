import { boolean, customType, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, unique } from "drizzle-orm/pg-core"
import type { QuestionnaireItem, QuestionnaireKind, QuestionnaireOrigin, QuestionnaireStatus } from "@/lib/questionnaire"
import type { DimensionId } from "@/lib/methodology"

const bytea = customType<{ data: Buffer; driverData: Uint8Array }>({
  dataType: () => "bytea",
  toDriver: (v) => v,
  fromDriver: (v) => Buffer.from(v),
})

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull(),
  cnpj: text("cnpj").notNull(),
  employees: integer("employees").notNull(),
  slug: text("slug").notNull().unique(),
  // Assinatura (estrutura independente do provedor de pagamento)
  plan: text("plan", { enum: ["essencial", "profissional", "empresa"] }).notNull().default("profissional"),
  subscriptionStatus: text("subscription_status", { enum: ["trialing", "active", "past_due", "canceled"] })
    .notNull()
    .default("trialing"),
  billingInterval: text("billing_interval", { enum: ["monthly", "yearly"] }).notNull().default("monthly"),
  trialEndsAt: timestamp("trial_ends_at"),
  currentPeriodEnd: timestamp("current_period_end"),
  billingProvider: text("billing_provider"),
  providerCustomerId: text("provider_customer_id"),
  providerSubscriptionId: text("provider_subscription_id"),
  // Metodologia de avaliação escolhida (src/lib/methodologies.ts), justificativa técnica e ajustes de severidade.
  methodologyId: text("methodology_id").notNull().default("equilibra"),
  methodologyNote: text("methodology_note").notNull().default(""),
  methodologyQuestionnaireId: text("methodology_questionnaire_id"),
  severityOverrides: jsonb("severity_overrides").$type<Partial<Record<DimensionId, number>>>().notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const ROLES = ["owner", "admin", "viewer"] as const
export type Role = (typeof ROLES)[number]

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // Prova do aceite dos Termos e da Política (LGPD: o controlador deve comprovar)
  termsAcceptedAt: timestamp("terms_accepted_at"),
  termsVersion: text("terms_version"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

// Um usuário pode acessar várias empresas (ex.: contador ou consultoria de SST com carteira).
export const memberships = pgTable(
  "memberships",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    role: text("role", { enum: ROLES }).notNull().default("owner"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.companyId] })]
)

export const invites = pgTable("invites", {
  id: id(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role", { enum: ROLES }).notNull().default("viewer"),
  token: text("token").notNull().unique(),
  invitedBy: text("invited_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at"),
})

export const auditLog = pgTable("audit_log", {
  id: id(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  summary: text("summary").notNull(),
  at: timestamp("at").notNull().defaultNow(),
})

export const sectors = pgTable("sectors", {
  id: id(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  headcount: integer("headcount").notNull(),
})

/**
 * Questionários da empresa (companyId nulo = questionário de sistema, igual para todos, como o
 * NR-1 padrão). Editar cria uma versão nova; a campanha aponta para uma versão.
 */
export const questionnaires = pgTable("questionnaires", {
  id: id(),
  companyId: text("company_id").references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  purpose: text("purpose").notNull().default(""),
  kind: text("kind").$type<QuestionnaireKind>().notNull().default("livre"),
  // Decidido na criação: o NR-1 é sempre anônimo. (O modo identificado chega numa fase seguinte.)
  anonymous: boolean("anonymous").notNull().default(true),
  status: text("status").$type<QuestionnaireStatus>().notNull().default("active"),
  origin: text("origin").$type<QuestionnaireOrigin>().notNull().default("manual"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export const questionnaireVersions = pgTable(
  "questionnaire_versions",
  {
    id: id(),
    questionnaireId: text("questionnaire_id")
      .notNull()
      .references(() => questionnaires.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    items: jsonb("items").$type<QuestionnaireItem[]>().notNull(),
    publishedAt: timestamp("published_at").notNull().defaultNow(),
  },
  (t) => [unique("questionnaire_version_unique").on(t.questionnaireId, t.version)]
)

export const campaigns = pgTable("campaigns", {
  id: id(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  token: text("token").notNull().unique(),
  status: text("status", { enum: ["active", "closed"] })
    .notNull()
    .default("active"),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  // Versão do questionário aplicada. Nunca muda depois de criada a campanha.
  questionnaireVersionId: text("questionnaire_version_id")
    .notNull()
    .references(() => questionnaireVersions.id),
  // Cópia das perguntas da empresa no momento da criação: editar as perguntas depois
  // não altera campanhas já lançadas (nem invalida respostas antigas).
  customQuestions: jsonb("custom_questions").$type<CustomQuestionSnapshot[]>().notNull().default([]),
  // Último lembrete enviado à equipe (evita e-mails repetidos pelo cron).
  lastReminderAt: timestamp("last_reminder_at"),
  // Campanha histórica trazida por importação de planilha (não conta no limite do plano).
  imported: boolean("imported").notNull().default(false),
  // Metodologia vigente quando a campanha foi criada: trocar a metodologia só afeta campanhas futuras.
  methodology: jsonb("methodology").$type<{ id: string; name: string; severity: Record<DimensionId, number>; justification: string } | null>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export type CustomQuestionSnapshot = { id: string; text: string }

/** Registro de uma decisão automática: qual motor decidiu e com que confiança (auditável). */
export type Decision = { engine: "jev" | "regras" | "copiloto"; model?: string; confidence?: number }

export type ChannelCopilotAnalysis = {
  summary: string
  framing: string
  legalRefs: string[]
  questionsToAsk: string[]
  replyDraft: string
  suggestedAction: { dimension: DimensionId; what: string; why: string } | null
  emergency: boolean
  warnings: string[]
  runId: string
}

export type Triage = Decision & {
  category: string
  categoryConfidence?: number
  /** 0 (baixa) … 3 (crítica), média ponderada pelas probabilidades do Jev */
  severity: number
  /** Probabilidade de risco imediato à integridade de alguém */
  urgent: number
  /** Probabilidade de o texto identificar pessoas (nomes, cargos únicos) */
  identifiesPeople: number
}

/** Perguntas adicionais da empresa (escala Nunca → Sempre), relatadas fora do score NR-1. */
export const customQuestions = pgTable("custom_questions", {
  id: id(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  // Dimensão psicossocial mais relacionada (classificada pelo Jev); só informativa.
  dimension: text("dimension"),
  dimensionConfidence: integer("dimension_confidence"),
  active: boolean("active").notNull().default(true),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

/** Tokens de redefinição de senha: só o hash é guardado, com validade curta e uso único. */
export const passwordResets = pgTable("password_resets", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

/**
 * Lista de distribuição da campanha (telefones/e-mails colados pelo RH). Serve só para enviar o
 * MESMO link anônimo a todos: não há vínculo com respostas. Apagada quando a campanha termina.
 */
export const campaignContacts = pgTable(
  "campaign_contacts",
  {
    id: id(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    channel: text("channel", { enum: ["whatsapp", "email"] }).notNull(),
    address: text("address").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("campaign_contact_unique").on(t.campaignId, t.channel, t.address)]
)

/** Histórico de disparos (só contagens; nenhum contato individual é registrado aqui). */
export const campaignDispatches = pgTable("campaign_dispatches", {
  id: id(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["invite", "reminder"] }).notNull(),
  trigger: text("trigger", { enum: ["manual", "auto"] }).notNull().default("manual"),
  whatsappSent: integer("whatsapp_sent").notNull().default(0),
  emailSent: integer("email_sent").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  at: timestamp("at").notNull().defaultNow(),
})

// Respostas anônimas: nenhuma coluna identifica a pessoa. A data é truncada ao dia.
export const responses = pgTable("responses", {
  id: id(),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  sectorId: text("sector_id")
    .notNull()
    .references(() => sectors.id, { onDelete: "cascade" }),
  createdDay: text("created_day").notNull(),
})

export const answers = pgTable(
  "answers",
  {
    responseId: text("response_id")
      .notNull()
      .references(() => responses.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    value: integer("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.responseId, t.questionId] })]
)

export const actions = pgTable("actions", {
  id: id(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  dimension: text("dimension").notNull(),
  what: text("what").notNull(),
  why: text("why").notNull().default(""),
  sectorId: text("sector_id").references(() => sectors.id, { onDelete: "set null" }),
  who: text("who").notNull().default(""),
  due: text("due").notNull().default(""),
  how: text("how").notNull().default(""),
  cost: text("cost").notNull().default(""),
  status: text("status", { enum: ["todo", "doing", "done"] })
    .notNull()
    .default("todo"),
  // Quando a ação foi sugerida automaticamente: motor e confiança da escolha.
  decision: jsonb("decision").$type<Decision>(),
  // Etapas da ação (checklist com progresso no card) e evidência de conclusão (vai para o relatório).
  steps: jsonb("steps").$type<{ text: string; done: boolean }[]>().notNull().default([]),
  evidence: text("evidence").notNull().default(""),
  // Quando a ação foi concluída (marca na linha do tempo da Evolução).
  completedAt: timestamp("completed_at"),
  // Pessoas a quem a ação se destina (vem de campanhas identificadas). Vazio = setor ou empresa toda.
  employeeIds: jsonb("employee_ids").$type<string[]>().notNull().default([]),
  // Controle dos avisos de prazo do cron: último estágio avisado ("soon" | "overdue") e quando.
  notifiedStage: text("notified_stage").notNull().default(""),
  notifiedAt: timestamp("notified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const channelReports = pgTable("channel_reports", {
  id: id(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  protocol: text("protocol").notNull().unique(),
  category: text("category").notNull(),
  body: text("body").notNull(),
  status: text("status", { enum: ["received", "analyzing", "resolved"] })
    .notNull()
    .default("received"),
  createdDay: text("created_day").notNull(),
  triage: jsonb("triage").$type<Triage>(),
  // Maior `seq` de mensagem do autor do relato já visto pelo RH (não lido = seq maior que este).
  hrSeenSeq: integer("hr_seen_seq").notNull().default(0),
  // Última análise do copiloto do canal (visível só ao RH) e quando foi feita.
  copilot: jsonb("copilot").$type<ChannelCopilotAnalysis | null>(),
  copilotAt: timestamp("copilot_at"),
})

/**
 * Conversa do canal de relato. O autor é anônimo e acessa pelo protocolo. Guardamos só o DIA
 * (nunca o horário) e `seq` para ordenar; "note" é nota interna do RH, invisível ao autor.
 */
export const channelMessages = pgTable("channel_messages", {
  id: id(),
  reportId: text("report_id")
    .notNull()
    .references(() => channelReports.id, { onDelete: "cascade" }),
  seq: serial("seq").notNull(),
  author: text("author", { enum: ["reporter", "hr", "note"] }).notNull(),
  body: text("body").notNull(),
  createdDay: text("created_day").notNull(),
})

/** Imagens anexadas (reprocessadas no servidor: sem EXIF/GPS). */
export const channelAttachments = pgTable("channel_attachments", {
  id: id(),
  messageId: text("message_id")
    .notNull()
    .references(() => channelMessages.id, { onDelete: "cascade" }),
  reportId: text("report_id")
    .notNull()
    .references(() => channelReports.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  data: bytea("data").notNull(),
})

/** Classificação de uma coluna/linha do arquivo importado. */
export type ImportColumnKind = "likert5" | "likert3" | "yesno" | "numeric" | "open" | "sector" | "identifier" | "timestamp" | "question"
export type ImportProposal = { text: string; dimension: DimensionId | null; risk: boolean }

/**
 * Importação de formulários (planilha, CSV do Google Forms, PDF ou texto colado). Fica em rascunho
 * até o gestor revisar e confirmar. Colunas que identificam pessoas nunca são gravadas.
 * `data` guarda só as respostas das colunas de pergunta (e o setor) e é apagado ao confirmar ou descartar.
 */
export const imports = pgTable("imports", {
  id: id(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  source: text("source").$type<"xlsx" | "csv" | "pdf" | "text">().notNull(),
  filename: text("filename").notNull(),
  status: text("status").$type<"draft" | "confirmed" | "discarded">().notNull().default("draft"),
  name: text("name").notNull(),
  kind: text("kind").$type<QuestionnaireKind>().notNull().default("clima"),
  responseCount: integer("response_count").notNull().default(0),
  importResponses: boolean("import_responses").notNull().default(true),
  /** Valor da coluna de setor → id do setor da empresa, "new" (criar) ou null (pendente). */
  sectorMap: jsonb("sector_map").$type<Record<string, string | null>>().notNull().default({}),
  defaultSectorId: text("default_sector_id"),
  startsAt: text("starts_at"),
  endsAt: text("ends_at"),
  /** Nomes das colunas identificáveis descartadas (só o cabeçalho, nunca os valores). */
  dropped: jsonb("dropped").$type<string[]>().notNull().default([]),
  data: jsonb("data").$type<{ sectors: (string | null)[]; values: (string | null)[][] } | null>(),
  questionnaireId: text("questionnaire_id").references(() => questionnaires.id, { onDelete: "set null" }),
  campaignId: text("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const importRows = pgTable("import_rows", {
  id: id(),
  importId: text("import_id")
    .notNull()
    .references(() => imports.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  /** Índice da coluna em `imports.data.values` (null quando o arquivo não tem respostas). */
  column: integer("column"),
  raw: text("raw").notNull(),
  detected: text("detected").$type<ImportColumnKind>().notNull(),
  /** Rótulo bruto → valor 1..5, quando a escala do arquivo precisa de conversão. */
  valueMap: jsonb("value_map").$type<Record<string, number>>().notNull().default({}),
  proposed: jsonb("proposed").$type<ImportProposal>().notNull(),
  final: jsonb("final").$type<ImportProposal>().notNull(),
  confidence: integer("confidence").notNull().default(0),
  engine: text("engine").$type<"jev" | "regras" | "metodologia">().notNull().default("regras"),
  issues: jsonb("issues").$type<string[]>().notNull().default([]),
  action: text("action").$type<"pending" | "accept" | "ignore" | "sector">().notNull().default("pending"),
})

/**
 * Pessoas da empresa, usadas SÓ por questionários identificados (pulsos, acompanhamento de ações)
 * e para endereçar ações a um grupo. O NR-1 nunca usa este cadastro.
 */
export const employees = pgTable("employees", {
  id: id(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  sectorId: text("sector_id").references(() => sectors.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

/** Convite individual de uma campanha identificada: link pessoal, aceite e status de resposta. */
export const campaignParticipants = pgTable(
  "campaign_participants",
  {
    id: id(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    employeeId: text("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    invitedAt: timestamp("invited_at"),
    remindedAt: timestamp("reminded_at"),
    consentAt: timestamp("consent_at"),
    respondedAt: timestamp("responded_at"),
  },
  (t) => [unique("campaign_participant_unique").on(t.campaignId, t.employeeId)]
)

/**
 * Vínculo resposta → pessoa, existe SÓ em campanhas de questionário identificado. A tabela de
 * respostas continua sem identidade; consultas de campanhas anônimas nunca tocam nesta tabela.
 */
export const responseIdentities = pgTable("response_identities", {
  responseId: text("response_id")
    .primaryKey()
    .references(() => responses.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  employeeId: text("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
})

/**
 * Cada chamada a um copiloto (IA generativa): quem pediu, qual agente, o que voltou, custo e se a
 * proposta foi aceita. Aparece na trilha de auditoria e conta na cota mensal do plano.
 * Não guarda a entrada em texto (pode ter dado sensível): só um hash dela.
 */
export const agentRuns = pgTable("agent_runs", {
  id: id(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  agent: text("agent").notNull(),
  promptVersion: text("prompt_version").notNull(),
  inputHash: text("input_hash").notNull(),
  output: jsonb("output"),
  model: text("model").notNull(),
  status: text("status").$type<"ok" | "refused" | "error">().notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  accepted: boolean("accepted"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

/**
 * Resumo executivo do relatório PGR (página 1). Gerado pelo copiloto (ou por regras, sem IA),
 * editável, e só entra no relatório depois que um usuário aprova — o relatório registra quem e quando.
 */
export const reportSummaries = pgTable("report_summaries", {
  id: id(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  campaignId: text("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  engine: text("engine").$type<"copiloto" | "regras" | "manual">().notNull(),
  runId: text("run_id"),
  status: text("status").$type<"draft" | "approved">().notNull().default("draft"),
  approvedBy: text("approved_by").references(() => users.id, { onDelete: "set null" }),
  approvedByName: text("approved_by_name"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

/**
 * Registro de observação e diálogo: o MTE orienta que questionário sozinho não basta e que a
 * avaliação inclua observação da atividade e conversa com os trabalhadores. Vai para o relatório PGR.
 */
export const observations = pgTable("observations", {
  id: id(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  day: text("day").notNull(),
  method: text("method").$type<"observacao" | "conversa" | "grupo" | "entrevista">().notNull(),
  sectorId: text("sector_id").references(() => sectors.id, { onDelete: "set null" }),
  participants: integer("participants").notNull().default(0),
  summary: text("summary").notNull(),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})
