# Prompts para desenvolver as aplicações 2, 3 e 4

Cada aplicação é um **produto independente**: repositório, banco, deploy, marca e código próprios. Abra uma sessão nova do Claude Code para cada uma, com a pasta `C:\Users\wesley.santos\Documents\github` como diretório, e cole o prompt correspondente. Os prompts são autossuficientes e não dependem do Equilibra (aplicação 1).

---

## Prompt 2: Tributo Claro (copiloto da Reforma Tributária para o caixa da PME)

```text
Quero desenvolver do zero um produto novo e independente, completo e pronto para produção: "Tributo Claro", um copiloto da Reforma Tributária (CBS/IBS e split payment) para o caixa de PMEs brasileiras. Ele vai para uma apresentação a investidores, então precisa ser um produto completo, moderno e funcional, não um MVP simples. É um produto separado: não reaproveite código de outros projetos meus.

## PRD
- Existe um PRD inicial em C:\Users\wesley.santos\Documents\github\equilibra\docs\prd\02-tributo-caixa-reforma.md. Use-o só como ponto de partida: copie para docs/prd/ do novo repositório e não leia nada além desse arquivo naquela pasta.
- O PRD é de 15/10/2026 e as regras da reforma mudam rápido. Antes de codar, pesquise na web e atualize o PRD com fontes: LC 214/2025 e regulamentações, alíquotas de teste de 2026, cronograma do split payment em 2027, regras do Simples Híbrido, campos de IBS/CBS na NF-e e NFS-e, notas técnicas da Receita e do Comitê Gestor, concorrentes (Omie, Conta Azul, TOTVS, consultorias) e tamanho de mercado. Marque o que for estimativa.
- Posicionamento sugerido no PRD: nicho em prestadores de serviço B2B. Confirme ou ajuste com base na pesquisa.

## Repositório e git
- Crie o repositório em C:\Users\wesley.santos\Documents\github\tributo-claro (git init, branch main) e, no fim, um repositório privado no GitHub (gh já está logado como Wesley-SdS) com push.
- Antes do primeiro commit: git config user.email "wesleysantos.0095@gmail.com" e git config user.name "Wesley Santos". A Vercel Hobby só faz deploy de commits do dono da conta.

## Stack
Next.js 15 (App Router) + jStack (Hono RPC type-safe de ponta a ponta) + Drizzle ORM + Postgres (PGlite embutido em desenvolvimento, Neon em produção via DATABASE_URL, migrations aplicadas no build) + Zod 4 + TanStack Query + Tailwind CSS 4 + Motion + Vitest.
Requisitos de base:
- Autenticação própria com sessão em cookie httpOnly assinado (HMAC), senha com hash scrypt, convites por link, recuperação de senha com token de uso único.
- Multiempresa: o escritório contábil acessa várias empresas clientes, com papéis (dono, admin, leitor) validados no servidor a cada requisição.
- Isolamento entre empresas em todas as queries, validação Zod em 100% das entradas e trilha de auditoria.
- E-mail transacional com Resend, com fallback local sem chave.
- Planos, limites e teste grátis, com o provedor de pagamento plugável por interface.
- Rate limit (Upstash Redis) e Sentry com DSN opcional, sem enviar dados pessoais.
- LGPD: Termos, Política de Privacidade e DPA, aceite versionado, exportação e exclusão de dados.
- No jStack 1.1, o onError do router raiz não é repassado aos sub-routers: registre o handler de erro em cada sub-router (ZodError → 422 com a mensagem em pt-BR).

## Jev (modelo de decisão da TypeSafe) via Vercel AI Gateway
- O Jev não gera texto: recebe um estado (texto ou JSON) e perguntas tipadas e devolve, em uma chamada, choice (escolha entre opções com probabilidades), score (nota numa rubrica ordenada) e noul (probabilidade sim/não), com confiança.
- Chame SEMPRE pelo Vercel AI Gateway: POST https://ai-gateway.vercel.sh/typesafe/v1/systemone, modelo "typesafe-ai/jev", corpo { model, state, questions }, header Authorization: Bearer <token>. O token é AI_GATEWAY_API_KEY e, em deploy na Vercel, o token OIDC do projeto via @vercel/oidc (getVercelOidcToken). Confira a doc atual: https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe
- Crie um cliente tipado com timeout de 4s. Toda decisão tem fallback por regras locais e registra o motor ("jev" ou "regras") e a confiança, para ser auditável e funcionar sem credencial.
- Onde usar neste produto: classificar itens e serviços em NBS/NCM quando o XML for ambíguo; sinalizar contratos com risco de perda de margem; priorizar alertas para o contador. O cálculo tributário em si é determinístico e auditável: nunca IA.
- Nos testes, simule apenas a resposta HTTP do Gateway.

## Escopo funcional mínimo (detalhe no PRD)
Upload em lote de XML (NF-e e NFS-e) com processamento assíncrono e progresso em tempo real; classificação e cálculo da carga atual; motor de regras CBS/IBS declarativo e versionado por vigência (2026–2033); simulador de regimes (atual × Simples Híbrido × Presumido × Real); calculadora de repasse de preço; projeção de caixa com split payment; relatório PDF para o contador; painel multicliente do escritório contábil; landing de conversão com preços; modo claro e escuro. Deixe claro na interface que é simulação e não substitui o contador.

## Design e UX
- Crie uma identidade visual própria (nome, logo, paleta, tipografia), diferente de outros projetos meus.
- Use o Claude Design (Artifact do tipo Design) para desenhar landing, painel e telas-chave antes de codar. Visual moderno e premium.
- WCAG AA, estados vazio, de carregamento e de erro, responsivo e microinterações com Motion. Interface em pt-BR.

## Qualidade e entrega
- Testes Vitest: motor de regras (casos com valores conferidos à mão), isolamento entre empresas, permissões, limites e fallback do Jev.
- Typecheck, lint e build limpos a cada etapa; teste no navegador antes de dizer que algo funciona.
- Deploy: banco no Neon (aws-sa-east-1) e Vercel com funções em gru1, variáveis configuradas. Os conectores Neon e Vercel estão disponíveis nesta conta.
- README, docs/deploy.md e docs/backlog.md (o que ficou de fora, priorizado). Commits pequenos e descritivos em pt-BR.
```

---

## Prompt 3: Agenda Cheia (anti-falta com preenchimento automático para clínicas)

```text
Quero desenvolver do zero um produto novo e independente, completo e pronto para produção: "Agenda Cheia", anti-falta para clínicas e consultórios pequenos, com confirmação por WhatsApp e preenchimento automático da vaga cancelada a partir de uma lista de espera. Ele vai para uma apresentação a investidores, então precisa ser um produto completo, moderno e funcional, não um MVP simples. É um produto separado: não reaproveite código de outros projetos meus.

## PRD
- Existe um PRD inicial em C:\Users\wesley.santos\Documents\github\equilibra\docs\prd\03-agenda-cheia-no-show.md. Use-o só como ponto de partida: copie para docs/prd/ do novo repositório e não leia nada além desse arquivo naquela pasta.
- Antes de codar, pesquise na web e atualize o PRD com fontes: taxas de no-show em clínicas privadas no Brasil (as do PRD vêm de fontes comerciais); concorrentes (iClinic, Feegow, Clinicorp, Simples Dental, disparadores de WhatsApp); regras e preços da WhatsApp Business Cloud API (templates, janela de 24h, opt-in); PSPs com API Pix para cobrança de sinal; LGPD para dados de saúde (art. 11).

## Repositório e git
- Crie o repositório em C:\Users\wesley.santos\Documents\github\agenda-cheia (git init, branch main) e, no fim, um repositório privado no GitHub (gh já está logado como Wesley-SdS) com push.
- Antes do primeiro commit: git config user.email "wesleysantos.0095@gmail.com" e git config user.name "Wesley Santos". A Vercel Hobby só faz deploy de commits do dono da conta.

## Stack
Next.js 15 (App Router) + jStack (Hono RPC type-safe, com WebSockets) + Upstash Redis (locks e pub/sub) + Drizzle ORM + Postgres (PGlite em desenvolvimento, Neon em produção via DATABASE_URL, migrations no build) + Zod 4 + TanStack Query + Tailwind CSS 4 + Motion + Vitest.
Requisitos de base:
- Autenticação própria (cookie httpOnly assinado, scrypt, convites, recuperação de senha).
- Multi-clínica com papéis (dono, recepção, profissional) validados no servidor; isolamento entre clínicas em todas as queries; validação Zod em 100% das entradas; trilha de auditoria.
- E-mail com Resend (fallback local).
- Planos, limites e teste grátis, com provedor de pagamento plugável.
- Rate limit (Upstash) e Sentry com DSN opcional, sem dados pessoais nem de saúde.
- LGPD: Termos, Privacidade e DPA, aceite versionado, exportação e exclusão; dados de saúde mínimos e sem prontuário.
- No jStack 1.1, registre o handler de erro em cada sub-router.

## Jev (modelo de decisão da TypeSafe) via Vercel AI Gateway
- O Jev não gera texto: recebe um estado e perguntas tipadas e devolve choice, score e noul com confiança, numa única chamada.
- Chame SEMPRE pelo Vercel AI Gateway: POST https://ai-gateway.vercel.sh/typesafe/v1/systemone, modelo "typesafe-ai/jev", corpo { model, state, questions }, Authorization: Bearer <AI_GATEWAY_API_KEY ou token OIDC da Vercel via @vercel/oidc>. Doc: https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe
- Cliente tipado com timeout de 4s, fallback por regras e registro do motor e da confiança em cada decisão.
- Onde usar neste produto: probabilidade de falta por consulta (noul) para decidir quem recebe confirmação reforçada; quem da lista de espera recebe a vaga primeiro (choice); se deve pedir sinal Pix (noul). Nos testes, simule só o HTTP do Gateway.

## Escopo funcional mínimo (detalhe no PRD)
Agenda própria (profissionais, procedimentos, duração) e sincronização com Google Calendar; confirmação por WhatsApp em D-2 e D-1 com botões (confirmar, remarcar, cancelar); lista de espera com preferências; preenchimento automático em cascata com lock no Redis (SET NX com TTL), para que dois pacientes nunca fiquem com o mesmo horário; painel da recepção em tempo real via WebSocket; sinal via Pix para reincidentes; painel de ROI (faltas evitadas, vagas preenchidas, R$ recuperado); página pública de agendamento e remarcação; landing de conversão com preços; modo claro e escuro. Integrações externas (WhatsApp, Pix, Google) atrás de interfaces, com modo de simulação local para funcionar sem credenciais.

## Design e UX
- Crie uma identidade visual própria (nome, logo, paleta, tipografia), diferente de outros projetos meus.
- Use o Claude Design (Artifact do tipo Design) para desenhar landing, agenda, painel da recepção e o fluxo do paciente no celular antes de codar. Visual moderno e premium.
- WCAG AA, estados vazio, de carregamento e de erro, mobile-first nas telas do paciente e microinterações com Motion. Interface em pt-BR.

## Qualidade e entrega
- Testes Vitest: concorrência no aceite de vaga (dois aceites simultâneos), isolamento entre clínicas, permissões, limites e fallback do Jev.
- Typecheck, lint e build limpos; teste no navegador antes de dizer que algo funciona.
- Deploy: Neon (aws-sa-east-1), Vercel com funções em gru1 e Upstash Redis. Os conectores Neon e Vercel estão disponíveis nesta conta.
- README, docs/deploy.md e docs/backlog.md. Commits pequenos e descritivos em pt-BR.
```

---

## Prompt 4: Meu Balcão (back-office de bolso para MEI de serviços)

```text
Quero desenvolver do zero um produto novo e independente, completo e pronto para produção: "Meu Balcão", o back-office de bolso do MEI de serviços (agenda, cobrança por Pix, emissão de NFS-e e alerta do limite de faturamento do MEI) em um único app. Ele vai para uma apresentação a investidores, então precisa ser um produto completo, moderno e funcional, não um MVP simples. É um produto separado: não reaproveite código de outros projetos meus.

## PRD
- Existe um PRD inicial em C:\Users\wesley.santos\Documents\github\equilibra\docs\prd\04-mei-backoffice.md. Use-o só como ponto de partida: copie para docs/prd/ do novo repositório e não leia nada além desse arquivo naquela pasta.
- Antes de codar, pesquise na web e atualize o PRD com fontes: limite anual vigente do MEI e propostas de mudança; calendário do DAS e da DASN-SIMEI; situação da NFS-e padrão nacional (API, obrigatoriedade para MEI); PSPs com API Pix (cobrança imediata, webhook, taxas); concorrentes (bancos digitais, InfinitePay, Cora, apps de agenda); número de MEIs ativos. O PRD aponta risco competitivo alto: proponha e documente um nicho de entrada (por exemplo, beleza).

## Repositório e git
- Crie o repositório em C:\Users\wesley.santos\Documents\github\meu-balcao (git init, branch main) e, no fim, um repositório privado no GitHub (gh já está logado como Wesley-SdS) com push.
- Antes do primeiro commit: git config user.email "wesleysantos.0095@gmail.com" e git config user.name "Wesley Santos". A Vercel Hobby só faz deploy de commits do dono da conta.

## Stack
Next.js 15 (App Router, PWA instalável e offline-first para agenda e caixa) + jStack (Hono RPC type-safe, com WebSockets para confirmar o Pix em tempo real) + Drizzle ORM + Postgres (PGlite em desenvolvimento, Neon em produção via DATABASE_URL, migrations no build) + Zod 4 + TanStack Query + Tailwind CSS 4 + Motion + Vitest.
Requisitos de base:
- Autenticação própria (cookie httpOnly assinado, scrypt, recuperação de senha).
- Isolamento por conta em todas as queries, validação Zod em 100% das entradas e trilha de auditoria.
- E-mail com Resend (fallback local).
- Plano grátis e Pro com limites, e provedor de pagamento plugável.
- Rate limit (Upstash) e Sentry com DSN opcional, sem dados pessoais.
- LGPD: Termos e Privacidade, aceite versionado, exportação e exclusão.
- No jStack 1.1, registre o handler de erro em cada sub-router.

## Jev (modelo de decisão da TypeSafe) via Vercel AI Gateway
- O Jev não gera texto: recebe um estado e perguntas tipadas e devolve choice, score e noul com confiança, numa única chamada.
- Chame SEMPRE pelo Vercel AI Gateway: POST https://ai-gateway.vercel.sh/typesafe/v1/systemone, modelo "typesafe-ai/jev", corpo { model, state, questions }, Authorization: Bearer <AI_GATEWAY_API_KEY ou token OIDC da Vercel via @vercel/oidc>. Doc: https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe
- Cliente tipado com timeout de 4s, fallback por regras e registro do motor e da confiança em cada decisão.
- Onde usar neste produto: categorizar lançamentos do caixa (choice); separar pessoal × negócio (noul); estimar o risco de ultrapassar o limite do MEI no ano (score). O cálculo do limite e dos valores é determinístico. Nos testes, simule só o HTTP do Gateway.

## Escopo funcional mínimo (detalhe no PRD)
Onboarding em menos de 3 minutos (dados pelo CNPJ); serviços e preços; agenda com link público de agendamento; cobrança Pix com QR Code e link, webhook do PSP e confirmação em tempo real; recibo; NFS-e em 2 toques a partir de uma cobrança paga; termômetro do limite MEI (acumulado, projeção, alertas em 70%, 90% e 100%), com o limite em configuração versionada; lembretes do DAS e da DASN-SIMEI; fluxo de caixa; cobrança recorrente; landing de conversão com preços; modo claro e escuro. Integrações (PSP Pix, NFS-e nacional, consulta de CNPJ) atrás de interfaces, com modo de simulação local para funcionar sem credenciais.

## Design e UX
- Crie uma identidade visual própria (nome, logo, paleta, tipografia), diferente de outros projetos meus.
- Use o Claude Design (Artifact do tipo Design) para desenhar landing e as telas principais do app no celular (início, agenda, cobrança, caixa, termômetro do limite) antes de codar. Visual moderno, pensado para uso com uma mão.
- WCAG AA, estados vazio, de carregamento e de erro e microinterações com Motion. Interface em pt-BR, com linguagem simples para o MEI.

## Qualidade e entrega
- Testes Vitest: termômetro do limite, idempotência do webhook Pix, emissão de NFS-e a partir de cobrança paga, isolamento entre contas, limites do plano e fallback do Jev.
- Typecheck, lint e build limpos; teste no navegador (incluindo viewport mobile) antes de dizer que algo funciona.
- Deploy: Neon (aws-sa-east-1) e Vercel com funções em gru1. Os conectores Neon e Vercel estão disponíveis nesta conta.
- README, docs/deploy.md e docs/backlog.md. Commits pequenos e descritivos em pt-BR.
```
