import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer"
import type { Report } from "../report"
import { DIMENSIONS, K_ANONYMITY, QUESTIONS, RISK_LEVELS, dimensionMeta, inventoryRating, riskLevel, type RiskLevel } from "@/lib/methodology"
import { formatCnpj, formatDate } from "@/lib/utils"

const INK = "#0b1410"
const MUTED = "#4a5752"
const LINE = "#dfe3dd"
const BRAND = "#3f6212"
const RISK: Record<RiskLevel, { bg: string; fg: string }> = {
  baixo: { bg: "#d4efe0", fg: "#17663f" },
  moderado: { bg: "#f6e6ae", fg: "#855600" },
  alto: { bg: "#fbd3b0", fg: "#a8480b" },
  critico: { bg: "#f6c2bc", fg: "#b42f1e" },
}
const STATUS = { todo: "A fazer", doing: "Em andamento", done: "Concluída" } as const

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 44, fontSize: 9.5, color: INK, fontFamily: "Helvetica", lineHeight: 1.45 },
  brandRow: { flexDirection: "row", alignItems: "center", marginBottom: 22 },
  brandMark: { width: 16, height: 16, borderRadius: 4, backgroundColor: "#bdf05c", marginRight: 6 },
  brandName: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  eyebrow: { fontSize: 8, color: BRAND, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  meta: { color: MUTED, marginBottom: 18 },
  kpis: { flexDirection: "row", gap: 8, marginBottom: 22 },
  kpi: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 6, padding: 10 },
  kpiLabel: { fontSize: 8, color: MUTED, marginBottom: 3 },
  kpiValue: { fontSize: 16, fontFamily: "Helvetica-Bold", lineHeight: 1.1, marginBottom: 4 },
  section: { marginBottom: 18 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  num: { color: BRAND },
  p: { color: MUTED },
  table: { borderTopWidth: 1, borderColor: LINE },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderColor: LINE, paddingVertical: 5 },
  th: { fontSize: 8, color: MUTED, fontFamily: "Helvetica-Bold" },
  chip: { borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1.5, fontSize: 7.5, alignSelf: "flex-start" },
  footer: { position: "absolute", bottom: 22, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: MUTED, borderTopWidth: 1, borderColor: LINE, paddingTop: 4 },
  sign: { flexDirection: "row", gap: 40, marginTop: 34 },
  signLine: { flex: 1, borderTopWidth: 1, borderColor: INK, paddingTop: 4, fontSize: 8, color: MUTED },
})

function Chip({ score }: { score: number }) {
  const lvl = riskLevel(score)
  return <Text style={[s.chip, { backgroundColor: RISK[lvl].bg, color: RISK[lvl].fg }]}>{RISK_LEVELS[lvl].label}</Text>
}

function Footer({ company }: { company: string }) {
  // Texto estático: o `render` dinâmico (nº de página) não aparece em elemento fixo/absoluto nesta versão.
  return (
    <Text style={s.footer} fixed>
      Equilibra · Inventário de riscos psicossociais (NR-1) · {company}
    </Text>
  )
}

export function ReportPdf({ report }: { report: Report }) {
  const { company, insights, plan, sectors, history, custom } = report
  if (!insights) {
    return (
      <Document>
        <Page size="A4" style={s.page}>
          <Text style={s.title}>Sem dados para o relatório</Text>
          <Text style={s.p}>Lance uma campanha e colete respostas para gerar o inventário.</Text>
        </Page>
      </Document>
    )
  }
  const sectorName = (id: string | null) => sectors.find((x) => x.id === id)?.name ?? "Toda a empresa"
  const t = insights.totals
  let n = 0
  const next = () => String(++n)

  return (
    <Document title={`Relatório PGR · ${company.name}`} author="Equilibra" subject="Inventário de riscos psicossociais (NR-1)">
      <Page size="A4" style={s.page}>
        <View style={s.brandRow}>
          <View style={s.brandMark} />
          <Text style={s.brandName}>equilibra</Text>
        </View>
        <Text style={s.eyebrow}>Inventário de riscos psicossociais · NR-1</Text>
        <Text style={s.title}>{company.name}</Text>
        <Text style={s.meta}>
          CNPJ {formatCnpj(company.cnpj)} · {insights.campaign.name} · {formatDate(insights.campaign.startsAt)} a {formatDate(insights.campaign.endsAt)} · emitido em{" "}
          {new Date().toLocaleDateString("pt-BR")}
        </Text>

        <View style={s.kpis}>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Participação</Text>
            <Text style={s.kpiValue}>{t.rate}%</Text>
            <Text style={s.p}>
              {t.responses} de {t.headcount} pessoas
            </Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Índice geral de risco</Text>
            <Text style={s.kpiValue}>{t.index}/100</Text>
            <Chip score={t.index} />
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Dimensões em alerta</Text>
            <Text style={s.kpiValue}>{t.alerts}</Text>
            <Text style={s.p}>{t.critical} crítica(s)</Text>
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Ações no plano</Text>
            <Text style={s.kpiValue}>{plan.length}</Text>
            <Text style={s.p}>{plan.filter((a) => a.status === "done").length} concluída(s)</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.h2} minPresenceAhead={60}>
            <Text style={s.num}>{next()} </Text>Metodologia
          </Text>
          <Text style={s.p}>
            Questionário anônimo autoaplicável com {QUESTIONS.length} itens em {DIMENSIONS.length} dimensões psicossociais ({DIMENSIONS.map((d) => d.name).join(", ")}),
            escala de frequência de 5 pontos. Cada dimensão recebe um score de 0 (sem risco) a 100 (risco máximo): baixo &lt; 25, moderado 25–49, alto 50–74, crítico 75 ou mais.
            A classificação combina probabilidade (derivada do score, 1–5) e severidade (1–5). Grupos com menos de {K_ANONYMITY} respostas não são exibidos isoladamente.
          </Text>
        </View>

        <View style={s.section}>
          <Text style={s.h2} minPresenceAhead={60}>
            <Text style={s.num}>{next()} </Text>Inventário de riscos
          </Text>
          <View style={s.table}>
            <View style={s.tr}>
              <Text style={[s.th, { flex: 3 }]}>Fator de risco</Text>
              <Text style={[s.th, { flex: 1 }]}>Score</Text>
              <Text style={[s.th, { flex: 1 }]}>Prob.</Text>
              <Text style={[s.th, { flex: 1 }]}>Sev.</Text>
              <Text style={[s.th, { flex: 1.4 }]}>Nível</Text>
              <Text style={[s.th, { flex: 3 }]}>Setores mais expostos</Text>
            </View>
            {insights.ranking.map((d) => {
              const inv = inventoryRating(d.score, d.severity)
              const exposed = insights.heatmap.filter((h) => (h.scores[d.id] ?? 0) >= 50).map((h) => h.label).join(", ")
              return (
                <View key={d.id} style={s.tr} wrap={false}>
                  <Text style={{ flex: 3 }}>{d.name}</Text>
                  <Text style={{ flex: 1 }}>{d.score}</Text>
                  <Text style={{ flex: 1 }}>{inv.probability}</Text>
                  <Text style={{ flex: 1 }}>{inv.severity}</Text>
                  <View style={{ flex: 1.4 }}>
                    <Chip score={d.score} />
                  </View>
                  <Text style={{ flex: 3, color: MUTED }}>{exposed || "—"}</Text>
                </View>
              )
            })}
          </View>
        </View>

        {insights.heatmap.length > 0 && (
          <View style={s.section}>
            <Text style={s.h2} minPresenceAhead={60}>
              <Text style={s.num}>{next()} </Text>Mapa por setor
            </Text>
            <View style={s.table}>
              <View style={s.tr}>
                <Text style={[s.th, { flex: 2.2 }]}>Setor</Text>
                {DIMENSIONS.map((d) => (
                  <Text key={d.id} style={[s.th, { flex: 1 }]}>
                    {d.short}
                  </Text>
                ))}
              </View>
              {insights.heatmap.map((row) => (
                <View key={row.key} style={s.tr} wrap={false}>
                  <Text style={{ flex: 2.2 }}>
                    {row.label} <Text style={{ color: MUTED }}>({row.responses})</Text>
                  </Text>
                  {DIMENSIONS.map((d) => {
                    const v = row.scores[d.id]
                    const c = v === null ? null : RISK[riskLevel(v)]
                    return (
                      <View key={d.id} style={{ flex: 1, paddingRight: 3 }}>
                        <Text style={{ backgroundColor: c?.bg ?? "#f0f2ee", color: c?.fg ?? MUTED, textAlign: "center", borderRadius: 3, paddingVertical: 2 }}>{v ?? "—"}</Text>
                      </View>
                    )
                  })}
                </View>
              ))}
            </View>
          </View>
        )}
        <View style={s.section}>
          <Text style={s.h2} minPresenceAhead={60}>
            <Text style={s.num}>{next()} </Text>Plano de ação
          </Text>
          {plan.length ? (
            <View style={s.table}>
              <View style={s.tr}>
                <Text style={[s.th, { flex: 4 }]}>O quê / como</Text>
                <Text style={[s.th, { flex: 1.4 }]}>Dimensão</Text>
                <Text style={[s.th, { flex: 1.6 }]}>Onde</Text>
                <Text style={[s.th, { flex: 1.5 }]}>Quem</Text>
                <Text style={[s.th, { flex: 1.2 }]}>Quando</Text>
                <Text style={[s.th, { flex: 1.4 }]}>Status</Text>
              </View>
              {plan.map((a) => (
                <View key={a.id} style={s.tr} wrap={false}>
                  <View style={{ flex: 4, paddingRight: 6 }}>
                    <Text>{a.what}</Text>
                    {a.how ? <Text style={{ color: MUTED, fontSize: 8 }}>Como: {a.how}</Text> : null}
                  </View>
                  <Text style={{ flex: 1.4 }}>{dimensionMeta(a.dimension)?.short}</Text>
                  <Text style={{ flex: 1.6 }}>{sectorName(a.sectorId)}</Text>
                  <Text style={{ flex: 1.5 }}>{a.who || "—"}</Text>
                  <Text style={{ flex: 1.2 }}>{a.due ? formatDate(a.due) : "—"}</Text>
                  <Text style={{ flex: 1.4 }}>{STATUS[a.status]}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={s.p}>Nenhuma ação registrada ainda.</Text>
          )}
        </View>

        {history.length > 1 && (
          <View style={s.section} wrap={false}>
            <Text style={s.h2} minPresenceAhead={60}>
              <Text style={s.num}>{next()} </Text>Evolução (monitoramento contínuo)
            </Text>
            <View style={s.table}>
              <View style={s.tr}>
                <Text style={[s.th, { flex: 3 }]}>Campanha</Text>
                <Text style={[s.th, { flex: 1.3 }]}>Início</Text>
                <Text style={[s.th, { flex: 1.3 }]}>Respostas</Text>
                <Text style={[s.th, { flex: 1.6 }]}>Índice</Text>
              </View>
              {history.map((h) => (
                <View key={h.id} style={s.tr}>
                  <Text style={{ flex: 3 }}>{h.name}</Text>
                  <Text style={{ flex: 1.3 }}>{formatDate(h.startsAt)}</Text>
                  <Text style={{ flex: 1.3 }}>
                    {h.responses} ({h.rate}%)
                  </Text>
                  <Text style={{ flex: 1.6 }}>
                    {h.index} · {RISK_LEVELS[riskLevel(h.index)].label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {custom?.enough && custom.items.length > 0 && (
          <View style={s.section} wrap={false}>
            <Text style={s.h2} minPresenceAhead={60}>
              <Text style={s.num}>{next()} </Text>Perguntas da empresa
            </Text>
            <Text style={[s.p, { marginBottom: 6 }]}>Perguntas adicionais definidas pela empresa. Não compõem o score NR-1.</Text>
            <View style={s.table}>
              <View style={s.tr}>
                <Text style={[s.th, { flex: 5 }]}>Pergunta</Text>
                <Text style={[s.th, { flex: 1.2 }]}>Média (1–5)</Text>
                <Text style={[s.th, { flex: 1.6 }]}>Freq. + Sempre</Text>
              </View>
              {custom.items.map((q) => (
                <View key={q.id} style={s.tr}>
                  <Text style={{ flex: 5 }}>{q.text}</Text>
                  <Text style={{ flex: 1.2 }}>{q.average.toFixed(1)}</Text>
                  <Text style={{ flex: 1.6 }}>{q.favorable}%</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={s.section} wrap={false}>
          <Text style={s.h2} minPresenceAhead={60}>
            <Text style={s.num}>{next()} </Text>Responsabilidade
          </Text>
          <Text style={s.p}>
            Este documento apoia a gestão dos riscos psicossociais no GRO/PGR (NR-1, Portaria MTE nº 1.419/2024). A validação e a assinatura do PGR cabem ao responsável técnico
            designado pela organização.
          </Text>
          <View style={s.sign}>
            <Text style={s.signLine}>Responsável técnico</Text>
            <Text style={s.signLine}>Representante da empresa</Text>
          </View>
        </View>
        <Footer company={company.name} />
      </Page>
    </Document>
  )
}
