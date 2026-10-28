/* DENTALCHECK — acesso ao app.
   No computador (localhost) entra direto. No site publicado pede a SENHA DE ACESSO uma única vez;
   ela fica guardada no aparelho e vai junto em toda chamada de IA (/api/...), para ninguém de fora
   gastar a chave da IA. Mais tarde, com a venda, isso vira a ativação pela compra. */
(function () {
  const CHAVE = "dc_licenca", CHAVE_APARELHO = "dc_aparelho";
  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === "file:";

  function aparelho() {
    let id = localStorage.getItem(CHAVE_APARELHO);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
      localStorage.setItem(CHAVE_APARELHO, id);
    }
    return id;
  }

  function atual() {
    let lic = null;
    try { lic = JSON.parse(localStorage.getItem(CHAVE) || "null"); } catch (e) {}
    /* versão local: entra direto, sem senha */
    return lic || (LOCAL ? ativarTeste() : null);
  }

  async function ativar(senha) {
    const r = await fetch("/api/acesso", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ senha: senha.trim() }) });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok || !dados.ok) throw new Error(dados.erro || "Não foi possível entrar. Confira a senha e a internet.");
    const lic = { nome: "", token: senha.trim(), aparelho: aparelho(), em: Date.now() };
    localStorage.setItem(CHAVE, JSON.stringify(lic));
    return lic;
  }

  /* Modo de teste: só existe rodando no computador (localhost) */
  function ativarTeste() {
    if (!LOCAL) return null;
    const lic = { nome: "", token: "local", aparelho: aparelho(), em: Date.now() };
    localStorage.setItem(CHAVE, JSON.stringify(lic));
    return lic;
  }

  function sair() { localStorage.removeItem(CHAVE); }

  /* Páginas internas chamam isso no topo: sem acesso, volta para a tela de entrada */
  function exigir() {
    if (!atual()) location.replace("./index.html");
  }

  /* toda chamada /api/ leva a senha; se o servidor recusar (senha trocada), pede a senha de novo */
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (url, opcoes = {}) => {
    const ehApi = typeof url === "string" && url.startsWith("/api/") && url !== "/api/acesso";
    if (!ehApi) return fetchOriginal(url, opcoes);
    const lic = atual();
    const headers = new Headers(opcoes.headers || {});
    if (lic && lic.token) headers.set("x-acesso", lic.token);
    const r = await fetchOriginal(url, { ...opcoes, headers });
    if (r.status === 401 && !LOCAL) { sair(); location.replace("./index.html"); }
    return r;
  };

  window.Licenca = { atual, ativar, ativarTeste, sair, exigir, aparelho, LOCAL };
})();
