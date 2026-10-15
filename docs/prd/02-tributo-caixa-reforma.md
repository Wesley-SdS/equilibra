# PRD 02 — Tributo Claro: copiloto de caixa da Reforma Tributária

| Campo | Valor |
|---|---|
| Status | Planejado (após o MVP do Equilibra) |
| Versão | 1.0 — 15/10/2026 |
| Stack | Next.js · jStack · Drizzle · Postgres · Zod · Tailwind · Motion · fila (Upstash QStash) para processar XML |
| Público | PMEs prestadoras de serviço e comércio B2B no Lucro Presumido, Lucro Real ou Simples Híbrido |

---

## 1. Problema
A Reforma Tributária (EC 132/2023, LC 214/2025) substitui PIS, Cofins, ICMS e ISS por **CBS e IBS**.
- **2026:** ano de testes, com alíquota simbólica de 0,9% de CBS e 0,1% de IBS destacada nas notas.
- **2027:** a CBS passa a valer integralmente e o **split payment** começa (facultativo e B2B no início). Nesse modelo o imposto é retido no pagamento e a empresa recebe **apenas o valor líquido**.
- Hoje a PME usa o intervalo entre a venda e o recolhimento como **capital de giro**, e esse intervalo desaparece.
- Só 17% das MPEs usam ferramentas digitais estruturadas (Sebrae/Brasscom). A maioria depende do contador, que também está sobrecarregado.

**Perguntas que o dono não consegue responder hoje:**
1. "Quanto vou pagar de imposto em 2027 comparado com hoje?"
2. "Preciso reajustar meus preços? Quanto?"
3. "Quanto de caixa vou precisar a mais quando o split payment começar?"
4. "Vale a pena sair do Simples para o regime híbrido para gerar crédito para meus clientes?"

## 2. Visão
> "Saiba hoje quanto a reforma vai custar no seu caixa amanhã."

Um simulador que lê as **notas fiscais reais** da empresa (XML de NF-e e NFS-e), recalcula cada operação no regime novo e entrega **preço, margem e caixa projetados** de 2026 a 2033.

**Aviso:** o produto é uma ferramenta de simulação e não substitui o contador. Ele deve gerar um relatório que o contador consegue validar.

## 3. Métricas
| Objetivo | Métrica | Meta 6 meses |
|---|---|---|
| Ativação | % de usuários que importam ≥ 3 meses de XML | ≥ 50% |
| Valor | Relatórios compartilhados com o contador | ≥ 1 por empresa ativa |
| Receita | MRR | R$ 80 mil |
| Canal | Empresas vindas de escritórios contábeis parceiros | ≥ 50% |

## 4. Personas
- **Marcos, dono de empresa de serviços B2B (R$ 4 mi/ano)**: quer saber o impacto no preço e no caixa.
- **Patrícia, contadora com 80 clientes**: precisa simular a carteira inteira e priorizar quem está em risco.
- **Financeiro de PME**: precisa de projeção de caixa mês a mês.

## 5. Escopo MVP
| # | Funcionalidade | Prioridade |
|---|---|---|
| F1 | Upload em lote de XML (NF-e / NFS-e nacional) ou conexão com a API de um ERP | P0 |
| F2 | Classificação automática de NCM/NBS, CFOP e regime e cálculo da carga atual | P0 |
| F3 | Motor de regras CBS/IBS por ano de transição (2026–2033), versionado | P0 |
| F4 | Simulador de cenários: regime atual × Simples Híbrido × Presumido × Real | P0 |
| F5 | Calculadora de repasse de preço para manter a margem, por produto ou serviço | P0 |
| F6 | Projeção de caixa com split payment (D+0 líquido × prazo médio de recebimento atual) | P0 |
| F7 | Relatório PDF compartilhável com o contador | P0 |
| F8 | Alertas de mudança de regra (feed regulatório curado) | P1 |
| F9 | Painel multicliente do contador | P1 |

**Fora do MVP:** emissão de notas, apuração oficial, integração com o Comitê Gestor do IBS e conciliação bancária.

## 6. Requisitos-chave
- O motor de regras é **declarativo** (JSON versionado por vigência) para permitir atualizações sem deploy.
- Cada cálculo guarda a versão da regra usada, para auditoria.
- O processamento de XML é assíncrono (fila) e dá feedback de progresso via WebSocket do jStack.
- Os XML ficam criptografados em repouso e o cliente pode apagá-los após o processamento (LGPD e sigilo fiscal).

## 7. Modelo de dados (resumo)
`companies`, `tax_profiles(regime, cnae, uf, municipio)`, `documents(xml_hash, tipo, emitido_em, valor)`, `document_items(ncm_nbs, cfop, valor, tributos_atuais_json)`, `rule_sets(versao, vigencia_inicio, vigencia_fim, regras_json)`, `simulations(company_id, rule_set_id, cenario, resultado_json)`.

## 8. Modelo de negócio
| Plano | Preço | Inclui |
|---|---|---|
| Diagnóstico avulso | R$ 497 (único) | 12 meses de XML, 1 relatório |
| PME | R$ 189/mês | simulações ilimitadas, alertas, projeção de caixa |
| Contador | R$ 690/mês (até 30 CNPJs) | painel multicliente, white-label do relatório |

## 9. Mercado
- Cerca de 1,9 milhão de empresas fora do Simples (Presumido e Real) e mais as do Simples que vendem B2B (ordem de grandeza: **validar com dados da Receita**).
- Janela de urgência: **2026–2028**. Depois disso o produto evolui para planejamento tributário contínuo.

## 10. Concorrência
ERPs (Omie, Bling, Conta Azul, TOTVS) estão adaptando **emissão e apuração**. O foco deles é cumprir a obrigação, não responder a pergunta de decisão ("e o meu caixa?"). Consultorias tributárias são caras. Nosso diferencial é ser **neutro em relação ao ERP**, focado em decisão e caixa, e ter canal via contador.

## 11. Riscos
- **Regras ainda em regulamentação:** usar o motor versionado com aviso claro de "simulação".
- **Responsabilidade:** termos explícitos e incentivo à revisão pelo contador.
- **ERPs copiarem a funcionalidade:** velocidade e canal contador como diferencial, além de uma futura integração como plugin dos ERPs.

## 12. Roadmap
| Fase | Período | Entrega |
|---|---|---|
| Descoberta | Dez/2026 | 15 entrevistas com contadores e 10 com PMEs |
| MVP | Jan–Fev/2027 | F1–F7 |
| v1.1 | Abr/2027 | Painel do contador, alertas |
| v2 | 2º sem/2027 | Conexão bancária, projeção de caixa contínua |

## 13. Critérios de aceite
- [ ] Importar 1.000 XMLs em menos de 2 minutos com progresso em tempo real.
- [ ] A carga tributária atual calculada difere menos de 2% da apuração real em 5 empresas piloto.
- [ ] O relatório mostra o impacto em preço, margem e caixa por ano de transição.
