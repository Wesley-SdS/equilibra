# Consulta jurídica — Espaço de escuta

> Roteiro de perguntas para o advogado (direito digital/LGPD e direito do trabalho), com o contexto que ele precisa. Leva junto: RIPD (`ripd-espaco-de-escuta.md`), termos de uso, política de privacidade, DPA e o texto do prompt (`src/server/listening.ts`).

## Contexto em uma página

- O Equilibra é um SaaS de gestão de riscos psicossociais (NR-1) para PMEs.
- O **Espaço de escuta** é um agente de apoio feito de IA, oferecido pela empresa cliente aos seus trabalhadores, opcional e desligado por padrão.
- Ele ouve, dá informação geral e encaminha (canal de relato, RH, convênio, UBS/CAPS, CVV 188).
- **Não** é apresentado como psicólogo e não faz terapia, diagnóstico, avaliação de risco nem manejo de crise. A crise é detectada por regras e respondida com texto fixo, revisado por psicólogo, que indica CVV e SAMU.
- **Anonimato**: sem login; conversa cifrada com chave só no aparelho; a empresa vê apenas temas agregados acima de mínimos.
- **Referências que guiaram o desenho**:
  - nota do CFP de 3/7/2025 sobre IA;
  - cartilha "IA na Psicologia" (CFP, dez/2025);
  - Nota Técnica CFP 5/2025;
  - Lei 4.119/1962 (profissão de psicólogo);
  - Lei 14.457/2022;
  - NR-1 (GRO/PGR);
  - LGPD;
  - CDC.

## Perguntas

1. **Exercício profissional.** Com os limites acima, o recurso pode ser caracterizado como exercício ilegal da psicologia (Lei 4.119/1962, art. 13 §1º; Decreto 53.464/1964; Código Penal, art. 282 por analogia)? Que palavras evitar no produto e no marketing ("escuta", "acolhimento", "apoio emocional", "saúde mental")?
2. **Responsável técnico.** É necessário, ou recomendável, psicólogo responsável técnico com registro no CRP e cadastro da empresa no CRP? Qual o escopo mínimo do contrato (revisão de prompt, protocolo de crise, avaliação de segurança, supervisão do piloto)?
3. **Consentimento sob subordinação.** O consentimento do trabalhador (art. 11 I da LGPD) é válido quando a ferramenta é oferecida pelo empregador, mesmo que a empresa não tenha acesso a nada individual? Haveria base mais adequada? Quem é controlador: a empresa cliente, o Equilibra ou ambos (controladoria conjunta)?
4. **Responsabilidade civil.** Se uma pessoa em crise usar o recurso e algo grave acontecer, qual a exposição do Equilibra e da empresa cliente (CDC, art. 14; Código Civil, art. 927, parágrafo único)? O protocolo de crise fixo e os avisos bastam? Que cláusulas nos termos e no contrato com o cliente reduzem esse risco sem serem abusivas?
5. **Dever de agir em risco à vida.** Ao detectar sinal de risco, existe dever de comunicar alguém (empresa, autoridade)? O desenho atual não identifica a pessoa e não comunica ninguém, só orienta o CVV e o SAMU. Isso é adequado ou há obrigação de outra conduta?
6. **Transferência internacional.** O texto vai ao provedor do modelo nos EUA. As cláusulas-padrão da ANPD (Res. CD/ANPD 19/2024) e os termos comerciais do provedor (sem treino, retenção limitada) atendem ao art. 33? É preciso informar o país no consentimento?
7. **Requisição de dados.** Em caso de ordem judicial ou requisição do MPT ou da fiscalização do trabalho, como responder, já que o Equilibra não consegue decifrar as conversas sem o cookie do aparelho? Isso precisa constar nos termos?
8. **Uso trabalhista.** A empresa pode alegar o Espaço de escuta como medida de prevenção no PGR ou na defesa em ação de assédio ou doença ocupacional? Há risco de a oferta ser vista como transferência de responsabilidade ao trabalhador?
9. **Menores e jovens aprendizes.** A restrição a maiores de 18 anos é suficiente, ou o recurso deve ser bloqueado para empresas com aprendizes?
10. **Publicidade.** Que alegações são permitidas na página de vendas ("não substitui atendimento profissional", "não é psicólogo")? Há necessidade de registro ou rotulagem no PL 2338/2023 (IA de alto risco), se aprovado?

## O que esperamos do parecer

- Liberação do recurso: sim, não, ou sim com condições.
- Ajustes de texto: tela de entrada, termos, política de privacidade, DPA e marketing.
- Cláusulas para o contrato com o cliente e com o psicólogo RT.
- Validação ou ajuste das bases legais e do RIPD.
