// Fonte única dos dados jurídicos usados nos Termos, na Política de Privacidade e no DPA.
// Preencha os campos entre colchetes quando a empresa operadora estiver definida.
// Ao mudar o conteúdo dos documentos, atualize LEGAL_VERSION: novos aceites passam a
// registrar a nova versão.

// Formato AAAA-MM-DD ou AAAA-MM-DD.N (N = revisão no mesmo dia).
export const LEGAL_VERSION = "2026-10-17.3"

/** Versão para exibição: 17/10/2026 (rev. 2). */
export function formatLegalVersion(v: string = LEGAL_VERSION) {
  const [date, rev] = v.split(".")
  const label = date!.split("-").reverse().join("/")
  return rev ? `${label} (rev. ${rev})` : label
}

export const CONTROLLER = {
  razaoSocial: "[RAZAO_SOCIAL]",
  nomeFantasia: "Equilibra",
  cnpj: "[CNPJ]",
  endereco: "[ENDERECO_COMPLETO]",
  foro: "[CIDADE_DO_FORO]/[UF]",
  emailContato: "[EMAIL_DE_CONTATO]",
  dpoNome: "[NOME_DO_ENCARREGADO]",
  dpoEmail: "[EMAIL_DO_ENCARREGADO]",
  site: "https://equilibra-wesleysds-projects.vercel.app",
}

/** Campos ainda não preenchidos (aparecem no topo de cada documento). */
export const PENDING_FIELDS = Object.entries(CONTROLLER)
  .filter(([, v]) => /\[[A-Z_/]+\]/.test(v))
  .map(([k]) => k)

/** Sub-operadores (LGPD Art. 39; Anexo III do DPA). Mantenha alinhado com a infraestrutura real. */
export const SUBPROCESSORS = [
  {
    nome: "Vercel Inc.",
    finalidade: "Hospedagem da aplicação e execução das funções (região São Paulo, gru1); CDN",
    dados: "Todos os dados que trafegam pela aplicação",
    pais: "EUA (funções executadas no Brasil)",
  },
  {
    nome: "Neon Inc. (sobre AWS)",
    finalidade: "Banco de dados Postgres gerenciado",
    dados: "Todos os dados armazenados",
    pais: "Brasil (aws-sa-east-1, São Paulo)",
  },
  {
    nome: "Vercel AI Gateway / TypeSafe AI (modelo Jev)",
    finalidade: "Decisões automatizadas de apoio: triagem dos relatos do canal, escolha de ações do plano e classificação de perguntas",
    dados: "Texto dos relatos do canal; dados agregados de risco; texto das perguntas da empresa",
    pais: "EUA",
  },
  {
    nome: "Resend Inc.",
    finalidade: "Envio de e-mails transacionais (convites, redefinição de senha, lembretes)",
    dados: "Nome e e-mail de usuários do painel; nome da empresa",
    pais: "EUA",
  },
  {
    nome: "Meta Platforms, Inc. (WhatsApp Business Cloud API)",
    finalidade: "Envio, a pedido da empresa cliente, do link anônimo da avaliação por WhatsApp",
    dados: "Número de telefone do destinatário e o texto da mensagem (empresa, campanha, link e data)",
    pais: "EUA",
  },
  {
    nome: "[PROVEDOR_DE_PAGAMENTO]",
    finalidade: "Cobrança das assinaturas (quando ativado)",
    dados: "Nome, e-mail e dados de pagamento do responsável pela assinatura",
    pais: "[PAIS]",
  },
] as const

/** Prazos de retenção por categoria (Política §7 e DPA Anexo I). */
export const RETENTION = [
  { categoria: "Conta de usuário do painel (nome, e-mail, hash da senha)", prazo: "Enquanto a conta existir; eliminada em até 30 dias após o pedido de exclusão" },
  { categoria: "Dados da empresa cliente (cadastro, setores, campanhas, plano de ação)", prazo: "Durante o contrato; eliminados em até 30 dias após o encerramento, salvo instrução diversa do cliente" },
  { categoria: "Respostas dos questionários", prazo: "Durante o contrato, para compor o histórico do PGR; eliminadas com os dados da empresa" },
  { categoria: "Relatos do canal, mensagens da conversa e imagens anexadas", prazo: "Durante o contrato; o cliente (controlador) pode excluir antes. Eliminados com os dados da empresa" },
  { categoria: "Trilha de auditoria", prazo: "Durante o contrato; eliminada com os dados da empresa" },
  { categoria: "Tokens de redefinição de senha", prazo: "Expiram em 30 minutos; apagados em até 24 horas" },
  { categoria: "Convites não aceitos", prazo: "Apagados após 30 dias" },
  { categoria: "Lista de envio da campanha (telefones e e-mails informados pelo RH)", prazo: "Apagada quando a campanha é encerrada ou vence, e pelo cliente a qualquer momento" },
  { categoria: "Registros de aceite dos termos", prazo: "Enquanto a conta existir" },
] as const
