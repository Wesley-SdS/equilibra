# PRD 01 — Equilibra: gestão de riscos psicossociais (NR-1) para PMEs

| Campo | Valor |
|---|---|
| Status | v1 implementada (F1–F12 + carteira, papéis, evolução, kit de divulgação) |
| Versão | 1.0 — 15/10/2026 |
| Stack | Next.js 15 (App Router) · jStack (Hono RPC type-safe) · Drizzle ORM · Postgres · Zod · Tailwind CSS · Motion |
| Público | PMEs com 10–500 funcionários CLT, contabilidades e consultorias de SST |

---

## 1. Contexto e problema

A Portaria MTE nº 1.419/2024 atualizou a **NR-1** e passou a exigir que os **fatores de risco psicossociais** (excesso de demanda, metas abusivas, assédio, falta de autonomia, conflitos interpessoais, jornada) sejam identificados, avaliados, tratados e monitorados dentro do **GRO/PGR** da empresa.

- Vigência plena: **25/05/2026**. Autuações possíveis desde **26/05/2026**.
- O ano de adaptação (mai/2025–mai/2026) foi educativo e **não será prorrogado** (declaração do ministro do Trabalho).
- Vale para **toda empresa com empregado CLT**, independentemente do porte.

**A dor real:**
1. A PME não sabe *como* medir risco psicossocial. Não tem RH estruturado nem psicólogo organizacional.
2. Consultorias cobram de R$ 8 mil a R$ 40 mil por diagnóstico pontual, e a norma exige **acompanhamento contínuo**.
3. O funcionário só responde com sinceridade se o anonimato for real, e planilha ou Google Forms não garantem isso.
4. A empresa precisa de **evidência documental** (inventário de riscos, plano de ação, histórico) para apresentar na fiscalização.
5. As contabilidades e empresas de SST que atendem PMEs estão sendo cobradas pelos clientes e não têm ferramenta própria.

## 2. Visão do produto

> "Do questionário ao PGR em 7 dias, com anonimato garantido e acompanhamento contínuo."

O Equilibra é um SaaS multiempresa que:
1. Aplica **questionários psicossociais anônimos** baseados em instrumentos reconhecidos (modelo inspirado em COPSOQ / HSE Management Standards, com 7 dimensões).
2. Calcula o **índice de risco por dimensão e por setor**, respeitando um **mínimo de respostas por grupo** (k-anonimato, padrão k=5).
3. Gera o **inventário de riscos psicossociais** e o **plano de ação** (5W2H) prontos para anexar ao PGR.
4. Oferece um **canal de relato anônimo** (assédio, conflitos), com protocolo de acompanhamento.
5. Mantém o **ciclo contínuo**: reavaliação periódica, evolução histórica e trilha de auditoria.

## 3. Objetivos e métricas

| Objetivo | Métrica | Meta 6 meses após o lançamento |
|---|---|---|
| Ativação | % de empresas que lançam a 1ª campanha em até 7 dias | ≥ 60% |
| Engajamento | Taxa de resposta média por campanha | ≥ 55% |
| Valor percebido | % de empresas que exportam o relatório PGR | ≥ 70% |
| Receita | MRR | R$ 120 mil |
| Canal | % de novas empresas vindas de parceiros (contadores/SST) | ≥ 40% |
| Retenção | Churn mensal de logos | ≤ 2,5% |

## 4. Personas

1. **Carla, dona/gestora de PME (45 funcionários)**: tem medo de multa e não tem tempo. Quer "resolver isso de forma certa e rápida".
2. **Rafael, analista de RH/DP**: é quem opera a ferramenta. Precisa convidar funcionários, acompanhar adesão e gerar relatórios.
3. **Juliana, técnica de SST / consultora parceira**: atende 30 empresas e precisa de um painel multiempresa (white-label no futuro).
4. **Funcionário respondente**: responde pelo celular em até 6 minutos e precisa *confiar* no anonimato.

## 5. Escopo

### 5.1 MVP (este repositório)

| # | Funcionalidade | Prioridade |
|---|---|---|
| F1 | Landing page de conversão (problema, prazo NR-1, como funciona, planos, FAQ) | P0 |
| F2 | Onboarding da empresa: nome, CNPJ, nº de funcionários, setores | P0 |
| F3 | Cadastro de setores e quantidade de pessoas por setor | P0 |
| F4 | Criação de campanha de avaliação (período, setores, questionário padrão) | P0 |
| F5 | Link público anônimo por campanha (sem login, sem dados pessoais) | P0 |
| F6 | Questionário mobile-first: 28 itens em 7 dimensões, escala Likert de 5 pontos, barra de progresso, salvamento local | P0 |
| F7 | Motor de cálculo: score por dimensão (0–100), classificação de risco (baixo, moderado, alto, crítico) e k-anonimato | P0 |
| F8 | Dashboard: taxa de resposta, mapa de calor setor × dimensão, ranking de riscos | P0 |
| F9 | Plano de ação: sugestões automáticas por dimensão crítica, edição no formato 5W2H, status | P0 |
| F10 | Relatório PGR imprimível (inventário + plano + metodologia) | P0 |
| F11 | Canal de relato anônimo com protocolo e consulta de status | P1 |
| F12 | Trilha de auditoria (quem criou ou alterou o quê e quando) | P1 |

### 5.2 Fora do MVP (roadmap)
- Painel multiempresa para parceiros e white-label (v1.1).
- Envio de convites por WhatsApp e e-mail com lembretes (v1.1).
- Assinatura digital do relatório pelo responsável técnico (v1.2).
- Integração com eSocial (S-2240) e softwares de SST (v1.3).
- Benchmarks setoriais por CNAE (v2).
- Trilhas de capacitação de lideranças em microlearning (v2).

## 6. Requisitos funcionais detalhados

### F4/F5 — Campanha e link anônimo
- Uma campanha tem: `nome`, `inicio`, `fim`, `setores[]`, `status` (rascunho → ativa → encerrada).
- Cada campanha ativa gera um `token` público (24+ caracteres, URL-safe) em `/r/{token}`.
- O respondente escolhe seu **setor** numa lista. Nenhum outro dado identificável é coletado.
- **Não** guardar IP, user-agent nem horário exato (o `created_at` é truncado para o dia).
- Proteção contra respostas duplicadas via cookie de sessão por campanha. Isso é aceito como limitação: anonimato > unicidade.

### F6 — Questionário
- As 7 dimensões, com 4 itens cada:
  1. **Demandas** (carga, ritmo, prazos)
  2. **Controle e autonomia**
  3. **Apoio da liderança**
  4. **Apoio dos colegas**
  5. **Relacionamentos e assédio**
  6. **Clareza de papel**
  7. **Reconhecimento e mudanças**
- Escala: 1 = Nunca … 5 = Sempre. Os itens têm polaridade (`invertido: boolean`) para normalizar o "quanto maior, pior".
- UX: um item por tela no mobile, com transição animada, atalhos de teclado de 1 a 5 no desktop, progresso visível e botão de voltar.

### F7 — Cálculo de risco
- Para cada item: `risco_item = invertido ? (resp - 1) : (5 - resp)` → 0..4.
- Score da dimensão = média dos itens × 25 → 0..100 (100 = risco máximo).
- Classificação: `< 25` baixo · `25–49` moderado · `50–74` alto · `≥ 75` crítico.
- Se um setor tiver menos de **k=5** respostas, seus dados aparecem agregados como "Outros setores" e nunca isoladamente.
- Probabilidade × severidade do inventário: a probabilidade vem do score e a severidade vem de um peso padrão da dimensão (editável).

### F9 — Plano de ação
- Cada dimensão alta ou crítica gera de 2 a 3 ações sugeridas a partir de uma biblioteca (ex.: "Revisar distribuição de metas com a liderança do setor").
- Campos 5W2H: o quê, por quê, onde (setor), quem, quando (prazo), como, quanto (custo estimado).
- Status: a fazer → em andamento → concluída.

### F10 — Relatório PGR
- Página `/app/relatorio` otimizada para impressão (`@media print`): capa, metodologia, participação, inventário de riscos (tabela), plano de ação e assinatura do responsável.

### F11 — Canal de relato
- Formulário público `/canal/{empresaSlug}` com categoria, descrição e opção de anexar. Ao enviar, gera um protocolo (ex.: `EQ-7F3K-92QD`) para consulta posterior.

## 7. Requisitos não funcionais
- **Privacidade (LGPD):** dados de respostas são anônimos por desenho, sem PII. Dados da empresa e dos usuários ficam sob contrato de operador. Há política de retenção de 5 anos para o PGR.
- **Segurança:** isolamento multi-tenant por `company_id` em todas as queries, cookies `httpOnly`, rate limit nos endpoints públicos e validação Zod em 100% das entradas.
- **Performance:** LCP < 2,0 s no 4G para o questionário e dashboard < 1 s com até 5 mil respostas.
- **Acessibilidade:** WCAG 2.2 AA, navegação por teclado, contraste ≥ 4.5:1 e `prefers-reduced-motion` respeitado.
- **Responsivo:** o questionário é mobile-first (360 px). O painel começa em 1024 px e se adapta ao mobile.

## 8. Modelo de dados (MVP)

```
companies(id, name, cnpj, employees, slug, created_at)
users(id, company_id, name, email, role[owner|admin|viewer])
sectors(id, company_id, name, headcount)
campaigns(id, company_id, name, token, starts_at, ends_at, status)
responses(id, campaign_id, sector_id, created_day)
answers(response_id, question_id, value)
actions(id, company_id, campaign_id, dimension, what, why, sector_id, who, due, how, cost, status)
reports_channel(id, company_id, protocol, category, body, status, created_day)
audit_log(id, company_id, user_id, action, entity, entity_id, at)
```

## 9. Modelo de negócio

| Plano | Público | Preço | Inclui |
|---|---|---|---|
| **Essencial** | até 50 funcionários | R$ 249/mês | 2 campanhas/ano, relatório PGR, plano de ação |
| **Profissional** | até 200 | R$ 590/mês | campanhas ilimitadas, canal de relato, histórico |
| **Empresa** | 200–500 | R$ 1.290/mês | multi-unidades, SSO, suporte dedicado |
| **Parceiro** | contadores/SST | a partir de R$ 990/mês (10 empresas) + R$ 59/empresa extra | painel multiempresa, white-label |

Desconto de 2 meses no plano anual.

## 10. Mercado (estimativa para o pitch)
- Cerca de **1,3 milhão** de empresas com 10–499 funcionários no Brasil (RAIS/Sebrae, ordem de grandeza: **validar com o dado mais recente**).
- **TAM:** 1,3 mi × ticket médio de R$ 4.800/ano ≈ **R$ 6,2 bi/ano**.
- **SAM** (Sudeste e Sul, setores de serviços e indústria leve, com ~40% do total): ≈ R$ 2,5 bi.
- **SOM em 3 anos** (0,5% do SAM): ≈ R$ 12,5 mi de ARR.

## 11. Concorrência e diferencial

| Alternativa | Limitação | Diferencial do Equilibra |
|---|---|---|
| Consultoria de SST | Cara, pontual e lenta | Contínuo, 10× mais barato, pronto em 7 dias |
| Google Forms + planilha | Sem anonimato garantido nem metodologia | k-anonimato, cálculo validado, relatório pronto |
| Plataformas de clima (enterprise) | Foco em engajamento, caras, não geram PGR | Foco em compliance NR-1 com saída documental |
| Apps de saúde mental (benefício) | Tratam o indivíduo, não o risco organizacional | Atuam na **organização do trabalho**, que é o que a NR-1 exige |

## 12. Riscos e mitigação
- **Mudança na regulamentação:** o motor de questionários é configurável e há revisão jurídica trimestral.
- **Baixa taxa de resposta:** UX de 6 minutos, comunicação pronta para o RH divulgar e QR code.
- **Desconfiança no anonimato:** a página "Como protegemos você" aparece antes do questionário, junto com o k-anonimato e a ausência de rastreamento técnico.
- **Responsabilidade técnica:** o produto apoia a gestão, mas a assinatura do PGR continua sendo do responsável técnico da empresa (isso fica explícito nos termos).

## 13. Roadmap

| Fase | Período | Entrega |
|---|---|---|
| MVP | Out–Nov/2026 | F1–F10 |
| Beta fechado | Dez/2026 | 20 empresas + 3 parceiros contábeis |
| v1.0 | Jan/2027 | Canal de relato, auditoria, cobrança recorrente |
| v1.1 | Mar/2027 | Painel do parceiro, WhatsApp |
| v2 | 2º sem/2027 | Benchmarks por CNAE, capacitação de lideranças |

## 14. Critérios de aceite do MVP
- [ ] Uma empresa nova consegue, sem ajuda, criar setores, lançar uma campanha e copiar o link em menos de 5 minutos.
- [ ] Um respondente completa o questionário no celular em menos de 6 minutos.
- [ ] Um setor com menos de 5 respostas nunca aparece isolado no dashboard nem no relatório.
- [ ] O dashboard mostra o mapa de calor e o ranking de riscos corretos para um conjunto de respostas de teste.
- [ ] O relatório PGR imprime em A4 sem quebras de layout.
- [ ] Todas as entradas de API são validadas com Zod e os tipos são inferidos de ponta a ponta no client.
