// Catálogo de metodologias de avaliação psicossocial. A NR-1 não impõe instrumento: a empresa
// escolhe uma metodologia tecnicamente fundamentada e registra a justificativa (MTE, perguntas e
// respostas do GRO/PGR, maio/2026, perguntas 9 e 14). Todas mapeiam para as 7 dimensões do
// Equilibra, para que mapa de calor, plano de ação e evolução continuem comparáveis.
//
// COPSOQ III e HSE Indicator Tool ficam no catálogo como "aguardando licença": os itens oficiais só
// entram quando a licença de uso comercial estiver confirmada (decisão 5 do PRD v2). Até lá, uma
// consultoria que já tem a licença pode importar o próprio instrumento e usá-lo como metodologia própria.

import { DIMENSIONS, type DimensionId } from "./methodology"
import type { QuestionnaireItem } from "./questionnaire"

export type MethodologyId = "equilibra" | "mte" | "copsoq3" | "hse" | "propria"

export type Methodology = {
  id: MethodologyId
  name: string
  source: string
  url?: string
  /** "importar": a empresa importa o arquivo oficial e escolhe o questionário importado. */
  status: "disponivel" | "importar"
  description: string
  /** Questionário de sistema que a campanha NR-1 usa por padrão (null = escolhido pela empresa). */
  standardQuestionnaireId: string | null
  /** Severidade padrão (1–5) por dimensão, usada no inventário (probabilidade × severidade). */
  severity: Record<DimensionId, number>
  /** Texto-base da justificativa técnica que vai para o relatório PGR. */
  justification: string
}

const EQUILIBRA_SEVERITY = Object.fromEntries(DIMENSIONS.map((d) => [d.id, d.severity])) as Record<DimensionId, number>

export const METHODOLOGIES: Methodology[] = [
  {
    id: "equilibra",
    name: "Equilibra NR-1",
    source: "Instrumento próprio inspirado no COPSOQ e nos HSE Management Standards",
    status: "disponivel",
    description: "28 itens em 7 dimensões, escala de frequência de 5 pontos. Curto (cerca de 7 minutos) e pensado para PMEs.",
    standardQuestionnaireId: "nr1-padrao",
    severity: EQUILIBRA_SEVERITY,
    justification:
      "Questionário autoaplicável e anônimo de 28 itens em 7 dimensões reconhecidas na literatura de riscos psicossociais (demandas, controle, apoio da liderança, apoio dos colegas, relacionamentos e assédio, clareza de papel, reconhecimento e mudanças), inspirado no Copenhagen Psychosocial Questionnaire e nos HSE Management Standards, adequado ao porte da organização.",
  },
  {
    id: "mte",
    name: "Guia MTE de fatores psicossociais",
    source: "Ministério do Trabalho e Emprego · Guia de informações sobre fatores de risco psicossociais (2025) e Manual do GRO/PGR (2026)",
    url: "https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/manuais-e-publicacoes/2026/perguntas-e-respostas-gro-pgr-maio-2026",
    status: "disponivel",
    description: "Itens escritos pelo Equilibra a partir da lista exemplificativa de fatores do guia do MTE, que é a referência que o auditor fiscal conhece. Cobre também trabalho remoto e violência externa.",
    standardQuestionnaireId: "mte-padrao",
    severity: { demandas: 4, controle: 3, lideranca: 3, colegas: 2, relacoes: 5, papel: 3, reconhecimento: 3 },
    justification:
      "Questionário anônimo construído a partir da lista exemplificativa de fatores de risco psicossociais do Guia de informações do Ministério do Trabalho e Emprego (2025), cobrindo organização do trabalho, modelo de gestão, metas, relações interpessoais, violência e assédio, clareza de papel, mudanças e reconhecimento. Os resultados integram a Avaliação Ergonômica Preliminar (NR-17) e o inventário de riscos do PGR.",
  },
  {
    id: "copsoq3",
    name: "COPSOQ III (versão curta, português)",
    source: "Copenhagen Psychosocial Questionnaire, 3ª versão · rede internacional COPSOQ",
    url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8834667/",
    status: "importar",
    description: "Referência internacional mais citada pelas consultorias de SST. Obtenha a versão oficial em português com o membro da rede COPSOQ (uso gratuito, sem modificações) e importe o arquivo: o Equilibra reconhece as escalas pelos códigos e pontua sem alterar os itens.",
    standardQuestionnaireId: null,
    severity: { demandas: 4, controle: 3, lideranca: 3, colegas: 2, relacoes: 5, papel: 2, reconhecimento: 3 },
    justification:
      "Copenhagen Psychosocial Questionnaire (COPSOQ III), versão oficial em português, aplicado de forma anônima e sem modificações, conforme as diretrizes da COPSOQ International Network (licença CC BY-NC-ND 4.0; o questionário não é cobrado). As escalas foram mapeadas nas 7 dimensões de riscos psicossociais; indicadores de saúde e de resultado são relatados fora do score do inventário.",
  },
  {
    id: "hse",
    name: "HSE Management Standards Indicator Tool",
    source: "Health and Safety Executive (Reino Unido) · 35 itens em 7 domínios",
    status: "importar",
    description: "Domínios quase idênticos aos do Equilibra (demandas, controle, apoio da gestão, apoio dos pares, relações, papel, mudança). Baixe o Indicator Tool gratuito no site do HSE (ou uma tradução validada) e importe o arquivo: o Equilibra pontua pela chave oficial dos 35 itens.",
    standardQuestionnaireId: null,
    severity: { demandas: 4, controle: 3, lideranca: 3, colegas: 2, relacoes: 5, papel: 3, reconhecimento: 3 },
    justification:
      "HSE Management Standards Indicator Tool (Health and Safety Executive, Reino Unido), 35 itens em 7 escalas (demandas, controle, apoio da gestão, apoio dos colegas, relacionamentos, papel e mudança), aplicado de forma anônima e pontuado pela chave oficial dos itens, mapeada nas 7 dimensões de riscos psicossociais. Contém informação do setor público licenciada sob a Open Government Licence v3.0.",
  },
  {
    id: "propria",
    name: "Metodologia própria (consultoria/SST)",
    source: "Definida pelo responsável técnico da empresa ou pela consultoria parceira",
    status: "disponivel",
    description: "Use o instrumento da sua consultoria: crie ou importe o questionário, mapeie os itens nas 7 dimensões e escreva a justificativa técnica que irá para o relatório.",
    standardQuestionnaireId: null,
    severity: EQUILIBRA_SEVERITY,
    justification: "",
  },
]

export function methodologyById(id: string | null | undefined): Methodology {
  return METHODOLOGIES.find((m) => m.id === id) ?? METHODOLOGIES[0]!
}

/** Severidade efetiva: padrão da metodologia com os ajustes do responsável técnico. */
export function effectiveSeverity(id: string | null | undefined, overrides: Partial<Record<DimensionId, number>> | null | undefined) {
  const base = methodologyById(id).severity
  return Object.fromEntries(DIMENSIONS.map((d) => [d.id, Math.min(5, Math.max(1, Math.round(overrides?.[d.id] ?? base[d.id])))])) as Record<DimensionId, number>
}

/**
 * Itens do questionário padrão do Guia MTE, escritos pelo Equilibra a partir da lista de fatores
 * do guia (não são texto do MTE). 21 itens, 3 por dimensão, escala Nunca → Sempre.
 */
export const MTE_ITEMS: QuestionnaireItem[] = [
  { id: "mte_d1", text: "A quantidade de trabalho que recebo cabe na minha jornada.", dimension: "demandas", risk: false },
  { id: "mte_d2", text: "As metas que preciso cumprir são impossíveis ou mudam sem aviso.", dimension: "demandas", risk: true },
  { id: "mte_d3", text: "Fico disponível para o trabalho fora do horário, por telefone ou aplicativo.", dimension: "demandas", risk: true },
  { id: "mte_c1", text: "Tenho liberdade para decidir a ordem e o jeito de fazer as minhas tarefas.", dimension: "controle", risk: false },
  { id: "mte_c2", text: "Meu trabalho é monótono ou controlado minuto a minuto.", dimension: "controle", risk: true },
  { id: "mte_c3", text: "Sou consultado(a) antes de mudanças no meu trabalho.", dimension: "controle", risk: false },
  { id: "mte_l1", text: "Recebo orientação e ajuda da minha liderança quando preciso.", dimension: "lideranca", risk: false },
  { id: "mte_l2", text: "A forma de cobrança da liderança me deixa constrangido(a).", dimension: "lideranca", risk: true },
  { id: "mte_l3", text: "As regras e decisões da empresa são aplicadas de forma justa para todos.", dimension: "lideranca", risk: false },
  { id: "mte_p1", text: "Posso contar com meus colegas para dividir o trabalho difícil.", dimension: "colegas", risk: false },
  { id: "mte_p2", text: "Trabalho isolado(a), sem contato com a equipe, inclusive no trabalho remoto.", dimension: "colegas", risk: true },
  { id: "mte_p3", text: "Há conflitos na equipe que ninguém resolve.", dimension: "colegas", risk: true },
  { id: "mte_r1", text: "Sofro ou presencio humilhação, gritos ou ameaças no trabalho.", dimension: "relacoes", risk: true },
  { id: "mte_r2", text: "Sofro ou presencio assédio sexual ou discriminação no trabalho.", dimension: "relacoes", risk: true },
  { id: "mte_r3", text: "Sofro agressões ou ameaças de clientes, usuários ou do público.", dimension: "relacoes", risk: true },
  { id: "mte_a1", text: "Sei com clareza quais são as minhas responsabilidades.", dimension: "papel", risk: false },
  { id: "mte_a2", text: "Recebo ordens contraditórias de pessoas diferentes.", dimension: "papel", risk: true },
  { id: "mte_a3", text: "Tenho os recursos e a informação necessários para fazer o meu trabalho.", dimension: "papel", risk: false },
  { id: "mte_e1", text: "Meu trabalho é reconhecido pela empresa.", dimension: "reconhecimento", risk: false },
  { id: "mte_e2", text: "Mudanças na empresa são comunicadas com antecedência e explicadas.", dimension: "reconhecimento", risk: false },
  { id: "mte_e3", text: "Tenho medo de perder o emprego a qualquer momento.", dimension: "reconhecimento", risk: true },
].map((i) => ({ ...i, type: "likert5" as const, dimension: i.dimension as DimensionId }))
