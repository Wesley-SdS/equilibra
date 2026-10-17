# Prompts para desenvolver as aplicações 2, 3 e 4

Abra uma sessão nova do Claude Code para cada aplicação, com a pasta `C:\Users\wesley.santos\Documents\github` como diretório, e cole o prompt correspondente. A aplicação 1 (NR-1 psicossocial) é o **Equilibra**, já desenvolvido em `C:\Users\wesley.santos\Documents\github\equilibra`. Ele serve de referência técnica para as outras.

---

## Prompt 2: Tributo Claro (copiloto da Reforma Tributária para o caixa da PME)

```text
Quero desenvolver do zero, completo e pronto para produção, a aplicação "Tributo Claro": um copiloto da Reforma Tributária (CBS/IBS e split payment) para o caixa de PMEs brasileiras. Ela vai para uma apresentação a investidores, então precisa ser um produto completo, moderno e funcional, não um MVP simples.

## Contexto e PRD
- Já existe um PRD em C:\Users\wesley.santos\Documents\github\equilibra\docs\prd\02-tributo-caixa-reforma.md. Leia inteiro antes de tudo.
- O PRD é de 15/10/2026 e as regras da reforma mudam rápido. Antes de codar, pesquise na web o estado atual (LC 214/2025, alíquotas de teste de 2026, cronograma do split payment em 2027, regras do Simples Híbrido, campos de IBS/CBS na NF-e/NFS-e, notas técnicas da Receita e do Comitê Gestor). Atualize o PRD em docs/prd/ no novo repositório com o que mudou, citando as fontes, e marque o que for estimativa.
- Posicionamento recomendado no PRD: nicho em prestadores de serviço B2B. Confirme ou ajuste com base na pesquisa.

## Repositório
- Crie um repositório novo em C:\Users\wesley.santos\Documents\github\tributo-claro (git init, branch main) e, no fim, um repositório privado no GitHub (gh já está logado como Wesley-SdS) com push.
- Antes do primeiro commit, rode neste repositório: git config user.email "wesleysantos.0095@gmail.com" e git config user.name "Wesley Santos". A Vercel Hobby só faz deploy de commits do dono da conta.

## Stack obrigatória (a mesma do Equilibra)
Next.js 15 (App Router) + jStack (Hono RPC type-safe de ponta a ponta) + Drizzle ORM + Postgres (PGlite local, Neon em produção) + Zod 4 + TanStack Query + Tailwind CSS 4 + Motion + Vitest.

Reaproveite padrões e código do Equilibra (leia antes de escrever o equivalente):
- src/server/jstack.ts, src/server/index.ts: procedures pública, privada, editor e dono; e o handler de erro registrado em cada sub-router, porque o jStack 1.1 não repassa o onError.
- src/server/db/index.ts: PGlite local × Postgres via DATABASE_URL, migrations no build (scripts/migrate.ts) e cache global.
- src/server/auth.ts e src/server/routers/auth-router.ts: sessão HMAC, multiempresa, convites, recuperação de senha.
- src/server/email/: Resend com fallback local.
- src/server/billing/ e src/lib/plans.ts: planos, limites, teste grátis e provedor plugável.
- src/server/jev.ts e src/server/decisions.ts: Jev via Vercel AI Gateway com fallback por regras.
- src/app/globals.css (tokens claro/escuro), src/components/theme.tsx, src/components/ui/primitives.tsx, src/lib/utils.ts (cn com tailwind-merge).
- tests/*.test.ts: testes com o router real e Postgres em memória, simulando só o HTTP externo.
- vercel.json, docs/deploy.md, .env.example.

## Escopo funcional mínimo (detalhe no PRD)
Upload em lote de XML (NF-e/NFS-e) com processamento assíncrono e progresso em tempo real; classificação e cálculo da carga atual; motor de regras CBS/IBS declarativo e versionado por vigência (2026–2033); simulador de regimes (atual × Simples Híbrido × Presumido × Real); calculadora de repasse de preço; projeção de caixa com split payment; relatório PDF para o contador; painel multicliente para escritórios contábeis; trilha de auditoria; planos e limites; landing de conversão; modo claro e escuro.
- Use o Jev (TypeSafe, via Vercel AI Gateway, modelo typesafe-ai/jev, endpoint https://ai-gateway.vercel.sh/typesafe/v1/systemone, credencial AI_GATEWAY_API_KEY ou OIDC da Vercel) para decisões: classificar itens e serviços em NBS/NCM quando o XML for ambíguo, sinalizar contratos com risco de margem e priorizar alertas. O cálculo tributário em si deve ser determinístico e auditável (nunca IA).
- Deixe claro na interface que é simulação e não substitui o contador.

## Design e UX
- Use o Claude Design (Artifact do tipo Design) para desenhar landing, painel e telas-chave antes de codar. Visual moderno no estilo Linear/Vercel: dark por padrão, com modo claro.
- Padrões de mercado de UI/UX: acessibilidade WCAG AA, estados vazio, de carregamento e de erro, responsivo no celular e microinterações com Motion.
- Textos da interface em pt-BR.

## Qualidade e entrega
- Testes Vitest cobrindo o motor de regras (casos com valores conferidos à mão), isolamento entre empresas, permissões e limites.
- Typecheck, lint e build limpos a cada etapa; teste no navegador antes de dizer que algo funciona.
- Deploy: banco no Neon (região aws-sa-east-1), projeto na Vercel com funções em gru1 e variáveis configuradas. Os conectores Neon e Vercel estão disponíveis.
- README, docs/deploy.md e docs/backlog.md (o que ficou de fora, priorizado).
- Commits pequenos e descritivos em pt-BR.
```

---

## Prompt 3: Agenda Cheia (anti-falta com preenchimento automático para clínicas)

```text
Quero desenvolver do zero, completo e pronto para produção, a aplicação "Agenda Cheia": anti-falta para clínicas e consultórios pequenos, com confirmação por WhatsApp e preenchimento automático da vaga cancelada a partir de uma lista de espera. Ela vai para uma apresentação a investidores, então precisa ser um produto completo, moderno e funcional, não um MVP simples.

## Contexto e PRD
- Já existe um PRD em C:\Users\wesley.santos\Documents\github\equilibra\docs\prd\03-agenda-cheia-no-show.md. Leia inteiro antes de tudo.
- Antes de codar, pesquise na web para validar e atualizar o PRD: taxas de no-show em clínicas privadas no Brasil (as do PRD vêm de fontes comerciais), concorrentes atuais (iClinic, Feegow, Clinicorp, Simples Dental, disparadores de WhatsApp), regras e preços da WhatsApp Business Cloud API (templates, janela de 24h, opt-in) e PSPs com API Pix e cobrança de sinal. Atualize o PRD em docs/prd/ no novo repositório citando as fontes.

## Repositório
- Crie um repositório novo em C:\Users\wesley.santos\Documents\github\agenda-cheia (git init, branch main) e, no fim, um repositório privado no GitHub (gh já está logado como Wesley-SdS) com push.
- Antes do primeiro commit, rode neste repositório: git config user.email "wesleysantos.0095@gmail.com" e git config user.name "Wesley Santos". A Vercel Hobby só faz deploy de commits do dono da conta.

## Stack obrigatória (a mesma do Equilibra)
Next.js 15 (App Router) + jStack (Hono RPC type-safe, com WebSockets e Redis/Upstash) + Drizzle ORM + Postgres (PGlite local, Neon em produção) + Zod 4 + TanStack Query + Tailwind CSS 4 + Motion + Vitest.

Reaproveite padrões e código do Equilibra em C:\Users\wesley.santos\Documents\github\equilibra (leia antes de escrever o equivalente):
- src/server/jstack.ts e src/server/index.ts (procedures e erro por sub-router);
- src/server/db/index.ts e scripts/migrate.ts;
- src/server/auth.ts e src/server/routers/auth-router.ts (sessão, multiempresa, convites, senha);
- src/server/email/;
- src/server/billing/ e src/lib/plans.ts;
- src/server/jev.ts e src/server/decisions.ts;
- src/app/globals.css, src/components/theme.tsx, src/components/ui/primitives.tsx e src/lib/utils.ts;
- tests/*.test.ts, vercel.json, docs/deploy.md e .env.example.

## Escopo funcional mínimo (detalhe no PRD)
Agenda própria (profissionais, procedimentos, duração) e sincronização com Google Calendar; confirmação por WhatsApp em D-2/D-1 com botões (confirmar, remarcar, cancelar); lista de espera com preferências; preenchimento automático em cascata com lock no Redis (SET NX com TTL), para que dois pacientes nunca fiquem com o mesmo horário; painel da recepção em tempo real via WebSocket do jStack; sinal via Pix para pacientes reincidentes; score de risco de falta; painel de ROI (faltas evitadas, vagas preenchidas, R$ recuperado); página pública de agendamento e remarcação; planos e limites; landing de conversão; modo claro e escuro.
- Use o Jev (TypeSafe, via Vercel AI Gateway, modelo typesafe-ai/jev, endpoint https://ai-gateway.vercel.sh/typesafe/v1/systemone, credencial AI_GATEWAY_API_KEY ou OIDC da Vercel) para decisões calibradas: probabilidade de falta por consulta (noul), quem da lista de espera recebe a vaga primeiro (choice) e se deve pedir sinal Pix. Mantenha sempre fallback por regras.
- Integrações externas (WhatsApp, Pix, Google) atrás de interfaces, com modo de simulação local, para o app funcionar sem credenciais. LGPD: dados de saúde mínimos, sem prontuário, e opt-in do WhatsApp registrado.

## Design e UX
- Use o Claude Design (Artifact do tipo Design) para desenhar landing, agenda, painel da recepção e fluxo do paciente no celular antes de codar. Visual moderno no estilo Linear/Vercel: dark por padrão, com modo claro.
- WCAG AA, estados vazio, de carregamento e de erro, mobile-first nas telas do paciente e microinterações com Motion.
- Textos da interface em pt-BR.

## Qualidade e entrega
- Testes Vitest, incluindo concorrência no aceite de vaga (dois aceites simultâneos), isolamento entre clínicas, permissões e limites.
- Typecheck, lint e build limpos; teste no navegador antes de dizer que algo funciona.
- Deploy: Neon (aws-sa-east-1), Vercel com funções em gru1 e Upstash Redis. Os conectores Neon e Vercel estão disponíveis.
- README, docs/deploy.md e docs/backlog.md.
- Commits pequenos e descritivos em pt-BR.
```

---

## Prompt 4: Meu Balcão (back-office de bolso para MEI de serviços)

```text
Quero desenvolver do zero, completo e pronto para produção, a aplicação "Meu Balcão": o back-office de bolso do MEI de serviços (agenda, cobrança por Pix, emissão de NFS-e e alerta do limite de faturamento do MEI) em um único app. Ela vai para uma apresentação a investidores, então precisa ser um produto completo, moderno e funcional, não um MVP simples.

## Contexto e PRD
- Já existe um PRD em C:\Users\wesley.santos\Documents\github\equilibra\docs\prd\04-mei-backoffice.md. Leia inteiro antes de tudo.
- Antes de codar, pesquise na web para validar e atualizar o PRD: limite anual vigente do MEI e propostas de mudança, calendário do DAS e da DASN-SIMEI, situação da NFS-e padrão nacional (API, obrigatoriedade para MEI), PSPs com API Pix (cobrança imediata, webhook, taxas), concorrentes (bancos digitais, InfinitePay, Cora, apps de agenda) e números de MEIs ativos. O PRD aponta risco competitivo alto: proponha e documente um nicho de entrada (por exemplo, beleza). Atualize o PRD em docs/prd/ no novo repositório citando as fontes.

## Repositório
- Crie um repositório novo em C:\Users\wesley.santos\Documents\github\meu-balcao (git init, branch main) e, no fim, um repositório privado no GitHub (gh já está logado como Wesley-SdS) com push.
- Antes do primeiro commit, rode neste repositório: git config user.email "wesleysantos.0095@gmail.com" e git config user.name "Wesley Santos". A Vercel Hobby só faz deploy de commits do dono da conta.

## Stack obrigatória (a mesma do Equilibra)
Next.js 15 (App Router, como PWA instalável e offline-first para agenda e caixa) + jStack (Hono RPC type-safe, com WebSockets para confirmar o Pix em tempo real) + Drizzle ORM + Postgres (PGlite local, Neon em produção) + Zod 4 + TanStack Query + Tailwind CSS 4 + Motion + Vitest.

Reaproveite padrões e código do Equilibra em C:\Users\wesley.santos\Documents\github\equilibra (leia antes de escrever o equivalente):
- src/server/jstack.ts e src/server/index.ts;
- src/server/db/index.ts e scripts/migrate.ts;
- src/server/auth.ts e src/server/routers/auth-router.ts;
- src/server/email/;
- src/server/billing/ e src/lib/plans.ts (aqui com plano grátis e Pro);
- src/server/jev.ts e src/server/decisions.ts;
- src/app/globals.css, src/components/theme.tsx, src/components/ui/primitives.tsx e src/lib/utils.ts;
- tests/*.test.ts, vercel.json, docs/deploy.md e .env.example.

## Escopo funcional mínimo (detalhe no PRD)
Onboarding em menos de 3 minutos (busca de dados pelo CNPJ); serviços e preços; agenda com link público de agendamento; cobrança Pix com QR Code e link, webhook do PSP e confirmação em tempo real; recibo; NFS-e em 2 toques a partir de uma cobrança paga; termômetro do limite MEI (acumulado, projeção, alertas em 70%, 90% e 100%), com o limite em configuração versionada; lembrete do DAS e da DASN-SIMEI; fluxo de caixa com separação pessoal × negócio; cobrança recorrente; landing de conversão; modo claro e escuro.
- Use o Jev (TypeSafe, via Vercel AI Gateway, modelo typesafe-ai/jev, endpoint https://ai-gateway.vercel.sh/typesafe/v1/systemone, credencial AI_GATEWAY_API_KEY ou OIDC da Vercel) para decisões: categorizar lançamentos do caixa (choice), separar pessoal × negócio (noul) e estimar o risco de ultrapassar o limite no ano. O cálculo do limite e dos valores deve ser determinístico.
- Integrações (PSP Pix, NFS-e nacional, consulta de CNPJ) atrás de interfaces, com modo de simulação local para funcionar sem credenciais.

## Design e UX
- Use o Claude Design (Artifact do tipo Design) para desenhar landing e as telas principais do app no celular (início, agenda, cobrança, caixa, termômetro do limite) antes de codar. Visual moderno, dark por padrão, com modo claro, pensado para uso com uma mão.
- WCAG AA, estados vazio, de carregamento e de erro e microinterações com Motion.
- Textos da interface em pt-BR, linguagem simples para o MEI.

## Qualidade e entrega
- Testes Vitest: termômetro do limite, idempotência do webhook Pix, emissão de NFS-e a partir de cobrança paga, isolamento entre contas e limites do plano.
- Typecheck, lint e build limpos; teste no navegador (incluindo viewport mobile) antes de dizer que algo funciona.
- Deploy: Neon (aws-sa-east-1) e Vercel com funções em gru1. Os conectores Neon e Vercel estão disponíveis.
- README, docs/deploy.md e docs/backlog.md.
- Commits pequenos e descritivos em pt-BR.
```
