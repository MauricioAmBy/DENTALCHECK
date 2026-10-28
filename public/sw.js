/* DENTALCHECK — service worker: deixa o app funcionando offline depois da ativação */
const VERSAO = "dc-v7";
const BASE = [
  "./", "./index.html", "./apresentacao.html", "./simulador.html",
  "./assets/app.css", "./assets/db.js", "./assets/licenca.js", "./assets/dentes.js", "./assets/ia.js",
  "./manifest.webmanifest", "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png"
];
/* bibliotecas e fontes externas: guardadas no primeiro uso */
const EXTERNOS = ["fonts.googleapis.com", "fonts.gstatic.com", "cdn.jsdelivr.net"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (EXTERNOS.includes(url.hostname)) {
    e.respondWith(caches.open("dc-externos").then(async c => {
      const salvo = await c.match(req);
      if (salvo) return salvo;
      const r = await fetch(req);
      if (r.ok || r.type === "opaque") c.put(req, r.clone());
      return r;
    }));
    return;
  }
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  /* rede primeiro (pega atualizações), cache se estiver offline */
  e.respondWith(
    fetch(req).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html")))
  );
});
