export const CHANNEL_CATEGORIES = [
  { id: "assedio_moral", label: "Assédio moral" },
  { id: "assedio_sexual", label: "Assédio sexual" },
  { id: "discriminacao", label: "Discriminação" },
  { id: "sobrecarga", label: "Sobrecarga ou jornada abusiva" },
  { id: "conflito", label: "Conflito com colega ou liderança" },
  { id: "outro", label: "Outro" },
] as const

export type ChannelCategory = (typeof CHANNEL_CATEGORIES)[number]["id"]

export const CHANNEL_STATUS = {
  received: "Recebido",
  analyzing: "Em análise",
  resolved: "Concluído",
} as const

export function categoryLabel(id: string) {
  return CHANNEL_CATEGORIES.find((c) => c.id === id)?.label ?? id
}
