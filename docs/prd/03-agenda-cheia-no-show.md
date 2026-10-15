# PRD 03 — Agenda Cheia: anti-falta com preenchimento automático para clínicas

| Campo | Valor |
|---|---|
| Status | Planejado |
| Versão | 1.0 — 15/10/2026 |
| Stack | Next.js · jStack (WebSockets + Redis) · Drizzle · Postgres · Zod · Tailwind · Motion · WhatsApp Business Cloud API · Pix (PSP com API) |
| Público | Clínicas e consultórios com 1–15 profissionais (odontologia, psicologia, fisioterapia, estética, médicas) |

---

## 1. Problema
- **42,2%** das clínicas privadas têm dificuldade para confirmar consultas (pesquisa Conclínica).
- O no-show pode comprometer **até 32% da agenda** (fonte comercial, ainda a validar com pilotos).
- Exemplo: 30 faltas por mês × R$ 300 = **R$ 9–12 mil por mês** perdidos por profissional.
- A secretária gasta de 1 a 2 horas por dia ligando e mandando WhatsApp manualmente para confirmar.
- **O horário cancelado em cima da hora quase nunca é reaproveitado.** Esse é o ponto que ninguém resolve bem: os lembretes já existem, mas nenhuma ferramenta preenche automaticamente a vaga que abriu.

## 2. Visão
> "Cancelou? Em 10 minutos já tem outro paciente no horário."

## 3. Métricas
| Objetivo | Métrica | Meta 6 meses |
|---|---|---|
| Resultado | Redução da taxa de no-show | ≥ 40% versus a linha de base |
| Diferencial | % de vagas canceladas que são preenchidas | ≥ 35% |
| ROI | Receita recuperada / mensalidade | ≥ 10× |
| Receita | MRR | R$ 60 mil |

## 4. Personas
- **Dra. Fernanda, dentista dona de clínica (3 cadeiras)**
- **Lúcia, secretária/recepcionista**
- **Paciente**: quer remarcar sem precisar ligar.

## 5. Escopo MVP
| # | Funcionalidade | Prioridade |
|---|---|---|
| F1 | Agenda própria (profissionais, procedimentos, duração) **ou** sincronização com Google Calendar | P0 |
| F2 | Confirmação por WhatsApp em D-2 e D-1, com botões "Confirmo / Remarcar / Cancelar" | P0 |
| F3 | **Lista de espera inteligente**: pacientes que querem antecipar, com preferência de dia e horário | P0 |
| F4 | **Preenchimento automático**: ao cancelar, oferece a vaga em cascata para a lista de espera (o primeiro a aceitar leva), com bloqueio otimista em tempo real | P0 |
| F5 | Sinal via Pix para pacientes reincidentes (regra configurável) | P1 |
| F6 | Score de risco de falta por paciente (histórico, antecedência, dia da semana) | P1 |
| F7 | Painel de ROI: faltas evitadas, vagas preenchidas e R$ recuperado | P0 |
| F8 | Página pública de agendamento e remarcação | P1 |

## 6. Requisitos-chave
- **Concorrência na vaga:** um lock no Redis (`SET NX` com TTL) garante que só um paciente fique com o horário. Os outros recebem "vaga já preenchida" e continuam na fila.
- **Tempo real:** o painel da recepção atualiza via WebSocket do jStack quando um paciente confirma ou aceita uma vaga.
- **WhatsApp:** só templates aprovados, com opt-in registrado (LGPD) e janela de 24h respeitada.
- **Dados de saúde (LGPD art. 11):** guardar o mínimo necessário, sem prontuário. O procedimento aparece de forma genérica na mensagem.

## 7. Modelo de dados (resumo)
`clinics`, `professionals`, `services(duracao, preco)`, `patients(opt_in_whatsapp, risco_score)`, `appointments(status: agendado|confirmado|cancelado|faltou|realizado)`, `waitlist(patient_id, preferencias_json, prioridade)`, `slot_offers(appointment_slot, patient_id, status, expira_em)`, `messages(log)`.

## 8. Modelo de negócio
| Plano | Preço | Inclui |
|---|---|---|
| Solo | R$ 129/mês | 1 profissional, 500 mensagens |
| Clínica | R$ 349/mês | até 5 profissionais, 2.000 mensagens, lista de espera |
| Clínica+ | R$ 690/mês | até 15 profissionais, Pix de sinal, score de risco |

Mensagem excedente: repasse do custo da Meta + 20%.

## 9. Mercado
- Cerca de 500 mil estabelecimentos de saúde privados no Brasil (CNES, ordem de grandeza: **validar**).
- Os nichos iniciais são odontologia e psicologia, que têm ticket recorrente e alta dor com faltas.

## 10. Concorrência
Os softwares de gestão de clínica (iClinic, Feegow, Clinicorp, Simples Dental) e os disparadores de WhatsApp **já fazem lembretes**. Nosso diferencial é o **preenchimento automático da vaga em cascata com lock em tempo real**, mais um ROI mostrado em reais. Também pode funcionar como **camada sobre** o software que a clínica já usa (via integração ou Google Calendar).

## 11. Riscos
- **Dependência da API do WhatsApp (custos e bloqueios):** ter SMS como fallback e boas práticas de template.
- **Clínicas presas ao software atual:** posicionamento como complemento, não substituição.

## 12. Roadmap
| Fase | Período | Entrega |
|---|---|---|
| Descoberta | Fev/2027 | 10 clínicas piloto com linha de base de no-show |
| MVP | Mar–Abr/2027 | F1–F4, F7 |
| v1.1 | Jun/2027 | Pix, score de risco, integrações com 2 softwares de clínica |

## 13. Critérios de aceite
- [ ] Um cancelamento dispara uma oferta para a lista de espera em até 60 s.
- [ ] Dois pacientes aceitando ao mesmo tempo nunca ficam com o mesmo horário (teste de concorrência).
- [ ] O painel de ROI bate com os eventos registrados.
