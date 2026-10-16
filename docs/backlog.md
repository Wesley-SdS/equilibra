# Backlog — o que falta no Equilibra

Estado em 15/10/2026. Prioridade: **P0** = necessário para cobrar dos primeiros clientes; **P1** = importante nos primeiros meses; **P2** = diferencial / escala.

## P0 — Antes de vender

| # | Item | Por quê |
|---|---|---|
| 1 | **Deploy em produção** (Vercel + Postgres gerenciado: Neon/Supabase) e domínio | O app só roda local hoje; `DATABASE_URL` já é suportado |
| 2 | **Envio de e-mail** (Resend): convites, boas-vindas, lembretes de campanha | Convite hoje é um link copiado à mão |
| 3 | **Recuperação de senha** | Não existe “esqueci minha senha” |
| 4 | **Cobrança recorrente** (Stripe ou Asaas/Pagar.me para Pix e boleto) com planos e limites | Planos aparecem na landing, mas não há checkout nem limite por plano |
| 5 | **Termos de uso, política de privacidade e DPA** (LGPD) | Obrigatório para contratar e para o cliente confiar no anonimato |
| 6 | **Rate limit distribuído** (Upstash Redis) | O limite atual é em memória, por instância |
| 7 | **Monitoramento de erros** (Sentry) e logs estruturados | Hoje erro de produção não avisa ninguém |
| 8 | **Exportar relatório em PDF no servidor** | Hoje é “imprimir/salvar PDF” pelo navegador |

## P1 — Primeiros meses

| # | Item |
|---|---|
| 9 | Lembretes automáticos por **WhatsApp** (Cloud API) e e-mail no meio da campanha |
| 10 | **Assinatura digital** do relatório PGR pelo responsável técnico |
| 11 | **White-label** para parceiros (logo, cores e domínio do contador/SST) |
| 12 | Editar e duplicar campanha; agendar abertura e encerramento automáticos |
| 13 | Anexos e mensagens bidirecionais no **canal de relato** (quem relatou recebe resposta pelo protocolo) |
| 14 | Prazos e responsáveis do plano com **notificações** (ação vencendo/vencida) |
| 15 | Login social (Google/Microsoft) e **2FA** |
| 16 | Questionário em **inglês e espanhol** (equipes com imigrantes) e modo de alto contraste |
| 17 | Testes de ponta a ponta (Playwright) e CI no GitHub Actions |
| 18 | Atualizar os artboards de Painel e Questionário no Claude Design para o visual atual |

## P2 — Diferencial e escala

| # | Item |
|---|---|
| 19 | **Benchmarks por CNAE** (comparar com empresas do mesmo setor, anonimizado) |
| 20 | **Integração eSocial** (S-2240) e com softwares de SST/folha |
| 21 | Trilhas de **capacitação de lideranças** (microlearning) ligadas às dimensões em risco |
| 22 | Questionários personalizados e banco de perguntas validado por especialistas |
| 23 | API pública e webhooks para parceiros |
| 24 | SSO corporativo (SAML) e multiunidades/filiais com consolidação |
| 25 | App/PWA instalável para o painel |

## Produtos 2, 3 e 4

Os PRDs estão em `docs/prd/` (Tributo Claro, Agenda Cheia, Meu Balcão). Nenhum foi iniciado; a sugestão é criar um repositório por produto reaproveitando a base técnica (Next.js + jStack + Drizzle + design system) do Equilibra.
