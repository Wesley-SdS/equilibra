# Política de Privacidade

**Versão:** {{versao}} · **Última atualização:** {{versao}}

{{pendencias}}

## 1. Quem somos

O {{nomeFantasia}} é uma plataforma para gestão de riscos psicossociais no trabalho, conforme a NR-1. É operado por **{{razaoSocial}}**, CNPJ {{cnpj}}, com sede em {{endereco}}.

**Encarregado pelo Tratamento de Dados (DPO):** {{dpoNome}}, {{dpoEmail}}.

## 2. A quem esta política se aplica

O {{nomeFantasia}} trata dados de três grupos de pessoas, com papéis diferentes na LGPD:

| Quem | Exemplos | Nosso papel |
|---|---|---|
| **Usuários do painel** | Donos, administradores e leitores das contas de empresas, contadores e consultorias | **Controlador** (LGPD, art. 5º, VI) |
| **Respondentes dos questionários** | Funcionários das empresas clientes | **Operador** (art. 5º, VII), em nome da empresa empregadora |
| **Pessoas que usam o canal de relato** | Funcionários das empresas clientes | **Operador**, em nome da empresa empregadora |

Para respondentes e usuários do canal de relato, a **empresa empregadora é a controladora**: é ela quem decide aplicar a avaliação e quem responde pelo PGR. O {{nomeFantasia}} trata esses dados apenas conforme o contrato e o [Acordo de Tratamento de Dados (DPA)](/dpa). Pedidos sobre esses dados podem ser feitos diretamente à empresa ou a nós; nós os encaminharemos à empresa.

## 3. Quais dados tratamos

### 3.1 Usuários do painel
- Nome, e-mail profissional e senha (guardada apenas como hash com sal; nunca em texto).
- Empresas a que tem acesso e o papel em cada uma (dono, admin ou leitor).
- Dados cadastrais da empresa cliente: razão social, CNPJ e número de funcionários.
- Registro das alterações feitas no painel (trilha de auditoria), com autor e data.
- Data e versão do aceite destes documentos.
- Dados de assinatura (plano, período e identificadores no provedor de pagamento, quando ativado).

### 3.2 Respondentes dos questionários
O questionário **não pede nome, e-mail, telefone nem documento** e **não registramos IP, navegador nem horário** da resposta. Guardamos apenas:
- o **setor** escolhido pela pessoa;
- as **respostas** às perguntas (escala de frequência);
- a **data** (dia) da resposta.

Mesmo sem identificação direta, em setores muito pequenos as respostas poderiam, em tese, ser associadas a alguém. Por isso **tratamos essas respostas como dados pessoais** e aplicamos proteções adicionais: resultados de grupos com menos de 5 respostas **nunca** são exibidos isoladamente, e a empresa cliente não tem acesso às respostas individuais, apenas a resultados agregados.

Para evitar respostas duplicadas, o navegador guarda um cookie que indica apenas que aquele dispositivo já respondeu àquela campanha. Um rascunho das respostas fica **somente no próprio aparelho** (armazenamento local do navegador) até o envio.

### 3.3 Canal de relato
- Categoria escolhida e **texto livre** escrito pela pessoa;
- data (dia) do envio e protocolo gerado;
- resultado da triagem automática (seção 6).

Não pedimos identificação. Porém, o texto pode conter, por escolha de quem escreve, nomes de terceiros ou **dados pessoais sensíveis** (por exemplo, relatos de assédio sexual ou de saúde). Orientamos a evitar informações desnecessárias. Esses dados são tratados com o mesmo sigilo dos demais e acessados apenas pelos usuários autorizados da empresa cliente.

## 4. Para que usamos os dados e com qual base legal

| Finalidade | Dados | Base legal (LGPD) |
|---|---|---|
| Criar e manter a conta, autenticar e prestar o serviço | Dados do usuário do painel | Art. 7º, V (execução de contrato) |
| Enviar e-mails transacionais (convites, redefinição de senha, lembretes de campanha) | Nome e e-mail | Art. 7º, V |
| Cobrar a assinatura | Dados de assinatura | Art. 7º, V; art. 7º, II para obrigações fiscais |
| Manter a trilha de auditoria e a segurança da plataforma | Registros de alterações | Art. 7º, IX (legítimo interesse: segurança e prestação de contas) |
| Comprovar o aceite dos documentos | Data e versão do aceite | Art. 7º, VI (exercício regular de direitos) |
| Aplicar a avaliação psicossocial e gerar o inventário de riscos do PGR | Respostas e setor | Definida pela **empresa controladora**; tipicamente art. 7º, II e art. 11, II, "a" (cumprimento de obrigação legal: NR-1, Portaria MTE nº 1.419/2024) |
| Receber e encaminhar relatos do canal | Texto e categoria | Definida pela **empresa controladora**; tipicamente art. 7º, II e art. 11, II, "a" (por exemplo, Lei nº 14.457/2022 sobre prevenção ao assédio) |

Não usamos os dados para publicidade, não os vendemos e **não os usamos para treinar modelos de inteligência artificial**.

## 5. Com quem compartilhamos (operadores e sub-operadores)

Compartilhamos dados apenas com prestadores necessários ao funcionamento do serviço, vinculados por contrato a obrigações de confidencialidade e segurança:

{{subprocessadores}}

Também poderemos compartilhar dados quando exigido por lei ou por ordem de autoridade competente.

## 6. Decisões automatizadas

Usamos o modelo de decisão **Jev** (TypeSafe AI, acessado pelo Vercel AI Gateway) para apoiar o trabalho das empresas clientes:

- **Triagem do canal de relato:** sugere categoria, gravidade e urgência para ordenar a fila de atendimento;
- **Plano de ação:** sugere as medidas mais adequadas aos riscos encontrados;
- **Perguntas da empresa:** indica a qual dimensão psicossocial cada pergunta se relaciona.

Essas sugestões **não substituem a análise humana**: todo relato continua visível na íntegra, e as ações sugeridas podem ser editadas ou descartadas. **O score de risco da NR-1 não usa inteligência artificial**: é calculado por uma metodologia fixa e auditável. Você pode solicitar a revisão de decisões tomadas unicamente com base em tratamento automatizado (LGPD, art. 20) pelo canal da seção 10.

## 7. Transferência internacional

Parte dos sub-operadores está nos **Estados Unidos** (seção 5). O banco de dados fica no Brasil (São Paulo). Quando há transferência, ela se apoia em cláusulas contratuais com os fornecedores que garantem proteção equivalente à LGPD (art. 33, II) e é necessária à execução do contrato (art. 33, IX). Ao usar o canal de relato, o texto do relato é enviado ao Jev nos EUA para a triagem.

## 8. Por quanto tempo guardamos

{{retencao}}

Ao fim dos prazos, os dados são eliminados ou anonimizados de forma irreversível, salvo quando a guarda for exigida por lei (art. 16).

## 9. Como protegemos os dados

- Tráfego sempre criptografado (HTTPS) e banco de dados criptografado em repouso pelo provedor.
- Senhas guardadas apenas como hash (scrypt) com sal individual; tokens de redefinição guardados apenas como hash, com uso único e validade de 30 minutos.
- Isolamento entre empresas em todas as consultas, com verificação do vínculo e do papel do usuário a cada requisição.
- Perfis de acesso (dono, admin e leitor) e trilha de auditoria das alterações.
- Anonimato por desenho nos questionários e k-anonimato (mínimo de 5 respostas) nos resultados.

Em caso de incidente de segurança que possa acarretar risco ou dano relevante, comunicaremos a ANPD e os titulares afetados, conforme o art. 48 da LGPD; quando atuarmos como operador, comunicaremos a empresa controladora.

## 10. Seus direitos

Nos termos do art. 18 da LGPD, você pode solicitar:

- confirmação da existência de tratamento e acesso aos dados;
- correção de dados incompletos, inexatos ou desatualizados;
- anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade;
- portabilidade;
- eliminação dos dados tratados com base em consentimento;
- informação sobre com quem compartilhamos os dados;
- informação sobre a possibilidade de não fornecer consentimento e suas consequências;
- revogação do consentimento;
- revisão de decisões automatizadas (art. 20).

**Como exercer:** escreva para **{{dpoEmail}}**. Respondemos em até 15 dias. Usuários do painel também podem **exportar os dados da empresa** e **excluir a conta** em *Configurações → Privacidade e dados*.

Como as respostas dos questionários e os relatos do canal não são vinculados a uma identidade, podemos não conseguir localizá-los a partir de um pedido individual sem informações adicionais (por exemplo, o protocolo do relato). Isso protege o seu anonimato.

## 11. Cookies e armazenamento local

Usamos apenas recursos **essenciais** ao funcionamento. Não usamos cookies de publicidade nem de análise de terceiros.

| Nome | Finalidade | Duração |
|---|---|---|
| `eq_session` | Manter o usuário do painel conectado | 30 dias |
| `eq_r_<campanha>` | Indicar que este dispositivo já respondeu àquela campanha | 120 dias |
| `eq-theme` (armazenamento local) | Lembrar o tema claro/escuro | Até ser apagado |
| `eq_draft_<campanha>` (armazenamento local) | Rascunho das respostas, somente no aparelho, até o envio | Até o envio ou limpeza |

## 12. Crianças e adolescentes

O serviço é destinado a empresas e seus trabalhadores. Não tratamos intencionalmente dados de crianças. Para adolescentes contratados como aprendizes, a empresa controladora deve observar o art. 14 da LGPD.

## 13. Alterações desta política

Podemos atualizar esta política. Mudanças relevantes serão comunicadas no painel ou por e-mail, com a nova data de versão no topo.

## 14. Autoridade Nacional de Proteção de Dados

Se entender que seus direitos não foram atendidos, você pode peticionar à ANPD: https://www.gov.br/anpd
