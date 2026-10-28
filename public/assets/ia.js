/* DENTALCHECK — ajudantes de IA e de imagem usados pela apresentação e pelo simulador.
   Caixas sempre em fração da imagem: { x, y, w, h } entre 0 e 1. */
(function () {
  const carregar = src => new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = src; });

  /* versão reduzida em JPEG base64 (sem o prefixo data:) para enviar à IA */
  function reduzir(img, max) {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85).split(",")[1];
  }

  async function post(rota, corpo) {
    const r = await fetch(rota, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) throw new Error(d.erro || "A IA não respondeu.");
    return d;
  }

  /* posição da boca */
  async function localizar(src) {
    return (await post("/api/localizar", { imagem: reduzir(await carregar(src), 768) })).caixa;
  }

  /* { rotacao, angulo, boca, rosto } — caixas já convertidas para a imagem depois de girada */
  async function analisarFoto(src) {
    const d = await post("/api/analisar-foto", { imagem: reduzir(await carregar(src), 896) });
    return { rotacao: d.rotacao, angulo: d.angulo, boca: girarCaixa(d.boca, d.rotacao), rosto: girarCaixa(d.rosto, d.rotacao) };
  }

  /* gira a imagem no sentido horário (0, 90, 180, 270) */
  async function girar(src, graus) {
    if (!graus) return src;
    const img = await carregar(src), c = document.createElement("canvas");
    const deitada = graus % 180 !== 0;
    c.width = deitada ? img.height : img.width; c.height = deitada ? img.width : img.height;
    const x = c.getContext("2d");
    x.translate(c.width / 2, c.height / 2); x.rotate(graus * Math.PI / 180); x.drawImage(img, -img.width / 2, -img.height / 2);
    return c.toDataURL("image/jpeg", 0.92);
  }

  /* posição de uma caixa depois de girar a imagem no sentido horário */
  function girarCaixa(c, graus) {
    if (!c) return null;
    const { x, y, w, h } = c;
    switch (graus) {
      case 90: return { x: 1 - y - h, y: x, w: h, h: w };
      case 180: return { x: 1 - x - w, y: 1 - y - h, w, h };
      case 270: return { x: y, y: 1 - x - w, w: h, h: w };
      default: return { ...c };
    }
  }

  /* recorta a imagem na proporção exata pedida, centrada no foco (com folga);
     sem foco, faz um "cover" central. Evita faixas pretas e distorção no PDF. */
  const cacheEnq = new Map();
  async function enquadrar(src, aspecto, foco, opc = {}) {
    const chave = [src.length, src.slice(-40), aspecto.toFixed(3), JSON.stringify(foco), JSON.stringify(opc)].join("|");
    if (cacheEnq.has(chave)) return cacheEnq.get(chave);
    const img = await carregar(src), W = img.width, H = img.height;
    const margem = opc.margem || 1.35, maxLargura = opc.maxLargura || 1600;
    let w, h, cx, cy;
    if (foco) {
      cx = (foco.x + foco.w / 2) * W; cy = (foco.y + foco.h / 2) * H;
      w = Math.max(foco.w * W * margem, foco.h * H * margem * aspecto); h = w / aspecto;
    } else {
      if (W / H > aspecto) { h = H; w = H * aspecto; } else { w = W; h = W / aspecto; }
      cx = W / 2; cy = H * (opc.alinharY ?? 0.5);
    }
    const k = Math.min(1, W / w, H / h); w *= k; h *= k;          // não pode passar do tamanho da foto
    const x0 = Math.max(0, Math.min(W - w, cx - w / 2)), y0 = Math.max(0, Math.min(H - h, cy - h / 2));
    const s = Math.min(1, maxLargura / w), c = document.createElement("canvas");
    c.width = Math.round(w * s); c.height = Math.round(h * s);
    c.getContext("2d").drawImage(img, x0, y0, w, h, 0, 0, c.width, c.height);
    const res = c.toDataURL("image/jpeg", 0.9);
    cacheEnq.set(chave, res);
    return res;
  }

  /* recorta o mesmo trecho de duas imagens alinhadas (antes e depois da simulação) */
  async function recortarPar(antes, depois, foco, aspecto, margem = 1.5) {
    return { antes: await enquadrar(antes, aspecto, foco, { margem }), depois: await enquadrar(depois, aspecto, foco, { margem }) };
  }

  window.IA = { carregar, localizar, analisarFoto, girar, girarCaixa, enquadrar, recortarPar };
})();
