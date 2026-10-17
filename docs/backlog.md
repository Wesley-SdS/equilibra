# Backlog — o que falta no Equilibra

Estado em 15/10/2026 (atualizado após a v1.2). Prioridade: **P0** = necessário para cobrar dos primeiros clientes; **P1** = importante nos primeiros meses; **P2** = diferencial / escala.

Legenda: ✅ feito · 🟡 parcial · sem marca = a fazer

## P0 — Antes de vender

| # | Item | Por quê |
|---|---|---|
| 1 | 🟡 **Deploy em produção** (Vercel + Neon) e domínio | No ar na Vercel com Neon em São Paulo (ver `docs/deploy.md`). Falta domínio próprio e a chave do Resend |
| 2 | ✅ **Envio de e-mail** (Resend): convites, boas-vindas, lembretes de campanha (cron diário + botão manual) | Feito. Falta só a `RESEND_API_KEY` e um domínio verificado |
| 3 | ✅ **Recuperação de senha** (link de uso único, 30 min, sem revelar e-mails) | Feito |
| 4 | 🟡 **Cobrança recorrente** | Estrutura pronta: planos e limites no servidor, teste grátis de 14 dias, modo leitura, carência de 7 dias, tela de assinatura, webhook genérico (`src/server/billing/`). Falta escolher e plugar o provedor (Stripe ou Asaas) em `provider.ts` |
| 5 | 🟡 **Termos de uso, política de privacidade e DPA** (LGPD) | Documentos em `docs/legal/` e páginas `/termos`, `/privacidade`, `/dpa`; aceite registrado (data + versão) com re-aceite; exportação, exclusão de empresa/conta e expurgo automático. Falta preencher razão social, CNPJ, endereço, foro e DPO em `src/lib/legal.ts` e revisão por advogado |
| 6 | 🟡 **Rate limit distribuído** (Upstash Redis) | Código pronto (janela deslizante, chaves com hash, fail-open, login protegido contra força bruta). Falta criar o Redis pela integração Upstash da Vercel |
| 7 | 🟡 **Monitoramento de erros** (Sentry) e logs estruturados | Código pronto (servidor, navegador, tela de erro global, sem PII; logs JSON). Falta o DSN do projeto no Sentry |
| 8 | ✅ **Relatório PDF gerado no servidor** (`/api/relatorio/pdf`, @react-pdf) | Feito. Pendente: número de página no rodapé |

## P1 — Primeiros meses

| # | Item |
|---|---|
| 9 | 🟡 Lembretes automáticos por **WhatsApp** (Cloud API) e e-mail | Pronto: lista de envio, convite e lembrete automático 2 dias antes do fim, lista apagada ao encerrar, simulação local. Falta criar o app na Meta e aprovar os templates |
| 10 | **Assinatura digital** do relatório PGR pelo responsável técnico |
| 11 | **White-label** para parceiros (logo, cores e domínio do contador/SST) |
| 12 | ✅ Editar e duplicar campanha; abertura e encerramento automáticos | Feito: edição de nome e datas (agenda, adia, estende e reabre), duplicação com link novo, fase Agendada/Ativa/Vencida/Encerrada, janela de resposta validada no servidor e encerramento automático pelo cron diário |
| 13 | ✅ Anexos e mensagens bidirecionais no **canal de relato** | Feito: o RH responde e o autor lê/responde pelo protocolo (só o dia é gravado), notas internas invisíveis ao autor, imagens (até 3 por mensagem) regravadas sem EXIF, não lidos no menu, nova mensagem reabre relato resolvido e reavalia a triagem |
| 14 | ✅ **Notificações** de prazo do plano de ação | Feito: resumo diário por e-mail a donos e admins (vencendo em até 3 dias e atrasadas, repetido a cada 7 dias), sem repetir no mesmo estágio, selo no menu e destaque nos cartões do plano |
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
