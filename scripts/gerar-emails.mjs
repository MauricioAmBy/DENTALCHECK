/* Gera os e-mails a partir do layout único (server/email-layout.mjs).
   npm run emails           → atualiza supabase/templates/*.html (para colar no painel do Supabase)
   npm run emails -- --previa → também grava previa-emails/ com todos os e-mails preenchidos com dados
                               de exemplo e um índice para abrir no navegador (pasta fora do Git). */
import { writeFileSync, mkdirSync } from "node:fs";
import { MODELOS_SUPABASE, modeloBoasVindas } from "../server/email.mjs";

mkdirSync("supabase/templates", { recursive: true });
for (const m of MODELOS_SUPABASE) writeFileSync(`supabase/templates/${m.arquivo}`, m.html());
console.log("Modelos do Supabase atualizados em supabase/templates/:");
for (const m of MODELOS_SUPABASE) console.log(`  ${m.arquivo.padEnd(22)} → painel "${m.painel}" · assunto: ${m.assunto}`);

if (process.argv.includes("--previa")) {
  const exemplo = { "{{ .Email }}": "dra.ana@clinica.com", "{{ .ConfirmationURL }}": "https://dentalcheck.vercel.app/#exemplo" };
  const logoLocal = html => html.replace(/https?:\/\/[^"]+\/icons\/email-logo\.png/g, "../public/icons/email-logo.png");   // o logo só existe no site depois do deploy
  const preencher = html => logoLocal(Object.entries(exemplo).reduce((h, [k, v]) => h.split(k).join(v), html));
  const lista = [
    ["boas-vindas.html", "Boas-vindas após a compra (servidor)", modeloBoasVindas({ email: "dra.ana@clinica.com", nome: "Ana Souza", plano: "profissional" })],
    ...MODELOS_SUPABASE.map(m => [m.arquivo, `${m.painel} (Supabase)`, { assunto: m.assunto, html: preencher(m.html()) }])
  ];
  mkdirSync("previa-emails", { recursive: true });
  for (const [arq, , e] of lista) writeFileSync(`previa-emails/${arq}`, preencher(e.html));
  writeFileSync("previa-emails/index.html", `<!doctype html><meta charset="utf-8"><title>E-mails DENTALCHECK</title>
<body style="font-family:system-ui;background:#f4f4f0;margin:0;padding:24px">${lista.map(([arq, nome, e]) =>
    `<h2 style="font-size:15px;margin:24px 0 4px">${nome}</h2><p style="margin:0 0 10px;color:#64686d;font-size:14px">Assunto: ${e.assunto}</p>
<iframe src="${arq}" style="width:640px;max-width:100%;height:760px;border:1px solid #dcdfe0;border-radius:12px;background:#fff"></iframe>`).join("")}</body>`);
  console.log("Prévia gravada em previa-emails/index.html");
}
