# Equilibra

Gestão de **riscos psicossociais (NR-1)** para PMEs: questionário anônimo, mapa de risco por setor, plano de ação 5W2H e relatório pronto para anexar ao PGR.

> A fiscalização da NR-1 sobre riscos psicossociais está ativa desde 26/05/2026. O PRD completo está em [`docs/prd/01-equilibra-nr1-psicossocial.md`](docs/prd/01-equilibra-nr1-psicossocial.md).

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 15 (App Router, Turbopack) |
| API | [jStack](https://jstack.app): Hono com RPC type-safe de ponta a ponta |
| Validação | Zod 4 (entradas da API e tipos inferidos no client) |
| Banco | Drizzle ORM + Postgres (`DATABASE_URL`) ou PGlite embutido em desenvolvimento |
| Testes | Vitest (metodologia, k-anonimato, segurança da API) |
| Dados no client | TanStack Query |
| UI | Tailwind CSS 4, Motion (animações), fonte Geist |

## Rodando localmente

Requer **Node.js 20+**.

```bash
npm install
npm run db:seed   # cria o banco local e a empresa de demonstração
npm run dev       # http://localhost:3000
```

Para entrar no painel de demonstração, use o botão **“Ver painel de demonstração”** na landing. O seed cria uma consultora com **3 empresas na carteira** (uma com duas campanhas, para mostrar a evolução) e um usuário leitor; as contas de teste estão em `scripts/seed.ts`.

## Funcionalidades

- **Landing** animada (Motion) com calculadora de economia e seção de privacidade/LGPD
- **Cadastro em 2 passos**, login, convites por link e troca de senha
- **Multiempresa**: carteira para contadores e SST, troca de empresa e criação de clientes
- **Papéis**: dono, admin e leitor, validados no servidor a cada requisição
- **Campanhas** com link anônimo, contador ao vivo e **kit de divulgação** (cartaz com QR code, textos para WhatsApp e e-mail)
- **Questionário mobile-first** (28 itens, atalhos 1–5, rascunho local, bloqueio de duplicidade)
- **Visão geral**: mapa de calor setor × dimensão, ranking, participação, checklist de primeiros passos
- **Detalhe por dimensão**: score por item, distribuição das respostas e medidas recomendadas
- **Evolução** entre campanhas (linha do índice, antes/depois por dimensão, tabela)
- **Plano de ação 5W2H** em quadro, com sugestões automáticas para dimensões em alerta
- **Relatório PGR** imprimível em A4 (metodologia, participação, inventário, plano, evolução)
- **Canal de relato anônimo** com protocolo de acompanhamento
- **Trilha de auditoria** de todas as alterações
- **Paleta de comandos** (Ctrl/⌘ K)

> O PGlite permite **um processo por vez** no banco. Pare o `npm run dev` antes de rodar `npm run db:seed`.

### Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e servidor de produção |
| `npm run typecheck` | Checagem de tipos |
| `npm run lint` | ESLint |
| `npm test` | Testes (Vitest, banco em memória) |
| `npm run db:generate` | Gera a migration a partir de `src/server/db/schema.ts` |
| `npm run db:seed` | Recria a empresa de demonstração |

As migrations em `drizzle/` são aplicadas automaticamente ao abrir o banco.

## Estrutura

```
src/
  app/
    page.tsx              landing page
    comecar/, entrar/     cadastro e login
    app/                  painel (visão geral, campanhas, setores, plano, relatório PGR, canal)
    r/[token]/            questionário anônimo (mobile-first)
    canal/[slug]/         canal de relato anônimo + consulta de protocolo
    api/[[...route]]/     handler do jStack
  server/
    jstack.ts             procedures (pública / privada com sessão)
    routers/              auth, setores, campanhas, insights, plano, relatório, questionário, canal
    insights.ts           cálculo de risco com k-anonimato
    db/                   schema Drizzle e conexão
  lib/
    methodology.ts        28 itens, 7 dimensões, scoring e biblioteca de ações
    client.ts             client RPC type-safe
  components/             UI, gráficos e peças animadas da landing
docs/prd/                 PRDs dos 4 produtos
design/                   artboards do Claude Design (fonte do visual)
```

## Decisões importantes

- **Anonimato:** as respostas não guardam IP, user-agent, e-mail nem horário (só o dia). Setores com menos de 5 respostas (`K_ANONYMITY`) são agrupados em “Outros setores”; se o grupo continuar pequeno, entra apenas no índice geral.
- **Score:** cada item vira um risco de 0 a 4 (itens de proteção são invertidos). A média da dimensão × 25 dá o score de 0 a 100: baixo < 25, moderado 25–49, alto 50–74, crítico ≥ 75.
- **Multi-tenant:** toda procedure privada filtra por `session.companyId`, que vem do cookie assinado com HMAC.
- **Erros:** o jStack 1.1 não repassa o `onError` aos sub-routers, por isso `src/server/index.ts` registra o handler em cada um (validação do Zod → 422 com mensagem em pt-BR).

## Próximos passos (roadmap do PRD)

- [ ] Envio de e-mail (convites, recuperação de senha, lembretes) com Resend
- [ ] Lembretes automáticos por WhatsApp
- [ ] White-label do painel de parceiros (logo e cores)
- [ ] Cobrança recorrente
- [ ] Benchmarks por CNAE
