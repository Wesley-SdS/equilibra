/* eslint-disable @typescript-eslint/no-explicit-any -- respostas da API inspecionadas livremente nos testes */
import { eq } from "drizzle-orm"
import SuperJSON from "superjson"
import { beforeAll, describe, expect, it } from "vitest"
import { createMemoryDb, type Db } from "@/server/db"
import { companies, invites, passwordResets, users } from "@/server/db/schema"
import { runRetention } from "@/server/retention"
import { LEGAL_VERSION } from "@/lib/legal"
import { fillTokens, renderLegal } from "@/lib/legal-render"
import { QUESTIONS } from "@/lib/methodology"

let db: Db
let app: { fetch: (req: Request) => Response | Promise<Response> }

beforeAll(async () => {
  const memory = createMemoryDb()
  ;(globalThis as { __eqDb?: Promise<Db> }).__eqDb = memory
  db = await memory
  app = (await import("@/server")).default.handler as unknown as typeof app
})

const serialize = (body: object) => JSON.stringify(Object.fromEntries(Object.entries(body).map(([k, v]) => [k, SuperJSON.stringify(v)])))

async function call(path: string, opts: { body?: object; cookie?: string } = {}) {
  const post = opts.body !== undefined
  const res = await app.fetch(
    new Request(`http://test/api/${path}`, {
      method: post ? "POST" : "GET",
      headers: { "content-type": "application/json", ...(opts.cookie ? { cookie: opts.cookie } : {}) },
      body: post ? serialize(opts.body!) : undefined,
    })
  )
  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text).json
  } catch {}
  return { status: res.status, text, json, cookie: (res.headers.get("set-cookie") ?? "").split(";")[0]! }
}

let n = 0
const account = () => {
  n += 1
  return { companyName: `Empresa L${n}`, cnpj: "12345678000190", employees: 20, name: `Pessoa ${n}`, email: `l${n}@teste.com`, password: "senha-segura-1" }
}
async function signup() {
  const body = account()
  const r = await call("auth/signup", { body: { ...body, acceptTerms: true } })
  expect(r.status, r.text).toBe(200)
  const me = await call("auth/me", { cookie: r.cookie })
  return { cookie: r.cookie, email: body.email, companyId: me.json.company.id as string, companyName: body.companyName }
}

describe("aceite dos documentos", () => {
  it("recusa cadastro sem aceite explícito", async () => {
    const r = await call("auth/signup", { body: account() })
    expect(r.status).toBe(422)
    expect(r.text).toContain("aceitar os Termos")
  })

  it("registra data e versão do aceite e pede novo aceite quando a versão muda", async () => {
    const s = await signup()
    const user = await db.query.users.findFirst({ where: eq(users.email, s.email) })
    expect(user!.termsVersion).toBe(LEGAL_VERSION)
    expect(user!.termsAcceptedAt).toBeInstanceOf(Date)
    expect((await call("auth/me", { cookie: s.cookie })).json.termsOutdated).toBe(false)

    await db.update(users).set({ termsVersion: "2020-01-01" }).where(eq(users.id, user!.id))
    expect((await call("auth/me", { cookie: s.cookie })).json.termsOutdated).toBe(true)
    expect((await call("auth/acceptTerms", { cookie: s.cookie, body: {} })).status).toBe(200)
    expect((await call("auth/me", { cookie: s.cookie })).json.termsOutdated).toBe(false)
  })
})

describe("direitos do titular", () => {
  it("exporta os dados da empresa (portabilidade) sem dados de outras empresas", async () => {
    const a = await signup()
    const b = await signup()
    await call("sectors/create", { cookie: b.cookie, body: { name: "Segredo de B", headcount: 5 } })
    const sector = await call("sectors/create", { cookie: a.cookie, body: { name: "Operação", headcount: 10 } })
    const camp = await call("campaigns/create", { cookie: a.cookie, body: { name: "Exportável", startsAt: "2026-01-01", endsAt: "2099-12-31" } })
    await call("survey/submit", { body: { token: camp.json.token, sectorId: sector.json.id, answers: QUESTIONS.map((q) => ({ questionId: q.id, value: 2 })) } })

    const exp = await call("account/exportData", { cookie: a.cookie })
    expect(exp.status).toBe(200)
    expect(exp.json.format).toBe("equilibra-export/v1")
    expect(exp.json.company.name).toBe(a.companyName)
    expect(exp.json.campaigns[0].responses[0].answers).toHaveLength(QUESTIONS.length)
    expect(JSON.stringify(exp.json)).not.toContain("Segredo de B")
    // Respostas exportadas não carregam identificação
    expect(Object.keys(exp.json.campaigns[0].responses[0]).sort()).toEqual(["answers", "day", "sectorId"])
  })

  it("exclui a empresa só com o nome exato e apaga os dados em cascata", async () => {
    const s = await signup()
    await call("sectors/create", { cookie: s.cookie, body: { name: "Loja", headcount: 8 } })
    expect((await call("account/deleteCompany", { cookie: s.cookie, body: { confirmName: "nome errado" } })).status).toBe(400)
    const ok = await call("account/deleteCompany", { cookie: s.cookie, body: { confirmName: s.companyName } })
    expect(ok.status).toBe(200)
    expect(await db.query.companies.findFirst({ where: eq(companies.id, s.companyId) })).toBeUndefined()
  })

  it("impede excluir a conta deixando uma empresa com equipe sem dono", async () => {
    const owner = await signup()
    const inv = await call("team/invite", { cookie: owner.cookie, body: { email: `membro${n}@teste.com`, role: "admin" } })
    await call("auth/acceptInvite", { body: { token: inv.json.token, name: "Membro", password: "senha-segura-2", acceptTerms: true } })

    const blocked = await call("account/deleteMe", { cookie: owner.cookie, body: { confirm: "EXCLUIR" } })
    expect(blocked.status).toBe(409)

    const solo = await signup()
    expect((await call("account/deleteMe", { cookie: solo.cookie, body: { confirm: "EXCLUIR" } })).status).toBe(200)
    expect(await db.query.users.findFirst({ where: eq(users.email, solo.email) })).toBeUndefined()
    expect(await db.query.companies.findFirst({ where: eq(companies.id, solo.companyId) })).toBeUndefined()
  })
})

describe("retenção", () => {
  it("expurga tokens de senha vencidos e convites antigos não aceitos", async () => {
    const s = await signup()
    const user = await db.query.users.findFirst({ where: eq(users.email, s.email) })
    const old = new Date(Date.now() - 3 * 86_400_000)
    await db.insert(passwordResets).values({ userId: user!.id, tokenHash: `h-${n}-old`, expiresAt: old })
    await db.insert(passwordResets).values({ userId: user!.id, tokenHash: `h-${n}-new`, expiresAt: new Date(Date.now() + 600_000) })
    await db.insert(invites).values({ companyId: s.companyId, email: "velho@teste.com", token: `t-${n}-old`, createdAt: new Date(Date.now() - 40 * 86_400_000) })
    await db.insert(invites).values({ companyId: s.companyId, email: "novo@teste.com", token: `t-${n}-new` })

    const r = await runRetention(db)
    expect(r.passwordResets).toBeGreaterThanOrEqual(1)
    expect(r.invites).toBeGreaterThanOrEqual(1)
    const left = await db.select().from(invites).where(eq(invites.companyId, s.companyId))
    expect(left.map((i) => i.email)).toEqual(["novo@teste.com"])
  })
})

describe("documentos", () => {
  it("renderiza os três documentos sem marcadores sobrando", () => {
    for (const doc of ["termos-de-uso", "politica-de-privacidade", "dpa"] as const) {
      const { title, html, toc } = renderLegal(doc)
      expect(title.length).toBeGreaterThan(5)
      expect(toc.length).toBeGreaterThan(5)
      expect(html).not.toMatch(/\{\{\w+\}\}/)
    }
  })

  it("lista os sub-operadores e as pendências de preenchimento", () => {
    const md = fillTokens("{{subprocessadores}}\n{{pendencias}}")
    expect(md).toContain("Neon")
    expect(md).toContain("TypeSafe")
    expect(md).toContain("Pendências de preenchimento")
  })
})

describe("proteção contra força bruta", () => {
  it("bloqueia o login após 10 tentativas para o mesmo e-mail", async () => {
    const s = await signup()
    for (let i = 0; i < 10; i++) {
      const r = await call("auth/login", { body: { email: s.email, password: "senha-errada" } })
      expect(r.status).toBe(401)
    }
    const blocked = await call("auth/login", { body: { email: s.email, password: "senha-segura-1" } })
    expect(blocked.status).toBe(429)
  })
})
