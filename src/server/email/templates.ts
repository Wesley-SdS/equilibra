// Templates transacionais em HTML com estilos inline (compatíveis com Gmail/Outlook).
// Sempre acompanham uma versão em texto puro.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

function layout({ preheader, title, body, cta }: { preheader: string; title: string; body: string; cta?: { label: string; href: string } }) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f6f7f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0b1410">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f4;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
<tr><td style="padding:0 4px 20px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="background:#bdf05c;border-radius:8px;width:28px;height:28px;text-align:center;font-weight:700;color:#07090a">~</td>
    <td style="padding-left:10px;font-size:17px;font-weight:600;letter-spacing:-0.02em">equilibra</td>
  </tr></table>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e3e6e1;border-radius:16px;padding:32px">
  <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;letter-spacing:-0.02em">${esc(title)}</h1>
  <div style="font-size:15px;line-height:1.6;color:#33403b">${body}</div>
  ${
    cta
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px"><tr><td style="background:#0b1410;border-radius:10px">
      <a href="${esc(cta.href)}" style="display:inline-block;padding:13px 20px;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none">${esc(cta.label)}</a>
    </td></tr></table>
    <p style="margin:16px 0 0;font-size:12px;color:#5f6c67">Se o botão não funcionar, copie este link: <br><span style="word-break:break-all">${esc(cta.href)}</span></p>`
      : ""
  }
</td></tr>
<tr><td style="padding:20px 4px;font-size:12px;line-height:1.5;color:#5f6c67">
  Equilibra · gestão de riscos psicossociais (NR-1).<br>Você recebeu este e-mail por causa de uma ação na sua conta.
</td></tr>
</table></td></tr></table></body></html>`
}

export function inviteEmail(p: { inviter: string; company: string; role: string; link: string }) {
  const title = `${p.inviter} convidou você para o Equilibra`
  return {
    subject: `Convite para acessar ${p.company} no Equilibra`,
    html: layout({
      preheader: `Acesso como ${p.role} na ${p.company}`,
      title,
      body: `<p style="margin:0">Você foi convidado para acompanhar a gestão de riscos psicossociais da <strong>${esc(p.company)}</strong> com o perfil <strong>${esc(p.role)}</strong>.</p><p style="margin:12px 0 0">O convite vale para este e-mail e pode ser usado uma única vez.</p>`,
      cta: { label: "Aceitar convite", href: p.link },
    }),
    text: `${title}.\n\nAcesso à ${p.company} como ${p.role}.\nAceite o convite: ${p.link}`,
  }
}

export function welcomeEmail(p: { name: string; company: string; link: string }) {
  const first = p.name.split(" ")[0] ?? p.name
  return {
    subject: "Bem-vindo ao Equilibra: seus próximos passos",
    html: layout({
      preheader: "Do cadastro ao relatório PGR em 7 dias",
      title: `Olá, ${first}! A conta da ${p.company} está pronta.`,
      body: `<p style="margin:0">Para ter o inventário de riscos psicossociais no PGR:</p>
<ol style="margin:12px 0 0;padding-left:20px">
<li style="margin-bottom:6px">Cadastre os setores e o número de pessoas em cada um.</li>
<li style="margin-bottom:6px">Lance a campanha e divulgue o link anônimo (o kit com QR code ajuda).</li>
<li style="margin-bottom:6px">Com 5 ou mais respostas por setor, veja o mapa de risco.</li>
<li>Monte o plano de ação e baixe o relatório em PDF.</li>
</ol>`,
      cta: { label: "Abrir o painel", href: p.link },
    }),
    text: `Olá, ${first}! A conta da ${p.company} está pronta.\n\n1. Cadastre os setores\n2. Lance a campanha\n3. Veja o mapa de risco\n4. Monte o plano e baixe o PDF\n\n${p.link}`,
  }
}

export function passwordResetEmail(p: { name: string; link: string; minutes: number }) {
  return {
    subject: "Redefinir sua senha do Equilibra",
    html: layout({
      preheader: `O link vale por ${p.minutes} minutos`,
      title: "Redefinir senha",
      body: `<p style="margin:0">Olá, ${esc(p.name.split(" ")[0] ?? p.name)}. Recebemos um pedido para redefinir a sua senha.</p><p style="margin:12px 0 0">O link vale por <strong>${p.minutes} minutos</strong> e só pode ser usado uma vez. Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>`,
      cta: { label: "Criar nova senha", href: p.link },
    }),
    text: `Recebemos um pedido para redefinir sua senha. O link vale por ${p.minutes} minutos:\n${p.link}\n\nSe não foi você, ignore este e-mail.`,
  }
}

export function campaignReminderEmail(p: { company: string; campaign: string; endsAt: string; daysLeft: number; rate: number; responses: number; kitLink: string }) {
  const urgency = p.daysLeft <= 1 ? "termina amanhã" : `termina em ${p.daysLeft} dias`
  return {
    subject: `${p.campaign} ${urgency}: ${p.rate}% de resposta`,
    html: layout({
      preheader: `${p.responses} respostas até agora na ${p.company}`,
      title: `A campanha ${urgency}`,
      body: `<p style="margin:0"><strong>${esc(p.campaign)}</strong> (${esc(p.company)}) está com <strong>${p.rate}% de resposta</strong> (${p.responses} respostas) e encerra em ${esc(p.endsAt)}.</p>
<p style="margin:12px 0 0">Um lembrete da direção na reta final costuma aumentar bastante a adesão. Use o kit com a mensagem pronta para WhatsApp e o cartaz com QR code.</p>`,
      cta: { label: "Abrir kit de divulgação", href: p.kitLink },
    }),
    text: `${p.campaign} ${urgency}: ${p.rate}% de resposta (${p.responses}). Encerra em ${p.endsAt}.\nKit de divulgação: ${p.kitLink}`,
  }
}

/** Convite/lembrete enviado aos trabalhadores com o link ANÔNIMO da campanha (mesmo link para todos). */
export function respondentEmail(p: { company: string; campaign: string; endsAt: string; link: string; reminder: boolean; minutes: number }) {
  const subject = p.reminder ? `Lembrete: sua opinião ainda conta (até ${p.endsAt})` : `Sua opinião sobre o ambiente de trabalho (anônimo, ${p.minutes} min)`
  return {
    subject,
    html: layout({
      preheader: "Anônimo: não pedimos nome, e-mail nem telefone",
      title: p.reminder ? "Ainda dá tempo de responder" : "Como está o seu dia a dia no trabalho?",
      body: `<p style="margin:0">A <strong>${esc(p.company)}</strong> está realizando a avaliação de riscos psicossociais prevista na NR-1 (<em>${esc(p.campaign)}</em>).</p>
<ul style="margin:12px 0 0;padding-left:20px">
<li style="margin-bottom:6px">Cerca de ${p.minutes} minutos, pelo celular</li>
<li style="margin-bottom:6px"><strong>Anônimo:</strong> não pedimos nome, e-mail nem telefone, e este link é o mesmo para toda a equipe</li>
<li>Resultados só aparecem para grupos de 5 ou mais pessoas</li>
</ul>
<p style="margin:12px 0 0">Responda até <strong>${esc(p.endsAt)}</strong>.</p>`,
      cta: { label: "Responder agora", href: p.link },
    }),
    text: `${p.company} · ${p.campaign}\n\n${subject}\n\nResponda até ${p.endsAt} (cerca de ${p.minutes} min, anônimo): ${p.link}`,
  }
}
