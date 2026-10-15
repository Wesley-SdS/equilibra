import { integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core"

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

export const users = pgTable("users", {
  id: id(),
  companyId: text("company_id")
    .notNull()
    .references(() => companies.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["owner", "admin", "viewer"] })
    .notNull()
    .default("owner"),
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
