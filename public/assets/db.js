/* DENTALCHECK — banco local (IndexedDB). Os dados do paciente nunca saem do aparelho. */
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
    salvarConfig: c => tx("config", "readwrite", s => s.put(c, "clinica"))
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
