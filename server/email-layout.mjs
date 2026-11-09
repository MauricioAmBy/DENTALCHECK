/* DENTALCHECK — layout único dos e-mails (identidade: preto, off-white e verde-limão).
   Todos os e-mails saem daqui: os enviados pelo servidor (server/email.mjs) e os modelos que o
   Supabase envia (confirmar conta, nova senha), gerados por scripts/gerar-emails.mjs.

   Regras de e-mail: tabelas e estilos inline (Gmail/Outlook ignoram <style> e flexbox), logo em PNG
   (o Gmail não mostra SVG) e fontes de sistema (fontes da web não carregam na maioria dos leitores). */

export const COR = {
  preto: "#151719", fundo: "#f4f4f0", cinza: "#dcdfe0", lima: "#c3e86b",
  texto: "#151719", suave: "#64686d", fraco: "#8b8f93", branco: "#ffffff"
};
const FONTE = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export const appUrl = () => (process.env.APP_URL || "https://www.dentalcheck.com.br").replace(/\/$/, "");
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* botão "pílula" preto; funciona no Outlook porque o fundo fica na célula da tabela */
export function botao(texto, link) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="border-radius:99px;background:${COR.preto}">
    <a href="${link}" style="display:inline-block;padding:15px 30px;font-family:${FONTE};color:${COR.branco};font-weight:bold;font-size:15px;text-decoration:none;border-radius:99px">${texto}</a></td></tr></table>`;
}

/* lista numerada com bolinhas verde-limão (passo a passo) */
export function passos(lista) {
  return lista.map(([titulo, desc], i) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 14px"><tr>
    <td valign="top" style="width:38px"><div style="width:26px;height:26px;border-radius:13px;background:${COR.lima};color:${COR.preto};font-family:${FONTE};font-weight:bold;font-size:13px;line-height:26px;text-align:center">${i + 1}</div></td>
    <td style="font-family:${FONTE};font-size:15px;line-height:1.5"><b style="color:${COR.texto}">${titulo}</b><br><span style="color:${COR.suave}">${desc}</span></td></tr></table>`).join("");
}

export const paragrafo = html => `<p style="margin:0 0 16px;font-family:${FONTE};font-size:15px;line-height:1.6;color:${COR.suave}">${html}</p>`;
export const nota = html => `<p style="margin:18px 0 0;font-family:${FONTE};font-size:13px;line-height:1.6;color:${COR.fraco}">${html}</p>`;
export const destaque = texto => `<b style="color:${COR.texto}">${texto}</b>`;

/* link reserva para quando o botão não abre (alguns leitores bloqueiam) */
export const linkReserva = url => nota(`Se o botão não funcionar, copie e cole este endereço no navegador:<br><a href="${url}" style="color:${COR.texto};word-break:break-all">${url}</a>`);

/* esqueleto do e-mail.
   resumo: texto que aparece ao lado do assunto na caixa de entrada (não aparece no corpo).
   etiqueta: linha pequena acima do título, com a bolinha verde-limão da marca. */
export function layoutEmail({ resumo = "", etiqueta = "", titulo, corpo, rodape, base = appUrl() }) {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:${COR.fundo};-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${COR.fundo}">${esc(resumo)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR.fundo};padding:28px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COR.branco};border-radius:20px;overflow:hidden">
      <tr><td style="background:${COR.preto};padding:22px 30px">
        <a href="${base}" style="text-decoration:none"><img src="${base}/icons/email-logo.png" width="200" height="32" alt="DENTALCHECK" style="display:block;border:0;color:${COR.branco};font-family:${FONTE};font-size:20px;font-weight:bold;letter-spacing:2px"></a>
      </td></tr>
      <tr><td style="height:4px;background:${COR.lima};line-height:4px;font-size:0">&nbsp;</td></tr>
      <tr><td style="padding:32px 30px 30px">
        ${etiqueta ? `<p style="margin:0 0 10px;font-family:${FONTE};font-size:12px;font-weight:bold;letter-spacing:1.5px;color:${COR.texto};text-transform:uppercase"><span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${COR.lima};margin-right:8px;vertical-align:1px"></span>${etiqueta}</p>` : ""}
        <h1 style="margin:0 0 16px;font-family:${FONTE};font-size:25px;line-height:1.25;font-weight:800;letter-spacing:-.3px;color:${COR.texto}">${titulo}</h1>
        ${corpo}
      </td></tr>
      <tr><td style="padding:18px 30px;background:${COR.fundo};border-top:1px solid ${COR.cinza};font-family:${FONTE};font-size:12px;line-height:1.6;color:${COR.fraco}">
        ${rodape ? rodape + "<br>" : ""}DENTALCHECK · Simulação de sorriso com IA para dentistas · <a href="${base}" style="color:${COR.fraco}">${base.replace(/^https?:\/\//, "")}</a>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;
}
