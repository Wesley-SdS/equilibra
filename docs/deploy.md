# Deploy (Vercel + Neon)

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

Sem `RESEND_API_KEY`, o app funciona, mas os e-mails não são enviados (só registrados no log).

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
