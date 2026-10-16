# Backlog — o que falta no Equilibra

Estado em 15/10/2026 (atualizado após a v1.2). Prioridade: **P0** = necessário para cobrar dos primeiros clientes; **P1** = importante nos primeiros meses; **P2** = diferencial / escala.

Legenda: ✅ feito · 🟡 parcial · sem marca = a fazer

## P0 — Antes de vender

| # | Item | Por quê |
|---|---|---|
| 1 | 🟡 **Deploy em produção** (Vercel + Neon) e domínio | No ar na Vercel com Neon em São Paulo (ver `docs/deploy.md`). Falta domínio próprio e a chave do Resend |
| 2 | ✅ **Envio de e-mail** (Resend): convites, boas-vindas, lembretes de campanha (cron diário + botão manual) | Feito. Falta só a `RESEND_API_KEY` e um domínio verificado |
| 3 | ✅ **Recuperação de senha** (link de uso único, 30 min, sem revelar e-mails) | Feito |
| 4 | **Cobrança recorrente** (Stripe ou Asaas/Pagar.me para Pix e boleto) com planos e limites | Planos aparecem na landing, mas não há checkout nem limite por plano |
| 5 | **Termos de uso, política de privacidade e DPA** (LGPD) | Obrigatório para contratar e para o cliente confiar no anonimato |
| 6 | **Rate limit distribuído** (Upstash Redis) | O limite atual é em memória, por instância |
| 7 | **Monitoramento de erros** (Sentry) e logs estruturados | Hoje erro de produção não avisa ninguém |
| 8 | ✅ **Relatório PDF gerado no servidor** (`/api/relatorio/pdf`, @react-pdf) | Feito. Pendente: número de página no rodapé |

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
| 18 | ✅ Artboards de Painel e Questionário atualizados no Claude Design |

## P2 — Diferencial e escala

| # | Item |
|---|---|
| 19 | **Benchmarks por CNAE** (comparar com empresas do mesmo setor, anonimizado) |
| 20 | **Integração eSocial** (S-2240) e com softwares de SST/folha |
| 21 | Trilhas de **capacitação de lideranças** (microlearning) ligadas às dimensões em risco |
| 26 | ✅ **Decisões com o Jev** (TypeSafe via Vercel AI Gateway): triagem do canal, escolha de ações e classificação de perguntas |
| 22 | 🟡 Perguntas personalizadas da empresa (até 10, fora do score) ✅ — falta banco de perguntas validado por especialistas |
| 23 | API pública e webhooks para parceiros |
| 24 | SSO corporativo (SAML) e multiunidades/filiais com consolidação |
| 25 | App/PWA instalável para o painel |

## Produtos 2, 3 e 4

Os PRDs estão em `docs/prd/` (Tributo Claro, Agenda Cheia, Meu Balcão). Nenhum foi iniciado; a sugestão é criar um repositório por produto reaproveitando a base técnica (Next.js + jStack + Drizzle + design system) do Equilibra.
