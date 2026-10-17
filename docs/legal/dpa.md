# Acordo de Tratamento de Dados (DPA)

**Versão:** {{versao}} · **Última atualização:** {{versao}}

{{pendencias}}

Este Acordo integra os [Termos de Uso](/termos) e se aplica sempre que o **Cliente** (empresa que contrata o {{nomeFantasia}}), na qualidade de **Controlador**, usa a Plataforma para tratar dados pessoais de seus trabalhadores. **{{razaoSocial}}**, CNPJ {{cnpj}}, atua como **Operador** (LGPD, arts. 5º, VII e 39).

## 1. Definições

Aplicam-se as definições do art. 5º da LGPD (dado pessoal, dado pessoal sensível, titular, controlador, operador, tratamento, anonimização, incidente de segurança). "Sub-operador" é o terceiro contratado pelo Operador para auxiliar no tratamento.

## 2. Papéis

O Cliente decide sobre as finalidades e os meios essenciais do tratamento (aplicar a avaliação psicossocial e manter o canal de relato) e é responsável pela base legal e pela transparência com os titulares. O Operador trata os dados **apenas** para prestar o serviço e conforme as instruções documentadas do Cliente, que incluem as configurações feitas por ele na Plataforma.

## 3. Instruções

O Operador não tratará os dados para finalidade própria, não os venderá e não os usará para treinar modelos de inteligência artificial. Se considerar que uma instrução viola a LGPD, avisará o Cliente.

## 4. Confidencialidade

O acesso aos dados é restrito a pessoas autorizadas, vinculadas a dever de confidencialidade, e na medida do necessário para operar, manter e dar suporte à Plataforma.

## 5. Medidas de segurança

O Operador adota as medidas técnicas e administrativas do **Anexo II**, compatíveis com o art. 46 da LGPD e com a natureza dos dados (que podem incluir dados sensíveis).

## 6. Sub-operadores

O Cliente autoriza os sub-operadores do **Anexo III**. O Operador avisará com pelo menos 15 dias de antecedência sobre a inclusão ou substituição de sub-operadores; o Cliente poderá se opor fundamentadamente e, não havendo acordo, rescindir sem multa. O Operador exige dos sub-operadores obrigações de proteção equivalentes às deste Acordo.

## 7. Direitos dos titulares

Pedidos de titulares recebidos pelo Operador serão encaminhados ao Cliente em até 5 dias úteis. O Operador auxiliará o Cliente a responder, considerando que as respostas aos questionários e os relatos não são vinculados à identidade das pessoas, por desenho.

## 8. Incidentes de segurança

O Operador comunicará ao Cliente, em até **48 horas** após tomar conhecimento, qualquer incidente que afete dados do Cliente, com: natureza do incidente, dados e titulares possivelmente afetados, medidas adotadas e contato para acompanhamento. O Operador apoiará o Cliente nas comunicações à ANPD e aos titulares (art. 48).

## 9. Decisões automatizadas

A triagem de relatos, as ações sugeridas e a classificação de perguntas usam o modelo de decisão Jev (Anexo III) **como apoio à decisão humana**. O texto integral dos relatos permanece disponível ao Cliente, e as sugestões podem ser revistas. O score de risco NR-1 é calculado por metodologia determinística, sem IA.

## 10. Transferência internacional

Parte dos sub-operadores trata dados fora do Brasil (Anexo III). Essas transferências se apoiam em cláusulas contratuais que asseguram nível de proteção compatível com a LGPD (art. 33, II) e são necessárias à execução do contrato (art. 33, IX). O banco de dados principal fica no Brasil.

## 11. Auditoria

Mediante pedido escrito com 30 dias de antecedência, no máximo uma vez por ano e sob confidencialidade, o Operador fornecerá informações razoáveis para demonstrar o cumprimento deste Acordo (questionário de segurança, descrição de controles e relatórios de fornecedores, quando disponíveis).

## 12. Devolução e eliminação

O Cliente pode exportar seus dados a qualquer momento (*Configurações → Privacidade e dados*). Ao término do contrato ou mediante pedido de exclusão, o Operador eliminará os dados do Cliente em até **30 dias**, inclusive de sub-operadores, salvo guarda exigida por lei. Cópias de segurança são sobrescritas no ciclo normal de retenção do provedor.

## 13. Vigência

Este Acordo vigora enquanto o Operador tratar dados do Cliente. As cláusulas de confidencialidade e eliminação sobrevivem ao término.

## 14. Lei e foro

Lei brasileira. Foro da comarca de {{foro}}.

---

## Anexo I · Detalhes do tratamento

| Item | Descrição |
|---|---|
| **Finalidades** | Aplicar a avaliação de riscos psicossociais; calcular indicadores agregados; apoiar o plano de ação e o relatório do PGR; receber, triar e encaminhar relatos do canal |
| **Titulares** | Trabalhadores do Cliente (respondentes e autores de relatos); terceiros eventualmente mencionados nos relatos |
| **Dados** | Setor, respostas (escala de frequência) e data das respostas; texto, categoria, data e protocolo dos relatos; resultado da triagem automática |
| **Dados sensíveis** | As respostas podem revelar informações sobre saúde mental quando reidentificáveis; os relatos podem conter dados sensíveis inseridos pelo autor (por exemplo, vida sexual ou saúde) |
| **Operações** | Coleta, armazenamento, cálculo agregado, exibição ao Cliente, triagem automatizada, exportação e eliminação |
| **Duração** | Durante o contrato, observados os prazos abaixo |

**Retenção:**

{{retencao}}

## Anexo II · Medidas de segurança

- **Anonimato por desenho:** os questionários não coletam nome, contato, documento, IP, navegador nem horário exato; o canal de relato não exige identificação.
- **k-anonimato:** resultados de grupos com menos de 5 respostas nunca são exibidos isoladamente; o Cliente não acessa respostas individuais.
- **Criptografia:** HTTPS em todo o tráfego; banco de dados criptografado em repouso pelo provedor.
- **Credenciais:** senhas com hash scrypt e sal individual; tokens de redefinição guardados só como hash, com uso único e validade de 30 minutos; cookie de sessão httpOnly assinado com HMAC.
- **Controle de acesso:** isolamento entre clientes em todas as consultas; vínculo e papel (dono, admin ou leitor) verificados no servidor a cada requisição; remoção de acesso com efeito imediato.
- **Rastreabilidade:** trilha de auditoria das alterações feitas no painel.
- **Validação de entrada** em 100% dos endpoints e limitação de requisições nos endpoints públicos.
- **Minimização:** sub-operadores recebem apenas os dados necessários à sua função.
- **Continuidade:** backups gerenciados pelo provedor do banco de dados.

## Anexo III · Sub-operadores autorizados

{{subprocessadores}}
