import { boolean, customType, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, unique } from "drizzle-orm/pg-core"
import type { QuestionnaireItem, QuestionnaireKind, QuestionnaireOrigin, QuestionnaireStatus } from "@/lib/questionnaire"

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
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export type CustomQuestionSnapshot = { id: string; text: string }

/** Registro de uma decisão automática: qual motor decidiu e com que confiança (auditável). */
export type Decision = { engine: "jev" | "regras"; model?: string; confidence?: number }

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
