/* eslint-disable @typescript-eslint/no-explicit-any -- respostas da API inspecionadas livremente nos testes */
import sharp from "sharp"
import SuperJSON from "superjson"
import { beforeAll, describe, expect, it } from "vitest"
import { GET as getAttachment } from "@/app/api/canal/anexo/[id]/route"
import { createMemoryDb, type Db } from "@/server/db"

let app: { fetch: (req: Request) => Response | Promise<Response> }

beforeAll(async () => {
  const memory = createMemoryDb()
  ;(globalThis as { __eqDb?: Promise<Db> }).__eqDb = memory
  await memory
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

/** Imagem com metadados que identificariam o autor (EXIF) para provar que são removidos. */
async function photo(marker = "SEGREDO-DO-AUTOR-123") {
  const buf = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#3366cc" } })
    .jpeg()
    .withExif({ IFD0: { Copyright: marker, ImageDescription: marker } })
    .toBuffer()
  return { data: buf.toString("base64"), buf }
}

let n = 0
async function setup() {
  n += 1
  const r = await call("auth/signup", {
    body: { companyName: `Empresa C${n}`, cnpj: "12345678000190", employees: 30, name: `RH ${n}`, email: `c${n}@teste.com`, password: "senha-segura-1", acceptTerms: true },
  })
  expect(r.status, r.text).toBe(200)
  const me = await call("auth/me", { cookie: r.cookie })
  const sent = await call("channel/submit", { body: { slug: me.json.company.slug, category: "conflito", body: "Meu supervisor me trata mal quando erro alguma coisa no turno." } })
  expect(sent.status, sent.text).toBe(200)
  const list = await call("channelAdmin/list", { cookie: r.cookie })
  return { cookie: r.cookie, protocol: sent.json.protocol as string, reportId: list.json[0].id as string, slug: me.json.company.slug as string }
}

const fetchFile = (id: string, opts: { protocol?: string; cookie?: string } = {}) =>
  getAttachment(
    new Request(`http://test/api/canal/anexo/${id}${opts.protocol ? `?protocolo=${opts.protocol}` : ""}`, { headers: opts.cookie ? { cookie: opts.cookie } : {} }),
    { params: Promise.resolve({ id }) }
  )

describe("conversa do canal de relato", () => {
  it("autor e RH trocam mensagens; notas internas nunca chegam ao autor", async () => {
    const s = await setup()
    expect((await call("channelAdmin/reply", { cookie: s.cookie, body: { reportId: s.reportId, body: "Recebemos seu relato e vamos apurar." } })).status).toBe(200)
    expect((await call("channelAdmin/reply", { cookie: s.cookie, body: { reportId: s.reportId, body: "NOTA: conversar com o diretor antes.", internal: true } })).status).toBe(200)
    expect((await call("channel/reply", { body: { protocol: s.protocol, body: "Obrigado. Aconteceu de novo ontem." } })).status).toBe(200)

    const author = await call(`channel/thread?protocol=${s.protocol}`)
    expect(author.json.messages.map((m: any) => m.author)).toEqual(["hr", "reporter"])
    expect(author.text).not.toContain("NOTA: conversar")
    expect(Object.keys(author.json.messages[0]).sort()).toEqual(["attachments", "author", "body", "day", "id", "seq"])
    expect(author.json.messages[0].day).toMatch(/^\d{4}-\d{2}-\d{2}$/) // só o dia, nunca o horário

    const hr = await call(`channelAdmin/thread?reportId=${s.reportId}`, { cookie: s.cookie })
    expect(hr.json.messages.map((m: any) => m.author)).toEqual(["hr", "note", "reporter"])
  })

  it("controla não lidos: mensagem do autor acende o aviso até o RH abrir a conversa", async () => {
    const s = await setup()
    expect((await call("channelAdmin/unreadCount", { cookie: s.cookie })).json.n).toBe(0)
    await call("channel/reply", { body: { protocol: s.protocol, body: "Mais um detalhe importante sobre o caso." } })
    expect((await call("channelAdmin/unreadCount", { cookie: s.cookie })).json.n).toBe(1)
    expect((await call("channelAdmin/list", { cookie: s.cookie })).json[0]).toMatchObject({ unread: true, messageCount: 1 })
    await call(`channelAdmin/thread?reportId=${s.reportId}`, { cookie: s.cookie })
    expect((await call("channelAdmin/unreadCount", { cookie: s.cookie })).json.n).toBe(0)
  })

  it("responder move 'Recebido' para 'Em análise' e nova mensagem reabre relato resolvido", async () => {
    const s = await setup()
    await call("channelAdmin/reply", { cookie: s.cookie, body: { reportId: s.reportId, body: "Estamos analisando." } })
    expect((await call(`channel/status?protocol=${s.protocol}`)).json.status).toBe("analyzing")
    await call("channelAdmin/setStatus", { cookie: s.cookie, body: { id: s.reportId, status: "resolved" } })
    await call("channel/reply", { body: { protocol: s.protocol, body: "Voltou a acontecer, por favor reabram." } })
    expect((await call(`channel/status?protocol=${s.protocol}`)).json.status).toBe("analyzing")
  })

  it("reavalia a triagem: um relato que se agrava sobe de prioridade (nunca desce)", async () => {
    const s = await setup()
    const before = (await call("channelAdmin/list", { cookie: s.cookie })).json[0].priority
    await call("channel/reply", { body: { protocol: s.protocol, body: "Hoje ele me ameaçou e me empurrou contra a parede." } })
    const after = (await call("channelAdmin/list", { cookie: s.cookie })).json[0].priority
    expect(after).toBeGreaterThan(before)
    await call("channel/reply", { body: { protocol: s.protocol, body: "Ok, entendi." } })
    expect((await call("channelAdmin/list", { cookie: s.cookie })).json[0].priority).toBe(after)
  })

  it("protocolo inexistente retorna 404 e leitor não responde", async () => {
    const s = await setup()
    expect((await call("channel/thread?protocol=EQ-ZZZZ-ZZZZ")).status).toBe(404)
    expect((await call("channel/reply", { body: { protocol: "EQ-ZZZZ-ZZZZ", body: "Oi, tem alguém aí?" } })).status).toBe(404)
    const inv = await call("team/invite", { cookie: s.cookie, body: { email: `leitor-c${n}@teste.com`, role: "viewer" } })
    const viewer = await call("auth/acceptInvite", { body: { token: inv.json.token, name: "Leitor", password: "senha-segura-2", acceptTerms: true } })
    const denied = await call("channelAdmin/reply", { cookie: viewer.cookie, body: { reportId: s.reportId, body: "Não deveria conseguir." } })
    expect(denied.status).toBe(403)
  })
})

describe("anexos", () => {
  it("remove os metadados (EXIF) e guarda como JPEG reduzido", async () => {
    const s = await setup()
    const p = await photo()
    expect(p.buf.includes(Buffer.from("SEGREDO-DO-AUTOR-123"))).toBe(true) // a foto original TEM o metadado
    const r = await call("channel/reply", { body: { protocol: s.protocol, body: "Segue a foto do local.", attachments: [{ data: p.data }] } })
    expect(r.status, r.text).toBe(200)

    const att = (await call(`channel/thread?protocol=${s.protocol}`)).json.messages[0].attachments[0]
    expect(att.mime).toBe("image/jpeg")
    const res = await fetchFile(att.id, { protocol: s.protocol })
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    const bytes = Buffer.from(await res.arrayBuffer())
    expect(bytes.includes(Buffer.from("SEGREDO-DO-AUTOR-123"))).toBe(false)
    const meta = await sharp(bytes).metadata()
    expect(meta.exif).toBeUndefined()
    expect(meta.format).toBe("jpeg")
  })

  it("reduz imagens grandes para no máximo 1600 px", async () => {
    const s = await setup()
    const big = (await sharp({ create: { width: 3200, height: 2400, channels: 3, background: "#ff0000" } }).png().toBuffer()).toString("base64")
    await call("channel/reply", { body: { protocol: s.protocol, body: "Foto grande.", attachments: [{ data: big }] } })
    const att = (await call(`channel/thread?protocol=${s.protocol}`)).json.messages[0].attachments[0]
    const meta = await sharp(Buffer.from(await (await fetchFile(att.id, { protocol: s.protocol })).arrayBuffer())).metadata()
    expect(Math.max(meta.width!, meta.height!)).toBe(1600)
  })

  it("recusa arquivos que não são imagem e mais de 3 imagens por mensagem", async () => {
    const s = await setup()
    const fake = Buffer.from("isto não é uma imagem, é só um texto comprido o bastante para passar do tamanho mínimo exigido pelo servidor").toString("base64")
    const bad = await call("channel/reply", { body: { protocol: s.protocol, body: "Anexo inválido.", attachments: [{ data: fake }] } })
    expect(bad.status).toBe(422)
    expect(bad.text).toContain("envie uma imagem")

    const p = (await photo()).data
    const many = await call("channel/reply", { body: { protocol: s.protocol, body: "Imagens demais.", attachments: [{ data: p }, { data: p }, { data: p }, { data: p }] } })
    expect(many.status).toBe(422)
    expect((await call(`channel/thread?protocol=${s.protocol}`)).json.messages).toHaveLength(0) // nada foi gravado
  })

  it("só abre o anexo quem tem o protocolo ou acesso à empresa; anexos de nota interna são só do RH", async () => {
    const a = await setup()
    const b = await setup()
    const p = (await photo()).data
    await call("channel/reply", { body: { protocol: a.protocol, body: "Foto do autor.", attachments: [{ data: p }] } })
    await call("channelAdmin/reply", { cookie: a.cookie, body: { reportId: a.reportId, body: "Nota com foto.", internal: true, attachments: [{ data: p }] } })

    const thread = (await call(`channelAdmin/thread?reportId=${a.reportId}`, { cookie: a.cookie })).json.messages
    const authorFile = thread.find((m: any) => m.author === "reporter").attachments[0].id
    const noteFile = thread.find((m: any) => m.author === "note").attachments[0].id

    expect((await fetchFile(authorFile, { protocol: a.protocol })).status).toBe(200)
    expect((await fetchFile(authorFile, { cookie: a.cookie })).status).toBe(200)
    expect((await fetchFile(authorFile, { protocol: b.protocol })).status).toBe(404) // protocolo de outro relato
    expect((await fetchFile(authorFile, { cookie: b.cookie })).status).toBe(404) // RH de outra empresa
    expect((await fetchFile(authorFile)).status).toBe(404) // anônimo sem protocolo
    expect((await fetchFile(noteFile, { protocol: a.protocol })).status).toBe(404) // nota interna não vaza ao autor
    expect((await fetchFile(noteFile, { cookie: a.cookie })).status).toBe(200)
  })
})
