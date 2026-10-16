import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core"

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
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const ROLES = ["owner", "admin", "viewer"] as const
export type Role = (typeof ROLES)[number]

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
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
  // Cópia das perguntas da empresa no momento da criação: editar as perguntas depois
  // não altera campanhas já lançadas (nem invalida respostas antigas).
  customQuestions: jsonb("custom_questions").$type<CustomQuestionSnapshot[]>().notNull().default([]),
  // Último lembrete enviado à equipe (evita e-mails repetidos pelo cron).
  lastReminderAt: timestamp("last_reminder_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export type CustomQuestionSnapshot = { id: string; text: string }

/** Perguntas adicionais da empresa (escala Nunca → Sempre), relatadas fora do score NR-1. */
export const customQuestions = pgTable("custom_questions", {
  id: id(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
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
})
