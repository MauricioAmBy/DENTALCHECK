/* DENTALCHECK — banco local (IndexedDB). Os dados do paciente ficam no aparelho; o backup (exportar/importar)
   gera um arquivo que o próprio dentista guarda. */
(function () {
  const NOME = "dentalcheck", VERSAO = 1;
  let conexao;

  function abrir() {
    if (conexao) return conexao;
    conexao = new Promise((ok, erro) => {
      const req = indexedDB.open(NOME, VERSAO);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("pacientes")) db.createObjectStore("pacientes", { keyPath: "id" });
        if (!db.objectStoreNames.contains("config")) db.createObjectStore("config");
      };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => erro(req.error);
    });
    return conexao;
  }

  async function tx(store, modo, fn) {
    const db = await abrir();
    return new Promise((ok, erro) => {
      const t = db.transaction(store, modo);
      const r = fn(t.objectStore(store));
      t.oncomplete = () => ok(r && "result" in r ? r.result : undefined);
      t.onerror = () => erro(t.error);
    });
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function novoPaciente(nome) {
    return {
      id: uid(), nome: nome || "", data: new Date().toISOString().slice(0, 10), telefone: "",
      desejo: "", avaliacao: "",
      fotos: {},            // { angulo: dataURL }
      antesDepois: [],      // [{ id, titulo, antes, depois }]
      exames: [],           // [{ id, titulo, img, nota }]
      dentes: {},           // { "11": { status, nota } }
      propostas: [],        // [{ id, titulo, descricao, valor, sessoes, destaque }]
      atualizado: Date.now()
    };
  }

  const CONFIG_PADRAO = {
    clinica: "", slogan: "", logo: "", cor: "#0b9e96", fonte: "Plus Jakarta Sans",
    profissionais: [], whatsapp: "", instagram: "", endereco: ""
  };

  window.DB = {
    uid, novoPaciente,
    listar: () => tx("pacientes", "readonly", s => s.getAll()).then(l => (l || []).sort((a, b) => b.atualizado - a.atualizado)),
    obter: id => tx("pacientes", "readonly", s => s.get(id)),
    salvar: p => { p.atualizado = Date.now(); return tx("pacientes", "readwrite", s => s.put(p)).then(() => p); },
    excluir: id => tx("pacientes", "readwrite", s => s.delete(id)),
    config: () => tx("config", "readonly", s => s.get("clinica")).then(c => Object.assign({}, CONFIG_PADRAO, c || {})),
    salvarConfig: c => tx("config", "readwrite", s => s.put(c, "clinica")),

    /* backup: um arquivo .json com todos os pacientes (fotos e simulações incluídas) e as identidades visuais.
       Serve para guardar uma cópia fora do navegador e para levar os pacientes para outro aparelho. */
    exportar: async () => {
      const [pacientes, config] = await Promise.all([
        tx("pacientes", "readonly", s => s.getAll()),
        tx("config", "readonly", s => s.get("clinica"))
      ]);
      return { app: "DENTALCHECK", formato: 1, criado: new Date().toISOString(), pacientes: pacientes || [], config: config || null };
    },
    /* restaura sem apagar nada: paciente que não existe entra; paciente que já existe só é trocado se a
       cópia do backup for mais recente. As identidades visuais do backup são somadas às deste aparelho. */
    importar: async dados => {
      if (!dados || dados.app !== "DENTALCHECK" || !Array.isArray(dados.pacientes)) throw new Error("Este arquivo não é um backup do DENTALCHECK.");
      const atuais = new Map(((await tx("pacientes", "readonly", s => s.getAll())) || []).map(p => [p.id, p]));
      let novos = 0, atualizados = 0;
      for (const p of dados.pacientes) {
        if (!p || !p.id) continue;
        const atual = atuais.get(p.id);
        if (atual && (atual.atualizado || 0) >= (p.atualizado || 0)) continue;
        await tx("pacientes", "readwrite", s => s.put(p));
        atual ? atualizados++ : novos++;
      }
      if (dados.config) {
        const local = (await tx("config", "readonly", s => s.get("clinica"))) || null;
        if (!local) await tx("config", "readwrite", s => s.put(dados.config, "clinica"));
        else if (Array.isArray(dados.config.identidades)) {
          const ids = new Set((local.identidades || []).map(i => i.id));
          const extras = dados.config.identidades.filter(i => !ids.has(i.id));
          if (extras.length) { local.identidades = [...(local.identidades || []), ...extras]; await tx("config", "readwrite", s => s.put(local, "clinica")); }
        }
      }
      return { novos, atualizados, total: dados.pacientes.length };
    }
  };

  /* Reduz a foto antes de guardar: mantém qualidade de apresentação sem lotar o aparelho */
  window.lerImagem = function (arquivo, max = 1800, qualidade = 0.86) {
    return new Promise((ok, erro) => {
      const url = URL.createObjectURL(arquivo);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL(arquivo.type === "image/png" ? "image/png" : "image/jpeg", qualidade));
      };
      img.onerror = erro;
      img.src = url;
    });
  };

  window.toast = function (msg) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("on");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), 2600);
  };

  window.esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
})();
