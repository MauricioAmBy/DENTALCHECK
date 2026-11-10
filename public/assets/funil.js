/* DENTALCHECK — funil do paciente (B3). Tudo calculado no aparelho, sem servidor e sem custo.
   Fica em cada paciente: funil = { estagio, historico: [{ estagio, data }], proximoContato, valorFechado, motivo }.
   Estágios: avaliado → apresentado → aceitou → fechou, mais perdido. Paciente sem funil está "avaliado". */
(function () {
  const ESTAGIOS = [
    { id: "avaliado", nome: "Avaliado", cor: "#8a99aa" },
    { id: "apresentado", nome: "Apresentado", cor: "#1f6fd1" },
    { id: "aceitou", nome: "Aceitou", cor: "#b8862b" },
    { id: "fechou", nome: "Fechou", cor: "#2e8b57" },
    { id: "perdido", nome: "Perdido", cor: "#c2417a" }
  ];
  const ABERTOS = ["apresentado", "aceitou"];             // ainda esperando resposta do paciente
  const DIAS_PADRAO = 5;
  const hojeISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

  const estagio = p => (p.funil && p.funil.estagio) || "avaliado";
  const info = id => ESTAGIOS.find(e => e.id === id) || ESTAGIOS[0];
  /* data (AAAA-MM-DD) em que o paciente entrou no estágio atual (ou num estágio dado) */
  function desde(p, id = estagio(p)) {
    const h = (p.funil && p.funil.historico) || [];
    for (let i = h.length - 1; i >= 0; i--) if (h[i].estagio === id) return h[i].data;
    return id === "avaliado" ? p.data : null;
  }

  /* muda o estágio; extra = { valorFechado, motivo }. Devolve true se mudou. */
  function mudar(p, novo, extra = {}) {
    const f = p.funil || (p.funil = { estagio: "avaliado", historico: [] });
    const atual = f.estagio || "avaliado";
    Object.assign(f, extra);
    if (atual === novo) return Object.keys(extra).length > 0;
    f.estagio = novo;
    f.historico = [...(f.historico || []), { estagio: novo, data: hojeISO() }];
    if (novo !== "fechou") delete f.valorFechado;
    if (novo !== "perdido") delete f.motivo;
    if (novo === "fechou" || novo === "perdido") delete f.proximoContato;
    return true;
  }
  /* gerar a apresentação ou o PDF marca como apresentado (só se ainda estava em avaliado) */
  const marcarApresentado = p => estagio(p) === "avaliado" ? mudar(p, "apresentado") : false;

  const diasEntre = (a, b) => Math.floor((Date.parse(b) - Date.parse(a)) / 864e5);
  /* precisa de retorno: proximoContato vencido, ou apresentado/aceitou sem resposta há `dias` dias */
  function retorno(p, dias = DIAS_PADRAO, hoje = hojeISO()) {
    const est = estagio(p);
    if (est === "fechou" || est === "perdido") return null;
    const prox = p.funil && p.funil.proximoContato;
    if (prox && prox <= hoje) return { motivo: prox === hoje ? "Contato marcado para hoje" : `Contato marcado para ${prox.split("-").reverse().join("/")}`, dias: diasEntre(prox, hoje) };
    if (prox) return null;                                // tem contato marcado no futuro: espera
    if (!ABERTOS.includes(est)) return null;
    const d = diasEntre(desde(p) || p.data, hoje);
    return d >= dias ? { motivo: `${info(est).nome} há ${d} dias, sem resposta`, dias: d } : null;
  }

  /* "R$ 12.000", "12000", "12.000,50" → 12000.5; texto sem número claro ("10x de R$ 1.200") → null */
  function numero(v) {
    if (typeof v === "number") return isFinite(v) ? v : null;
    const s = String(v || "").replace(/R\$\s?/i, "").trim();
    if (!/^[\d.,\s]+$/.test(s)) return null;
    const t = s.replace(/\s/g, ""), n = /,\d{1,2}$/.test(t) ? Number(t.replace(/\./g, "").replace(",", ".")) : /^\d{1,3}(\.\d{3})+$/.test(t) ? Number(t.replace(/\./g, "")) : Number(t.replace(",", "."));
    return isFinite(n) && n > 0 ? n : null;
  }
  const reais = n => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: n % 1 ? 2 : 0 });
  /* sugestão de valor fechado: a proposta recomendada (ou a única) com valor numérico */
  function valorSugerido(p) {
    const ps = (p.propostas || []).filter(x => numero(x.valor) !== null);
    const r = ps.find(x => x.destaque) || (ps.length === 1 ? ps[0] : null);
    return r ? numero(r.valor) : null;
  }

  /* resultados do mês (mes = "AAAA-MM"): fechados e valor pelo dia em que foram para "fechou";
     conversão = fechados no mês ÷ apresentados no mês (entrou em "apresentado" naquele mês) */
  function resumoMes(lista, mes) {
    let apresentados = 0, fechados = 0, valor = 0;
    for (const p of lista) {
      if (p.exemplo) continue;
      const h = (p.funil && p.funil.historico) || [];
      if (h.some(x => x.estagio === "apresentado" && x.data.startsWith(mes))) apresentados++;
      const f = desde(p, "fechou");
      if (estagio(p) === "fechou" && f && f.startsWith(mes)) { fechados++; valor += numero(p.funil.valorFechado) || 0; }
    }
    return { mes, apresentados, fechados, valor, conversao: apresentados ? Math.round(fechados / apresentados * 100) : null };
  }
  function mesAnterior(mes) { const [a, m] = mes.split("-").map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`; }
  const nomeMes = mes => new Date(mes + "-15").toLocaleDateString("pt-BR", { month: "long" });

  /* link do WhatsApp do paciente com mensagem pronta (telefone brasileiro sem DDI ganha 55) */
  function whatsapp(p, clinica) {
    let n = String(p.telefone || "").replace(/\D/g, "");
    if (!n) return null;
    if (n.length === 10 || n.length === 11) n = "55" + n;
    const nome = String(p.nome || "").trim().split(/\s+/)[0] || "";
    const est = estagio(p);
    const msg = est === "aceitou"
      ? `Olá${nome ? ", " + nome : ""}! Tudo bem? Vamos agendar o início do seu tratamento${clinica ? " aqui na " + clinica : ""}?`
      : `Olá${nome ? ", " + nome : ""}! Tudo bem? Passando para saber se ficou alguma dúvida sobre o planejamento do seu sorriso que apresentamos${clinica ? " na " + clinica : ""}.`;
    return `https://wa.me/${n}?text=${encodeURIComponent(msg)}`;
  }

  window.Funil = { ESTAGIOS, DIAS_PADRAO, hojeISO, estagio, info, desde, mudar, marcarApresentado, retorno, numero, reais, valorSugerido, resumoMes, mesAnterior, nomeMes, whatsapp };
})();
