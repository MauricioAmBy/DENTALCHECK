/* DENTALCHECK — acesso ao app.
   - Com contas ativas no servidor (Supabase): login por e-mail e senha; a sessão fica no aparelho e é
     renovada sozinha. Toda chamada /api/ leva o token e o identificador do aparelho.
   - Sem contas (fase de testes): senha de acesso única (ACESSO_SENHA).
   - No computador (localhost) sem servidor de contas: entra direto. */
(function () {
  const CHAVE = "dc_licenca", CHAVE_APARELHO = "dc_aparelho", CHAVE_PUBLICO = "dc_publico";
  const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === "file:";
  const fetchOriginal = window.fetch.bind(window);

  function aparelho() {
    let id = localStorage.getItem(CHAVE_APARELHO);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
      localStorage.setItem(CHAVE_APARELHO, id);
    }
    return id;
  }
  /* nome amigável do aparelho para a lista "aparelhos conectados" */
  function descricaoAparelho() {
    const ua = navigator.userAgent;
    const so = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "Aparelho";
    const nav = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "navegador";
    return `${so} - ${nav}`;                          // só ASCII: cabeçalhos HTTP não aceitam acentos nem "·"
  }

  const ler = c => { try { return JSON.parse(localStorage.getItem(c) || "null"); } catch (e) { return null; } };
  const gravar = (c, v) => localStorage.setItem(c, JSON.stringify(v));

  function atual() {
    const lic = ler(CHAVE);
    if (lic) return lic;
    /* computador local sem servidor de contas: entra direto */
    const pub = ler(CHAVE_PUBLICO);
    return LOCAL && !(pub && pub.contas) ? ativarTeste() : null;
  }

  /* configuração pública do servidor: se há contas e qual o endereço do login */
  async function publico() {
    try {
      const r = await fetchOriginal("/api/publico", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const d = await r.json();
      if (d.ok) { gravar(CHAVE_PUBLICO, d); return d; }
    } catch (e) {}
    return ler(CHAVE_PUBLICO) || { contas: false };
  }

  /* ---------- login por e-mail (Supabase Auth, pela API REST) ---------- */
  async function auth(caminho, corpo, token, metodo = "POST") {
    const pub = ler(CHAVE_PUBLICO) || await publico();
    if (!pub.supabase) throw new Error("Login indisponível no momento. Tente de novo em instantes.");
    const r = await fetchOriginal(`${pub.supabase.url}/auth/v1/${caminho}`, {
      method: metodo,
      headers: { "content-type": "application/json", apikey: pub.supabase.anon, ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(corpo)
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(traduzir(d.error_description || d.msg || d.message || d.error || ""));
    return d;
  }
  function traduzir(m) {
    if (/invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
    if (/email not confirmed/i.test(m)) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
    if (/already registered|already exists/i.test(m)) return "Já existe uma conta com este e-mail. Use “Entrar” ou “Esqueci minha senha”.";
    if (/password should be|weak password/i.test(m)) return "A senha precisa ter pelo menos 8 caracteres.";
    if (/rate limit|too many/i.test(m)) return "Muitas tentativas. Aguarde um minuto e tente de novo.";
    return m || "Não foi possível concluir. Tente de novo.";
  }
  function salvarSessao(d) {
    const lic = { tipo: "conta", email: d.user?.email || "", token: d.access_token, refresh: d.refresh_token, expira: Date.now() + (d.expires_in || 3600) * 1000, aparelho: aparelho() };
    gravar(CHAVE, lic);
    return lic;
  }
  async function entrar(email, senha) {
    return salvarSessao(await auth("token?grant_type=password", { email: email.trim().toLowerCase(), password: senha }));
  }
  async function criarConta(email, senha) {
    const d = await auth("signup", { email: email.trim().toLowerCase(), password: senha });
    if (d.access_token) return { lic: salvarSessao(d) };
    return { confirmar: true };                          // Supabase pediu confirmação por e-mail
  }
  async function recuperarSenha(email) {
    await auth("recover?redirect_to=" + encodeURIComponent(location.origin + "/"), { email: email.trim().toLowerCase() });
  }
  async function definirNovaSenha(tokenRecuperacao, senha) {
    await auth("user", { password: senha }, tokenRecuperacao, "PUT");
  }
  /* renova o token antes de vencer (a sessão dura enquanto o aparelho for usado) */
  async function sessaoValida() {
    const lic = atual();
    if (!lic || lic.tipo !== "conta") return lic;
    if (lic.expira - Date.now() > 60e3) return lic;
    try { return salvarSessao(await auth("token?grant_type=refresh_token", { refresh_token: lic.refresh })); }
    catch (e) { sair(); return null; }
  }

  /* ---------- senha única (fase de testes) ---------- */
  async function ativar(senha) {
    const r = await fetchOriginal("/api/acesso", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ senha: senha.trim() }) });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok || !dados.ok) throw new Error(dados.erro || "Não foi possível entrar. Confira a senha e a internet.");
    const lic = { tipo: "senha", token: senha.trim(), aparelho: aparelho(), em: Date.now() };
    gravar(CHAVE, lic);
    return lic;
  }
  function ativarTeste() {
    if (!LOCAL) return null;
    const lic = { tipo: "local", token: "local", aparelho: aparelho(), em: Date.now() };
    gravar(CHAVE, lic);
    return lic;
  }

  function sair() { localStorage.removeItem(CHAVE); }

  /* Páginas internas chamam isso no topo: sem acesso, volta para a tela de entrada */
  function exigir() {
    if (!atual()) location.replace("/");
  }

  /* toda chamada /api/ leva o login e o aparelho; sessão inválida → volta para a entrada */
  const LIVRES = ["/api/acesso", "/api/publico"];
  window.fetch = async (url, opcoes = {}) => {
    const ehApi = typeof url === "string" && url.startsWith("/api/") && !LIVRES.includes(url);
    if (!ehApi) return fetchOriginal(url, opcoes);
    const lic = await sessaoValida();
    const headers = new Headers(opcoes.headers || {});
    headers.set("x-aparelho", aparelho());
    headers.set("x-aparelho-nome", descricaoAparelho());
    if (lic && lic.tipo === "conta") headers.set("authorization", `Bearer ${lic.token}`);
    else if (lic && lic.token) headers.set("x-acesso", lic.token);
    const r = await fetchOriginal(url, { ...opcoes, headers });
    if (r.status === 401) {
      const d = await r.clone().json().catch(() => ({}));
      if (d.semAcesso && !(LOCAL && lic && lic.tipo === "local")) { sair(); location.replace("/"); }
    }
    return r;
  };

  window.Licenca = { atual, publico, entrar, criarConta, recuperarSenha, definirNovaSenha, ativar, ativarTeste, sair, exigir, aparelho, LOCAL };
})();
