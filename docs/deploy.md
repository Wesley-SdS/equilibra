# Deploy (Vercel + Neon)

## Estado atual (16/10/2026)

- **Produção:** https://equilibra-wesleysds-projects.vercel.app (Vercel, projeto `equilibra`, funções em `gru1`/São Paulo)
- **Banco:** Neon, projeto `Equilibra` (`wild-butterfly-39501280`), região `aws-sa-east-1`, Postgres 17, banco `equilibra`
- **Variáveis na Vercel:** `DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET` (production + preview) e `APP_URL` (production)
- **Jev:** autentica no AI Gateway pelo token OIDC do projeto (sem chave). Para usar localmente, defina `AI_GATEWAY_API_KEY`
- **Proteção:** login da Vercel só nos previews; a produção é pública (questionário e canal precisam ser)
- **Pendente (Jev):** o AI Gateway exige um cartão de crédito cadastrado no time da Vercel para liberar o uso (inclusive os créditos gratuitos). Até lá, as decisões caem nas regras locais
- **Pendente:** `RESEND_API_KEY` + `EMAIL_FROM` (domínio verificado) para enviar e-mails de verdade
- **Pendente (rate limit):** criar o Upstash Redis pela Vercel (Storage → Create Database → Upstash for Redis → conectar ao projeto `equilibra`). As variáveis `KV_REST_API_URL`/`KV_REST_API_TOKEN` entram sozinhas; até lá o limite é em memória
- **Pendente (Sentry):** criar o projeto Next.js no Sentry e definir `NEXT_PUBLIC_SENTRY_DSN` e `SENTRY_DSN` (Production e Preview). `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` e `SENTRY_PROJECT` são opcionais (sourcemaps)
- **Logs:** uma linha JSON por evento (`event`, `level`, campos sem dados pessoais); filtre por `event` nos Runtime Logs da Vercel
- **Pendente (WhatsApp):** criar o app na Meta (WhatsApp Business Cloud API), verificar a empresa, aprovar os dois templates `equilibra_convite_avaliacao` e `equilibra_lembrete_avaliacao` (utility, pt_BR, 4 variáveis: empresa, campanha, link, data) e definir `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`. Até lá o disparo roda em simulação
- Os segredos locais ficam em `.env.neon` (ignorado pelo git)

> Plano Hobby: a Vercel só faz deploy de commits cujo autor é o dono da conta. Neste repositório o
> `git config user.email` local usa o e-mail pessoal vinculado à conta.

## 1. Banco (Neon, plano gratuito)

1. Crie um projeto no Neon (região `aws-sa-east-1`, São Paulo, para menor latência).
2. Copie a **connection string com pooling** (host com `-pooler`), com `sslmode=require`.

## 2. Variáveis de ambiente na Vercel

| Variável | Obrigatória | Valor |
|---|---|---|
| `DATABASE_URL` | sim | connection string do Neon (pooled) |
| `SESSION_SECRET` | sim | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `APP_URL` | sim | URL pública, ex.: `https://equilibra.vercel.app` (links dos e-mails) |
| `CRON_SECRET` | sim | outro segredo aleatório (a Vercel o envia ao chamar o cron) |
| `RESEND_API_KEY` | para e-mail real | chave do Resend |
| `EMAIL_FROM` | com Resend | `Equilibra <nao-responda@seudominio.com.br>` (domínio verificado no Resend) |

| `ANTHROPIC_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` / `OPENAI_API_KEY` | não | chave direta do provedor do modelo de cada agente; sem a chave do provedor, a chamada vai pelo AI Gateway (OIDC na Vercel ou `AI_GATEWAY_API_KEY`), que atende os três |
| `AGENT_MODEL` | não | modelo padrão dos agentes no formato `provedor/modelo` (ids do AI Gateway), ex.: `anthropic/claude-sonnet-5.5`, `google/gemini-3.8-flash`, `openai/gpt-6-luna`. Padrão: `anthropic/claude-opus-5.5` |
| `AGENT_MODEL_<AGENTE>` | não | modelo de um agente específico, sobrepõe `AGENT_MODEL`: `AGENT_MODEL_IMPORT_EXTRACTOR`, `AGENT_MODEL_QUESTIONNAIRE_COPILOT`, `AGENT_MODEL_PLAN_COPILOT`, `AGENT_MODEL_CHANNEL_COPILOT`, `AGENT_MODEL_REPORT_SUMMARY`, `AGENT_MODEL_LISTENING`. O modelo da escuta só muda depois de rodar `scripts/eval-escuta.ts` com ele e o RT aprovar |
| `AGENTS_DISABLED` | não | `1` desliga todos os copilotos (as telas seguem no fluxo manual) |
| `ESCUTA_ENABLED` | não | `1` libera o Espaço de escuta para todas as empresas. **Só ligar depois do parecer jurídico, do RIPD assinado e da aprovação do psicólogo responsável técnico** (decisão 8 do PRD v2; `docs/escuta-protocolo-rt.md`); cada empresa ainda precisa ativar |
| `ESCUTA_PILOT_COMPANIES` | não | piloto fechado: slugs das empresas separados por vírgula (ex.: `padaria-sol,metal-norte`). Vale sem `ESCUTA_ENABLED` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | não | importação direta do Google Forms (OAuth, escopos `forms.body.readonly` e `forms.responses.readonly`). No Google Cloud, cadastre a URI de redirecionamento `{APP_URL}/api/google/callback`. Sem elas, o Forms é importado pela planilha de respostas |

> **Provedores de IA e LGPD.** Use só contas pagas ou o AI Gateway: a camada gratuita da API do Gemini pode usar os dados para melhorar os produtos do Google, o que contraria a política de privacidade ("sem uso dos dados para treinamento"). Cada provedor novo é um suboperador: confira o DPA dele e a transferência internacional (Res. CD/ANPD 19/2024) antes de apontar um agente para ele.

Sem `RESEND_API_KEY`, o app funciona, mas os e-mails não são enviados (só registrados no log). Sem credencial de IA, os copilotos somem das telas e o resumo do relatório é montado por regras.

## 3. Build

O `vercel.json` já define:

- `buildCommand`: `npm run db:migrate && npm run build` — aplica as migrations no Neon antes do build.
- `crons`: `/api/cron/lembretes` todo dia às 11:07 UTC (08:07 em Brasília).

## 4. Dados de demonstração (opcional)

Com a `DATABASE_URL` do Neon no ambiente local:

```bash
DATABASE_URL="postgres://..." npm run db:seed
```

## Observações

- O PGlite (banco embutido) é só para desenvolvimento; na Vercel o app exige `DATABASE_URL`.
- O limite de requisições é em memória por instância; para várias instâncias, usar Upstash Redis (backlog).
