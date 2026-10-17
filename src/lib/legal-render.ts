import { readFileSync } from "node:fs"
import path from "node:path"
import { Marked } from "marked"
import { CONTROLLER, LEGAL_VERSION, PENDING_FIELDS, RETENTION, SUBPROCESSORS } from "./legal"
import { slugify } from "./utils"

export type LegalDoc = "termos-de-uso" | "politica-de-privacidade" | "dpa"

const PENDING_LABEL: Record<string, string> = {
  razaoSocial: "Razão social",
  cnpj: "CNPJ",
  endereco: "Endereço",
  foro: "Cidade do foro",
  emailContato: "E-mail de contato",
  dpoNome: "Nome do Encarregado (DPO)",
  dpoEmail: "E-mail do Encarregado (DPO)",
}

function table(head: string[], rows: string[][]) {
  return [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n")
}

/** Preenche os marcadores {{...}} com os dados de src/lib/legal.ts. */
export function fillTokens(md: string) {
  const tokens: Record<string, string> = {
    ...CONTROLLER,
    versao: LEGAL_VERSION.split("-").reverse().join("/"),
    pendencias: PENDING_FIELDS.length
      ? `> **Pendências de preenchimento:** ${PENDING_FIELDS.map((f) => PENDING_LABEL[f] ?? f).join(", ")}. Este documento ainda não deve ser usado com clientes.`
      : "",
    subprocessadores: table(
      ["Sub-operador", "Finalidade", "Dados", "Localização"],
      SUBPROCESSORS.map((s) => [s.nome, s.finalidade, s.dados, s.pais])
    ),
    retencao: table(
      ["Categoria", "Prazo"],
      RETENTION.map((r) => [r.categoria, r.prazo])
    ),
  }
  return md.replace(/\{\{(\w+)\}\}/g, (_, k: string) => tokens[k] ?? `{{${k}}}`)
}

/** Lê o Markdown em docs/legal, preenche os marcadores e devolve HTML + índice. */
export function renderLegal(doc: LegalDoc) {
  const raw = readFileSync(path.join(process.cwd(), "docs", "legal", `${doc}.md`), "utf8")
  const md = fillTokens(raw)
  const toc: { id: string; text: string }[] = []
  let title = ""
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens)
        const plain = text.replace(/<[^>]+>/g, "")
        if (depth === 1) {
          title = plain
          return ""
        }
        const id = slugify(plain)
        if (depth === 2) toc.push({ id, text: plain })
        return `<h${depth} id="${id}">${text}</h${depth}>`
      },
    },
  })
  const html = marked.parse(md, { async: false })
  return { title, html, toc }
}
