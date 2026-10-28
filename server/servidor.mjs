/* DENTALCHECK — servidor local (Node puro, sem dependências).
   Entrega as páginas de /public e repassa as chamadas de IA (/api/...) para server/ia.mjs,
   para a chave da API ficar no computador e nunca no navegador. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLICO = path.join(RAIZ, "public");

/* lê o .env da raiz do projeto */
try {
  for (const linha of fs.readFileSync(path.join(RAIZ, ".env"), "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch { /* sem .env: usa só as variáveis do sistema */ }

/* tudo o que aparece na janela também vai para server/servidor.log (ajuda a diagnosticar) */
const LOG = path.join(RAIZ, "server", "servidor.log");
for (const tipo of ["log", "error"]) {
  const original = console[tipo].bind(console);
  console[tipo] = (...args) => {
    original(...args);
    try { fs.appendFileSync(LOG, `[${new Date().toLocaleString("pt-BR")}] ${args.map(a => a instanceof Error ? a.stack : String(a)).join(" ")}\n`); } catch {}
  };
}

/* importado depois do .env para os modelos e limites já enxergarem as variáveis */
const { atender } = await import("./ia.mjs");

const PORTA = Number(process.env.PORTA || 5173);
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon"
};

function responder(res, status, corpo) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(corpo));
}

function arquivo(req, res) {
  let rota = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (rota.endsWith("/")) rota += "index.html";
  /* aceita também endereços sem ".html" (ex.: /simulador) */
  if (!path.extname(rota) && fs.existsSync(path.join(PUBLICO, rota + ".html"))) rota += ".html";
  const alvo = path.join(PUBLICO, rota);
  if (!alvo.startsWith(PUBLICO)) { res.writeHead(403); return res.end(); }
  fs.readFile(alvo, (erro, dados) => {
    if (erro) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); return res.end("Não encontrado"); }
    res.writeHead(200, { "content-type": TIPOS[path.extname(alvo).toLowerCase()] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(dados);
  });
}

async function api(req, res, nome) {
  let bruto = "";
  for await (const parte of req) { bruto += parte; if (bruto.length > 6_000_000) return responder(res, 413, { ok: false, erro: "Foto grande demais." }); }
  let corpo;
  try { corpo = bruto ? JSON.parse(bruto) : {}; } catch { return responder(res, 400, { ok: false, erro: "Requisição inválida." }); }
  const r = await atender(nome, corpo, req.headers["x-acesso"]);
  responder(res, r.status, r.corpo);
}

http.createServer((req, res) => {
  const rota = new URL(req.url, "http://x").pathname;
  if (rota.startsWith("/api/")) {
    if (req.method !== "POST") return responder(res, 405, { ok: false });
    return api(req, res, rota.slice(5)).catch(e => { console.error(e); responder(res, 500, { ok: false, erro: "Erro interno." }); });
  }
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  arquivo(req, res);
}).on("error", e => {
  if (e.code === "EADDRINUSE") console.log(`O DENTALCHECK (ou outro programa) já está usando a porta ${PORTA}. Abra http://localhost:${PORTA} no navegador.`);
  else console.error(e);
  process.exit(1);
}).listen(PORTA, () => {
  console.log(`DENTALCHECK rodando em http://localhost:${PORTA}`);
  console.log(process.env.GEMINI_API_KEY ? "IA: chave do Gemini carregada ✓" : "IA: sem GEMINI_API_KEY no .env — o simulador usará o modo ilustrativo");
});
