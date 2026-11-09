/* DENTALCHECK — e-mails automáticos.
   Catálogo completo (quem envia, quando e onde está o modelo): README → "E-mails".

   - Enviados pelo servidor (Resend, API REST, sem dependências): boas-vindas após a compra.
     Configuração: RESEND_API_KEY e EMAIL_REMETENTE (ex.: "DENTALCHECK <ola@dentalcheck.com.br>");
     opcional EMAIL_RESPOSTA. Sem as variáveis, nada é enviado e o restante do app funciona normalmente.
   - Enviados pelo Supabase (confirmar conta, nova senha): modelos em MODELOS_SUPABASE, gerados como
     HTML em supabase/templates/ por scripts/gerar-emails.mjs e colados no painel do Supabase.
   Todos usam o mesmo layout (server/email-layout.mjs). */
import { layoutEmail, botao, passos, paragrafo, nota, destaque, linkReserva, appUrl, esc } from "./email-layout.mjs";

const NOMES = { essencial: "Essencial", profissional: "Profissional", clinica: "Clínica" };

async function enviar(para, assunto, html, texto, tipo) {
  const chave = process.env.RESEND_API_KEY, de = process.env.EMAIL_REMETENTE;
  if (!chave || !de) { console.log(`[email] não configurado — ${tipo} não enviado`); return false; }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${chave}`, "content-type": "application/json" },
    body: JSON.stringify({ from: de, to: [para], subject: assunto, html, text: texto, reply_to: process.env.EMAIL_RESPOSTA || undefined, tags: [{ name: "tipo", value: tipo }] })
  });
  if (!r.ok) { console.error(`[email] ${tipo} falhou:`, r.status, (await r.text()).slice(0, 200)); return false; }
  console.log(`[email] ${tipo} enviado`);
  return true;
}

/* ---------- boas-vindas depois da compra ----------
   Explica que a conta é criada com o MESMO e-mail da compra (é ele que libera o plano). */
export function modeloBoasVindas({ email, nome, plano }) {
  const primeiro = String(nome || "").trim().split(/\s+/)[0] || "";
  const link = `${appUrl()}/?compra=1&email=${encodeURIComponent(email)}`;
  const planoNome = NOMES[plano] || "DENTALCHECK";
  const lista = [
    ["Abra o DENTALCHECK", `Toque no botão abaixo ou acesse <b>${esc(appUrl().replace(/^https:\/\//, ""))}</b>.`],
    ["Crie a sua conta com este e-mail", `Use exatamente <b>${esc(email)}</b>, o mesmo da compra. É ele que libera o seu plano.`],
    ["Confirme o e-mail", "Você vai receber um link de confirmação. Clique nele e depois entre com o seu e-mail e senha."],
    ["Faça a primeira simulação", "Toque em “Novo procedimento”, envie a foto do sorriso e escolha o planejamento."]
  ];
  const assunto = "Sua assinatura DENTALCHECK está ativa: crie sua conta";
  const html = layoutEmail({
    resumo: "Falta só um passo: criar a sua conta com o e-mail da compra.",
    etiqueta: `Compra confirmada · Plano ${esc(planoNome)}`,
    titulo: primeiro ? `Bem-vindo(a), ${esc(primeiro)}!` : "Bem-vindo(a) ao DENTALCHECK!",
    corpo: paragrafo("Sua assinatura já está ativa. Falta só criar a sua conta no app, e isso leva menos de um minuto.")
      + passos(lista) + botao("Criar minha conta", link)
      + nota("Dica: no celular, adicione o DENTALCHECK à tela inicial para abrir como aplicativo. Você tem 7 dias de garantia incondicional."),
    rodape: `Você recebeu este e-mail porque assinou o DENTALCHECK com ${esc(email)}.`
  });
  const texto = `Compra confirmada · Plano ${planoNome}\n\nSua assinatura do DENTALCHECK está ativa. Para entrar:\n` +
    lista.map(([t, d], i) => `${i + 1}. ${t}: ${d.replace(/<[^>]+>/g, "")}`).join("\n") + `\n\nCriar minha conta: ${link}\n`;
  return { assunto, html, texto };
}
export async function emailBoasVindas(dados) {
  const { assunto, html, texto } = modeloBoasVindas(dados);
  return enviar(dados.email, assunto, html, texto, "boas-vindas");
}

/* ---------- modelos do Supabase ----------
   Ficam com as variáveis do Supabase ({{ .Email }}, {{ .ConfirmationURL }}), que ele troca na hora do envio.
   arquivo: nome em supabase/templates/ · painel: onde colar (Authentication → Emails → Templates). */
export const MODELOS_SUPABASE = [
  {
    arquivo: "confirmar-conta.html", painel: "Confirm signup",
    assunto: "Confirme seu e-mail para ativar o DENTALCHECK",
    html: () => layoutEmail({
      resumo: "Toque no botão para ativar a sua conta e começar a simular sorrisos.",
      etiqueta: "Último passo", titulo: "Confirme o seu e-mail",
      corpo: paragrafo(`Recebemos o cadastro de ${destaque("{{ .Email }}")} no DENTALCHECK. Toque no botão abaixo para ativar a sua conta e começar a simular sorrisos.`)
        + botao("Confirmar meu e-mail", "{{ .ConfirmationURL }}")
        + paragrafo("Depois de confirmar, volte ao app e entre com o seu e-mail e senha.")
        + linkReserva("{{ .ConfirmationURL }}"),
      rodape: "Não criou uma conta no DENTALCHECK? Ignore este e-mail. Nada será ativado sem a confirmação."
    })
  },
  {
    arquivo: "redefinir-senha.html", painel: "Reset password",
    assunto: "Crie uma nova senha do DENTALCHECK",
    html: () => layoutEmail({
      resumo: "Toque no botão para escolher uma senha nova.",
      etiqueta: "Acesso à conta", titulo: "Crie uma nova senha",
      corpo: paragrafo(`Recebemos um pedido para redefinir a senha de ${destaque("{{ .Email }}")}. Toque no botão abaixo e escolha uma senha nova.`)
        + botao("Criar nova senha", "{{ .ConfirmationURL }}")
        + linkReserva("{{ .ConfirmationURL }}"),
      rodape: "Não pediu a troca? Ignore este e-mail. A sua senha atual continua valendo."
    })
  }
];
