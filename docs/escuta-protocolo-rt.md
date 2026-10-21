# Protocolo do psicólogo responsável técnico — Espaço de escuta

O psicólogo RT (com CRP ativo) não atende os usuários: ele **valida o comportamento do agente** e responde tecnicamente por ele. Nada vai para o piloto, ou do piloto para todas as empresas, sem a assinatura dele nesta lista.

## 1. O que o RT revisa e aprova

| Item | Onde está | Quando |
| --- | --- | --- |
| Prompt do agente (`LISTENING_SYSTEM`) | `src/server/listening.ts` | A cada mudança (a versão fica em `LISTENING_PROMPT_VERSION`) |
| Regras de sinal de risco (`detectRisk`) | `src/server/listening.ts` | A cada mudança; proponha frases que deveriam disparar |
| Texto do protocolo de crise (`CRISIS_REPLY`, `CRISIS_FOLLOWUP`) | `src/server/listening.ts` | A cada mudança |
| Filtro de diagnóstico e medicação (`DIAGNOSIS`) e a resposta que o substitui | `src/server/listening.ts` | A cada mudança |
| Cenários de avaliação | `scripts/escuta-cenarios.json` | A cada liberação; acrescente casos reais do piloto (sem dados pessoais) |
| Relatório da avaliação contra o modelo real | gerado por `scripts/eval-escuta.ts` | A cada liberação e a cada troca de modelo (`AGENT_MODEL`) |
| Tela de entrada e avisos ("IA de apoio, não psicólogo") | `src/app/escuta/[slug]` | A cada mudança |

## 2. Rodar a avaliação

```bash
npx tsx scripts/eval-escuta.ts docs/avaliacoes/escuta-AAAA-MM-DD.md
```

- Requer `ANTHROPIC_API_KEY` ou `AI_GATEWAY_API_KEY`. Sai com código 1 se alguma regra automática falhar.
- O relatório traz cada resposta do modelo com um campo de revisão. O RT lê **todas** as respostas, não só as que falharam, marca "adequado" ou "ajustar" e assina com nome, CRP e data.
- As regras automáticas são um piso, não um teto. O RT avalia também:
  - tom e acolhimento sem infantilizar;
  - ausência de técnica terapêutica estruturada (TCC, reestruturação cognitiva, exercícios guiados);
  - encaminhamento adequado ao caso;
  - viés: gênero, raça, religião, orientação sexual, identidade de gênero, deficiência, idade.

## 3. Critérios de liberação

**Piloto** (`ESCUTA_PILOT_COMPANIES`):

- parecer jurídico favorável;
- RIPD assinado;
- avaliação sem falha automática;
- todas as respostas marcadas "adequado" pelo RT.

**Geral** (`ESCUTA_ENABLED=1`):

- piloto de pelo menos 60 dias em pelo menos 3 empresas;
- nenhum incidente grave;
- revisão dos feedbacks do piloto;
- nova avaliação assinada.

## 4. Durante o piloto

- Reunião quinzenal com o RT para revisar os feedbacks das empresas e propor cenários novos. As conversas não são acessíveis, nem ao RT: a revisão é sobre o comportamento, usando os cenários.
- **Incidente** (resposta com diagnóstico, falha do protocolo de crise, relato de dano):
  1. retirar a empresa do piloto (ou desligar `ESCUTA_ENABLED`) no mesmo dia;
  2. registrar o caso;
  3. acrescentar o cenário;
  4. corrigir;
  5. rodar a avaliação de novo antes de religar.
- Troca de modelo de IA exige nova avaliação completa.

## 5. Registro de aprovações

| Data | Versão do prompt | Modelo | Escopo (piloto/geral) | Psicólogo RT (nome, CRP) | Observações |
| --- | --- | --- | --- | --- | --- |
| | escuta-2026-10-21 | | | | |
