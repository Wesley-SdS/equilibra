# PRD 04 — Meu Balcão: back-office de bolso para MEI de serviços

| Campo | Valor |
|---|---|
| Status | Planejado |
| Versão | 1.0 — 15/10/2026 |
| Stack | Next.js (PWA) · jStack · Drizzle · Postgres · Zod · Tailwind · Motion · API de NFS-e Nacional · PSP Pix |
| Público | MEIs e microempresas de serviços: beleza, manutenção, aulas, design, alimentação sob encomenda |

---

## 1. Problema
- Os MEIs são a **maior parte das empresas abertas em 2026** (Sebrae), e os serviços lideram as aberturas.
- Mais de **50% das microempresas fecham antes de 5 anos**. Falta de controle de caixa é uma causa recorrente.
- A rotina do MEI fica espalhada em 4 ou 5 lugares: agenda no WhatsApp, cobrança por Pix manual, nota fiscal no portal do governo, DAS esquecido e controle em caderno.
- **Riscos que o MEI não enxerga:** estourar o **limite anual de faturamento** (e ser desenquadrado com imposto retroativo), atrasar o DAS e misturar dinheiro pessoal com o do negócio.

## 2. Visão
> "Seu negócio inteiro no celular: agenda, cobrança, nota e imposto em dia."

## 3. Métricas
| Objetivo | Métrica | Meta 6 meses |
|---|---|---|
| Ativação | % que emite a 1ª cobrança Pix em até 24h | ≥ 50% |
| Hábito | Usuários ativos semanais / mensais | ≥ 45% |
| Conversão | Free → pago | ≥ 6% |
| Receita | MRR | R$ 40 mil |

## 4. Personas
- **Bruna, manicure (MEI)**: atende 8 clientes por dia e cobra por Pix.
- **Diego, técnico de ar-condicionado (MEI)**: precisa emitir nota para clientes empresa.
- **Ana, professora particular**: tem cobranças recorrentes mensais.

## 5. Escopo MVP
| # | Funcionalidade | Prioridade |
|---|---|---|
| F1 | Cadastro rápido: CNPJ MEI (busca automática de dados), serviços e preços | P0 |
| F2 | Agenda com link público de agendamento | P0 |
| F3 | Cobrança Pix com QR Code e link, confirmação automática de pagamento e recibo | P0 |
| F4 | Emissão de NFS-e (padrão nacional) em 2 toques a partir de uma cobrança paga | P0 |
| F5 | **Termômetro do limite MEI**: faturamento acumulado no ano, projeção e alerta em 70%, 90% e 100% | P0 |
| F6 | Lembrete do DAS mensal e da DASN-SIMEI anual | P0 |
| F7 | Fluxo de caixa simples (entradas e saídas, separação pessoal × negócio) | P1 |
| F8 | Cobrança recorrente (mensalidades) | P1 |

## 6. Requisitos-chave
- PWA instalável e offline-first para agenda e caixa, com sincronização quando houver conexão.
- O onboarding completo leva **menos de 3 minutos**.
- O webhook do PSP confirma o Pix, e o evento é empurrado em tempo real para a tela da cobrança (WebSocket).
- O limite de faturamento do MEI fica em configuração versionada, porque pode mudar por lei.

## 7. Modelo de dados (resumo)
`businesses(cnpj, cnae, limite_ano)`, `services`, `clients`, `appointments`, `charges(valor, status, pix_txid, pago_em)`, `invoices(nfse_numero, status)`, `cash_entries(tipo, categoria, valor, data)`, `reminders`.

## 8. Modelo de negócio
| Plano | Preço | Inclui |
|---|---|---|
| Grátis | R$ 0 | agenda, 20 cobranças/mês, termômetro MEI |
| Pro | R$ 29,90/mês | cobranças e NFS-e ilimitadas, recorrência, caixa |
| Receita extra | — | spread no Pix ou na antecipação via PSP parceiro (rev-share) |

## 9. Mercado
- São cerca de 15 milhões de MEIs ativos (Receita/Sebrae, ordem de grandeza: **validar**). Com conversão de 1% para o Pro, isso dá ≈ R$ 54 mi de ARR.

## 10. Concorrência
Bancos digitais (Nubank PJ, Inter, InfinitePay, Cora) oferecem conta e Pix de graça. Apps de agenda (Trinks, AgendaPro) não emitem nota nem controlam o limite. Nosso diferencial é **unir agenda, cobrança, nota e limite MEI** num fluxo único e **neutro em relação ao banco**.

**Risco competitivo alto:** o ticket é baixo e há guerra de preço com os bancos. A estratégia é nichar por vertical (ex.: beleza) e usar a distribuição via comunidades e influenciadores do nicho.

## 11. Riscos
- **CAC alto para ticket baixo:** crescimento orgânico (link de agendamento viral, com "feito com Meu Balcão") e indicação.
- **Instabilidade da API de NFS-e nacional:** fila com reprocessamento e fallback por município.

## 12. Roadmap
| Fase | Período | Entrega |
|---|---|---|
| Descoberta | Mai/2027 | 20 entrevistas com MEIs de beleza e manutenção |
| MVP | Jun–Jul/2027 | F1–F6 |
| v1.1 | Set/2027 | Caixa, recorrência, rev-share com PSP |

## 13. Critérios de aceite
- [ ] Da criação da cobrança até o pagamento confirmado na tela sem recarregar: menos de 5 s após o webhook.
- [ ] O termômetro do limite bate com a soma das cobranças pagas e das entradas manuais.
- [ ] A NFS-e é emitida a partir de uma cobrança paga em no máximo 2 toques.
