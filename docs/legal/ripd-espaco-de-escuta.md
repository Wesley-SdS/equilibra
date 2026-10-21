# Relatório de Impacto à Proteção de Dados Pessoais (RIPD) — Espaço de escuta

> **Rascunho técnico para revisão do encarregado (DPO) e do jurídico.** Base: LGPD (Lei 13.709/2018), art. 5º XVII, 10 §3º, 11 e 38; Guia de RIPD da ANPD. Versão do prompt avaliada: `escuta-2026-10-21`. Não liberar o recurso fora do piloto antes da assinatura deste relatório.

## 1. Identificação

| Item | Descrição |
| --- | --- |
| Tratamento | Conversa anônima de trabalhadores com um agente de apoio feito de IA (não psicólogo) sobre o que pesa no trabalho |
| Controlador | A empresa cliente que ativa o recurso (o dono da conta adere expressamente) |
| Operador | Equilibra (plataforma), com suboperadores: provedor de nuvem (Vercel/Neon) e provedor do modelo de IA (Anthropic, diretamente ou via Vercel AI Gateway) |
| Titulares | Trabalhadores da empresa cliente, maiores de 18 anos |
| Encarregado | _(preencher)_ |

## 2. Por que é necessário um RIPD

O usuário pode escrever, espontaneamente, sobre saúde mental, violência, vida sexual, religião ou origem racial: **dados pessoais sensíveis** (art. 5º II e art. 11). O tratamento usa tecnologia nova (modelo de linguagem) e envolve pessoas em situação de subordinação ao controlador. É tratamento de alto risco nos termos do Regulamento de aplicação da LGPD para agentes de pequeno porte (Res. CD/ANPD 2/2022, art. 4º).

## 3. Descrição do tratamento

**Dados tratados**

- Texto das mensagens (pode conter dados sensíveis).
- Identificador aleatório da conversa e hash do segredo do aparelho.
- Data da última mensagem, marcação de crise (booleano), temas do mês (dimensões, sem texto).
- Endereço IP, só em memória e no limitador de taxa (chave com validade de 1 hora), nunca associado à conversa no banco.

**O que não é coletado**: nome, e-mail, matrícula, setor, cargo, conta de usuário. A conversa não exige login. O agente é instruído a não pedir dados que identifiquem a pessoa ou terceiros.

**Fluxo**

1. A pessoa abre o link público da empresa (`/escuta/{slug}`), lê os limites e consente.
2. O servidor cria a conversa e devolve um cookie httpOnly `id.segredo`. Guarda só o hash do segredo.
3. Cada mensagem é cifrada com AES-256-GCM. A chave é derivada (HKDF) do segredo, que só o aparelho tem: sem o cookie, nem o Equilibra lê a conversa em repouso.
4. Se houver sinal de risco (regras locais, sensíveis por desenho), o servidor responde com o **protocolo de crise fixo** (CVV 188, SAMU 192) **sem chamar o modelo**, e as respostas seguintes por 24 horas também são fixas.
5. Fora da crise, as últimas 20 mensagens são enviadas ao modelo com o prompt de produção. A saída passa por um filtro de diagnóstico e medicação. O registro de execução (`agent_runs`) guarda só o hash da entrada, tokens e latência, nunca o texto (`storeOutput: false`).
6. Temas são contados por regras locais (sem texto) e só aparecem para a empresa com ≥ 10 conversas no mês e ≥ 20 trabalhadores. Abaixo disso, nem a contagem aparece.
7. Retenção: conversas sem atividade por 90 dias são apagadas pela rotina diária (`purgeListening`). A pessoa pode apagar a conversa a qualquer momento.

## 4. Bases legais (a confirmar pelo jurídico)

- **Dados sensíveis**: consentimento específico e destacado do titular (art. 11 I), coletado na tela de entrada, separado dos termos gerais. Proteção da vida (art. 11 II "e") no protocolo de crise.
- **Consentimento sob subordinação**: o vínculo de emprego fragiliza o consentimento. Mitigação: a empresa não sabe quem usa, não recebe nada individual e o uso não tem nenhuma consequência no trabalho. **Ver pergunta 3 da consulta jurídica.**
- **Transferência internacional** ao provedor do modelo (EUA): art. 33, com cláusulas-padrão contratuais (Res. CD/ANPD 19/2024). **Ver pergunta 6.**

## 5. Riscos e medidas

| # | Risco | Prob. | Impacto | Medidas | Risco residual |
| --- | --- | --- | --- | --- | --- |
| R1 | A empresa identifica quem usou ou o que disse | Baixa | Muito alto | Sem login; cifra por conversa com chave só no aparelho; temas só agregados acima de mínimos; nenhuma tela ou exportação expõe conversa, uso individual ou crise; rate limit não grava IP no banco | Baixo |
| R2 | Agente faz diagnóstico, terapia ou recomenda medicamento (exercício ilegal da profissão, dano ao titular) | Média | Alto | Prompt restritivo; filtro de saída `DIAGNOSIS`; avaliação de segurança antes de cada liberação (`scripts/eval-escuta.ts`) com leitura e assinatura do psicólogo RT | Médio → baixo após o piloto |
| R3 | Pessoa em crise recebe resposta inadequada | Baixa | Muito alto | Regras locais sensíveis (falso positivo aceitável); texto de crise fixo, revisado pelo RT; o modelo não é chamado na crise; 24 h de acompanhamento fixo | Baixo |
| R4 | Vazamento do banco | Baixa | Alto | Mensagens cifradas em repouso com chave fora do servidor; TLS; acesso restrito | Baixo |
| R5 | Provedor de IA retém ou usa os textos para treino | Baixa | Alto | Contrato comercial sem treino com dados do cliente; retenção limitada do provedor; minimização (só 20 mensagens, sem identificadores) | Baixo |
| R6 | Viés discriminatório nas respostas (gênero, raça, religião, orientação) | Média | Médio | Cenários de viés na avaliação (cartilha CFP); revisão do RT; canal de feedback no piloto | Médio |
| R7 | Menor de idade usa o recurso | Baixa | Médio | Prompt encerra e encaminha a adulto responsável e CVV; termos exigem 18+ | Baixo |
| R8 | Confusão do usuário entre IA e atendimento psicológico | Média | Médio | Avisos na entrada e no rodapé de cada conversa ("IA de apoio, não psicólogo"); o agente lembra quando faz sentido | Baixo |
| R9 | Uso do recurso como prova contra o trabalhador | Muito baixa | Alto | Nenhum dado individual acessível à empresa; o Equilibra só apresentaria dados a autoridade mediante ordem judicial, e mesmo assim sem conseguir decifrar sem o cookie | Muito baixo |

## 6. Direitos do titular

- **Acesso e eliminação**: na própria conversa (ler e apagar), sem precisar se identificar.
- **Revogação do consentimento**: apagar a conversa e limpar o cookie.
- **Informação**: a política de privacidade (seção Espaço de escuta) e a tela de entrada.

## 7. Conclusão e aprovação

O tratamento é viável com as medidas acima, **condicionado** a:

- parecer jurídico favorável (`docs/legal/escuta-consulta-juridica.md`);
- psicólogo RT contratado, com aprovação do protocolo e da avaliação de segurança (`docs/escuta-protocolo-rt.md`);
- piloto fechado (`ESCUTA_PILOT_COMPANIES`) antes da liberação geral (`ESCUTA_ENABLED=1`).

| Papel | Nome | Data | Assinatura |
| --- | --- | --- | --- |
| Encarregado (DPO) | | | |
| Jurídico | | | |
| Psicólogo RT (CRP) | | | |
| Responsável técnico da plataforma | | | |
