/* DENTALCHECK — e-mails automáticos (Resend, pela API REST, sem dependências).
   Configuração: RESEND_API_KEY e EMAIL_REMETENTE (ex.: "DENTALCHECK <ola@dentalcheck.com.br>").
   Sem as variáveis, nada é enviado e o restante do app funciona normalmente. */

const APP = () => (process.env.APP_URL || "https://dentalcheck.vercel.app").replace(/\/$/, "");
const NOMES = { essencial: "Essencial", profissional: "Profissional", clinica: "Clínica" };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function enviar(para, assunto, html, texto) {
  const chave = process.env.RESEND_API_KEY, de = process.env.EMAIL_REMETENTE;
  if (!chave || !de) { console.log("[email] não configurado — boas-vindas não enviado"); return false; }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${chave}`, "content-type": "application/json" },
    body: JSON.stringify({ from: de, to: [para], subject: assunto, html, text: texto, reply_to: process.env.EMAIL_RESPOSTA || undefined })
  });
  if (!r.ok) { console.error("[email] falhou:", r.status, (await r.text()).slice(0, 200)); return false; }
  console.log("[email] boas-vindas enviado");
  return true;
}

/* boas-vindas depois da compra: explica que a conta é criada com o MESMO e-mail da compra */
export async function emailBoasVindas({ email, nome, plano }) {
  const primeiro = String(nome || "").trim().split(/\s+/)[0] || "";
  const link = `${APP()}/?compra=1&email=${encodeURIComponent(email)}`;
  const planoNome = NOMES[plano] || "DENTALCHECK";
  const passos = [
    ["Abra o DENTALCHECK", `Toque no botão abaixo (ou acesse <b>${esc(APP().replace(/^https:\/\//, ""))}</b>).`],
    ["Crie a sua conta com este e-mail", `Use exatamente <b>${esc(email)}</b>, o mesmo da compra — é ele que libera o seu plano.`],
    ["Confirme o e-mail", "Você vai receber um link de confirmação. Clique nele e depois entre com o seu e-mail e senha."],
    ["Faça a primeira simulação", "Toque em “Novo procedimento”, envie a foto do sorriso e escolha o planejamento."]
  ];
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f3f8fb;font-family:Arial,Helvetica,sans-serif;color:#10233a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f8fb;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden">
    <tr><td style="background:#0c2440;padding:22px 28px;color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:.5px">DENTAL<span style="color:#4fd1c5">CHECK</span></td></tr>
    <tr><td style="padding:28px">
      <p style="margin:0 0 6px;font-size:13px;font-weight:bold;letter-spacing:1px;color:#0b9e96;text-transform:uppercase">Compra confirmada · Plano ${esc(planoNome)}</p>
      <h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;color:#0c2440">${primeiro ? `Bem-vindo(a), ${esc(primeiro)}!` : "Bem-vindo(a) ao DENTALCHECK!"}</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#5d6f84">Sua assinatura já está ativa. Falta só um passo: criar a sua conta no app. Leva menos de um minuto.</p>
      ${passos.map(([t, d], i) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px"><tr>
        <td valign="top" style="width:34px"><div style="width:26px;height:26px;border-radius:13px;background:#0b9e96;color:#fff;font-weight:bold;font-size:14px;line-height:26px;text-align:center">${i + 1}</div></td>
        <td style="font-size:15px;line-height:1.5"><b style="color:#0c2440">${t}</b><br><span style="color:#5d6f84">${d}</span></td></tr></table>`).join("")}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px"><tr><td style="border-radius:99px;background:#0b9e96">
        <a href="${link}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-weight:bold;font-size:15px;text-decoration:none">Criar minha conta</a></td></tr></table>
      <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#8a99aa">Dica: no celular, adicione o DENTALCHECK à tela inicial para abrir como aplicativo. Você tem 7 dias de garantia incondicional.</p>
    </td></tr>
    <tr><td style="padding:16px 28px;background:#f3f8fb;font-size:12px;color:#8a99aa">Você recebeu este e-mail porque assinou o DENTALCHECK com ${esc(email)}.</td></tr>
  </table></td></tr></table></body></html>`;
  const texto = `Compra confirmada — Plano ${planoNome}\n\nSua assinatura do DENTALCHECK está ativa. Para entrar:\n` +
    passos.map(([t, d], i) => `${i + 1}. ${t}: ${d.replace(/<[^>]+>/g, "")}`).join("\n") + `\n\nCriar minha conta: ${link}\n`;
  return enviar(email, "Sua assinatura DENTALCHECK está ativa — crie sua conta", html, texto);
}
