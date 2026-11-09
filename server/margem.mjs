/* DENTALCHECK — margem: nenhuma conta pode custar mais do que paga.
   A garantia vem dos limites aplicados aqui no servidor (Parte 2 de docs/PROCESSO-NOVOS-RECURSOS.md):
   - cota de simulações do mês (conta.mjs → consumir_simulacao);
   - chamadas auxiliares por conta e por dia (localizar, analisar-foto, dentes);
   - teto de falhas por conta e por dia (falha também pode ser cobrada pelo Google);
   - freio diário do sistema todo, no banco (não mais na memória de cada instância).
   Cada chamada ao Gemini é registrada em chamadas_ia (tokens, modelo, sucesso) para medir o custo real.
   Tabelas e funções: supabase/migrations/20261109120000_margem_ia.sql. */
import { PLANOS, ErroConta, rest } from "./conta.mjs";
import { emailAvisoAdmin } from "./email.mjs";

/* ---------- parâmetros (os marcados [DECISÃO] são do Mauricio) ---------- */
export const MARGEM = {
  tetoPercentual: 0.70,                       // [DECISÃO] custo máximo ≤ 70% da receita líquida
  kiwify: { percentual: 0.09, fixo: 2.49 },   // [CONFIRMAR] taxa por cobrança (estimativa)
  custoFixoConta: 0,                          // R$/mês por conta (e-mails, armazenamento, tráfego); hoje ~0
  tetoFalhasDia: 10,                          // [DECISÃO] falhas de IA por conta por dia antes de pausar
  falhasSeguidasAviso: 3,                     // avisa o administrador
  taxaFalhaAviso: 0.20, minimoPedidosHora: 10 // taxa de falha geral na hora que gera aviso
};
const limiteGlobal = tipo => Number(tipo === "simulacao" ? process.env.LIMITE_IA_DIA || 200 : process.env.LIMITE_IA_AUX_DIA || 3000);

/* preço de venda (R$) de cada plano e período, e do pacote extra — os mesmos da Kiwify */
export const PRECOS = {
  essencial: { mensal: 97, anual: 931.20 },
  profissional: { mensal: 167, anual: 1603.20 },
  clinica: { mensal: 267, anual: 2563.20 }
};
export const PACOTE_EXTRA = { preco: 29, simulacoes: 30 };

/* Preço da IA em US$ por 1 milhão de tokens. Pode ser trocado sem mexer no código pela variável
   CUSTO_IA_JSON, ex.: {"dolar":5.6,"modelos":{"gemini-3.1-flash-image":{"entrada":0.5,"saida":3,"imagem":60}}}
   Valores da página oficial (ai.google.dev/gemini-api/docs/pricing) em 09/11/2026; os marcados ~ são estimativa. */
const PRECOS_IA_PADRAO = {
  dolar: 5.50,
  modelos: {
    "gemini-3.1-flash-image": { entrada: 0.50 /* ~ */, saida: 3.00, imagem: 60.00 },
    "gemini-2.5-flash-image": { entrada: 0.30, saida: 2.50, imagem: 30.00 },
    "gemini-3.1-flash-lite":  { entrada: 0.25, saida: 1.50 },
    "gemini-3.8-flash":       { entrada: 0.50 /* ~ */, saida: 3.00 /* ~ */ },
    "gemini-flash-latest":    { entrada: 0.50 /* ~ */, saida: 3.00 /* ~ */ }
  },
  /* modelo sem preço cadastrado: valor alto de propósito, para nunca subestimar o custo */
  desconhecido: { entrada: 1.00, saida: 5.00, imagem: 60.00 }
};
/* enquanto não há medições suficientes, a conta usa estas estimativas (R$ por pedido) */
const ESTIMATIVA = { simulacao: 0.60, auxiliar: 0.01, amostrasMinimas: 20 };

export function precosIA() {
  let extra = {};
  try { extra = JSON.parse(process.env.CUSTO_IA_JSON || "{}"); } catch { console.error("[margem] CUSTO_IA_JSON inválido; usando os preços padrão"); }
  return { ...PRECOS_IA_PADRAO, ...extra, modelos: { ...PRECOS_IA_PADRAO.modelos, ...(extra.modelos || {}) } };
}
const precoDe = (p, modelo) => p.modelos[modelo] || p.desconhecido;
/* custo em US$ de um conjunto de tokens */
export function custoUSD(modelo, { entrada = 0, saida = 0, imagem = 0 }, p = precosIA()) {
  const t = precoDe(p, modelo);
  return (entrada * t.entrada + saida * t.saida + imagem * (t.imagem ?? t.saida)) / 1e6;
}

const hoje = () => new Date().toISOString().slice(0, 10);
const rpc = (nome, args) => rest(`rpc/${nome}`, { method: "POST", body: JSON.stringify(args) });

/* ---------- antes de chamar a IA ---------- */
const MENSAGENS = {
  "teto-falhas": ["ia-pausada", 429, "A IA falhou várias vezes hoje nesta conta. Para proteger a sua cota, as novas tentativas ficam pausadas até amanhã. Se precisar, fale com o suporte."],
  "limite-auxiliares": ["auxiliares-esgotadas", 429, "O limite diário de análises automáticas de fotos foi atingido. Continue marcando a região manualmente; amanhã volta ao normal."],
  "limite-global": ["ia-sobrecarga", 503, "O serviço de simulação está com muita procura agora. Tente novamente mais tarde."]
};
/* tipo: "simulacao" | "auxiliar". Lança ErroConta quando a chamada não pode acontecer. */
export async function liberarChamadaIA(conta, tipo) {
  const r = await rpc("liberar_chamada_ia", {
    p_assinatura: conta.assinatura.id, p_dia: hoje(), p_tipo: tipo,
    p_limite_aux: conta.plano.auxiliaresDia, p_teto_falhas: MARGEM.tetoFalhasDia, p_limite_global: limiteGlobal(tipo)
  });
  if (r === "ok") return;
  if (r === "limite-global") await avisar(`global-${tipo}`, {
    titulo: "Freio diário da IA atingido",
    resumo: `O sistema chegou ao limite de ${limiteGlobal(tipo)} chamadas de ${tipo === "simulacao" ? "simulação" : "análise auxiliar"} hoje. Novas chamadas estão bloqueadas até a virada do dia (UTC).`,
    linhas: [["Variável", tipo === "simulacao" ? "LIMITE_IA_DIA" : "LIMITE_IA_AUX_DIA"], ["O que fazer", "Se o uso for legítimo, aumente o limite na Vercel. Se não, procure a conta responsável no painel."]]
  });
  if (r === "teto-falhas") await avisar(`conta-${conta.assinatura.id}`, {
    titulo: "Conta pausada pelo teto de falhas da IA",
    resumo: `A conta abaixo chegou a ${MARGEM.tetoFalhasDia} falhas da IA hoje e as novas tentativas foram pausadas até amanhã.`,
    linhas: [["Conta", conta.assinatura.email], ["O que fazer", "Veja as falhas recentes no painel e fale com o cliente."]]
  });
  const [codigo, status, msg] = MENSAGENS[r] || ["ia-indisponivel", 503, "A IA está indisponível agora. Tente novamente mais tarde."];
  throw new ErroConta(status, msg, codigo);
}

/* ---------- depois de chamar a IA ----------
   chamadas: [{ modelo, entrada, saida, imagem, sucesso, motivo, ms }] (uma por chamada feita ao Gemini).
   O pedido falhou quando houve chamada e nenhuma deu certo. Nunca derruba a resposta ao dentista. */
export async function registrarChamadasIA(conta, rota, chamadas) {
  if (!chamadas.length) return;
  const assinatura = conta ? conta.assinatura.id : null;
  const sucesso = chamadas.some(c => c.sucesso);
  try {
    await rest("chamadas_ia", {
      method: "POST", headers: { prefer: "return=minimal" },
      body: JSON.stringify(chamadas.map(c => ({
        assinatura_id: assinatura, rota, modelo: c.modelo, tokens_entrada: c.entrada || 0, tokens_saida: c.saida || 0,
        tokens_imagem: c.imagem || 0, sucesso: !!c.sucesso, motivo: c.motivo || null, duracao_ms: c.ms || null
      })))
    });
    const n = await rpc("registrar_resultado_ia", { p_assinatura: assinatura, p_dia: hoje(), p_sucesso: sucesso });
    if (sucesso) return;
    const motivo = chamadas[chamadas.length - 1].motivo || "desconhecido";
    if (conta && n.falhas_seguidas >= MARGEM.falhasSeguidasAviso) await avisar(`conta-${assinatura}`, {
      titulo: "Falhas seguidas da IA em uma conta",
      resumo: `A conta abaixo teve ${n.falhas_seguidas} falhas seguidas da IA. Vale chamar o cliente antes que ele reclame.`,
      linhas: [["Conta", conta.assinatura.email], ["Rota", rota], ["Último motivo", MOTIVOS[motivo] || motivo], ["Falhas hoje", `${n.falhas_dia} de ${MARGEM.tetoFalhasDia}`]]
    });
    if (n.pedidos_hora >= MARGEM.minimoPedidosHora && n.falhas_hora / n.pedidos_hora > MARGEM.taxaFalhaAviso) await avisar("geral", {
      titulo: "Taxa de falha da IA alta",
      resumo: `${n.falhas_hora} de ${n.pedidos_hora} pedidos à IA falharam nesta hora (${Math.round(100 * n.falhas_hora / n.pedidos_hora)}%).`,
      linhas: [["Último motivo", MOTIVOS[motivo] || motivo], ["O que fazer", "Confira o status do Google AI Studio e as falhas recentes no painel."]]
    });
  } catch (e) { console.error("[margem] não foi possível registrar a chamada:", e.message); }
}

export const MOTIVOS = {
  "bloqueio": "bloqueio de segurança da IA", "sem-imagem": "a IA não devolveu imagem", "modelo-indisponivel": "modelo indisponível",
  "limite-provedor": "limite do Google atingido", "erro-provedor": "erro no Google", "resposta-invalida": "resposta inválida", "rede": "falha de conexão"
};

/* aviso ao administrador: no máximo um por hora para a mesma chave */
async function avisar(chave, dados) {
  try { if (await rpc("reservar_aviso", { p_chave: chave, p_minutos: 60 })) await emailAvisoAdmin(dados); }
  catch (e) { console.error("[margem] aviso não enviado:", e.message); }
}

/* ---------- painel admin: custo medido e conta da margem por plano (tabela 2.2, calculada sozinha) ---------- */
const reais = v => Math.round(v * 100) / 100;
export async function relatorioMargem(dias = 30) {
  const desde = new Date(Date.now() - dias * 864e5).toISOString();
  const p = precosIA();
  const linhas = await rpc("resumo_chamadas_ia", { p_desde: desde });
  const porModelo = linhas.map(l => {
    const usd = custoUSD(l.modelo, { entrada: Number(l.tokens_entrada), saida: Number(l.tokens_saida), imagem: Number(l.tokens_imagem) }, p);
    return { rota: l.rota, modelo: l.modelo, chamadas: Number(l.chamadas), sucessos: Number(l.sucessos), custoReais: reais(usd * p.dolar), semPreco: !p.modelos[l.modelo] };
  });
  /* custo por pedido entregue: soma tudo o que foi gasto (inclusive falhas) e divide pelos que deram certo */
  const medir = filtro => {
    const ls = porModelo.filter(filtro), custo = ls.reduce((s, l) => s + l.custoReais, 0), ok = ls.reduce((s, l) => s + l.sucessos, 0);
    return ok >= ESTIMATIVA.amostrasMinimas ? { valor: custo / ok, medido: true, amostras: ok } : null;
  };
  const sim = medir(l => l.rota === "simular") || { valor: ESTIMATIVA.simulacao, medido: false, amostras: 0 };
  const aux = medir(l => l.rota !== "simular") || { valor: ESTIMATIVA.auxiliar, medido: false, amostras: 0 };

  const receitaLiquida = (preco, meses) => (preco - (preco * MARGEM.kiwify.percentual + MARGEM.kiwify.fixo)) / meses;
  const planos = [];
  for (const [id, pl] of Object.entries(PLANOS)) for (const [periodo, preco] of Object.entries(PRECOS[id])) {
    const receita = receitaLiquida(preco, periodo === "anual" ? 12 : 1);
    const custo = pl.simulacoes * sim.valor + pl.auxiliaresDia * 30 * aux.valor + MARGEM.custoFixoConta;
    planos.push({ nome: `${pl.nome} ${periodo}`, preco, receita: reais(receita), custoMax: reais(custo), percentual: Math.round(100 * custo / receita) });
  }
  const receitaExtra = receitaLiquida(PACOTE_EXTRA.preco, 1), custoExtra = PACOTE_EXTRA.simulacoes * sim.valor;
  planos.push({ nome: `Pacote extra (${PACOTE_EXTRA.simulacoes} simulações)`, preco: PACOTE_EXTRA.preco, receita: reais(receitaExtra), custoMax: reais(custoExtra), percentual: Math.round(100 * custoExtra / receitaExtra) });

  const falhas = await rest(`chamadas_ia?sucesso=eq.false&motivo=neq.modelo-indisponivel&criado_em=gte.${encodeURIComponent(desde)}&select=rota,modelo,motivo,criado_em,assinatura_id&order=criado_em.desc&limit=40`);
  const ids = [...new Set(falhas.map(f => f.assinatura_id).filter(Boolean))];
  const emails = ids.length ? Object.fromEntries((await rest(`assinaturas?id=in.(${ids.join(",")})&select=id,email`)).map(a => [a.id, a.email])) : {};
  return {
    dias, dolar: p.dolar, teto: Math.round(MARGEM.tetoPercentual * 100), kiwify: MARGEM.kiwify,
    custoSimulacao: { ...sim, valor: reais(sim.valor) }, custoAuxiliar: { ...aux, valor: Math.round(aux.valor * 10000) / 10000 },
    planos, porModelo,
    limites: { tetoFalhasDia: MARGEM.tetoFalhasDia, simulacoesDia: limiteGlobal("simulacao"), auxiliaresDiaGlobal: limiteGlobal("auxiliar"), auxiliaresDia: Object.fromEntries(Object.entries(PLANOS).map(([k, v]) => [k, v.auxiliaresDia])) },
    falhas: falhas.map(f => ({ quando: f.criado_em, conta: emails[f.assinatura_id] || "—", rota: f.rota, motivo: MOTIVOS[f.motivo] || f.motivo || "—" }))
  };
}
