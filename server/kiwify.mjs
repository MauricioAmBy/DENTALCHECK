/* DENTALCHECK — webhook da Kiwify: compra, renovação, atraso, cancelamento e reembolso viram o status da
   assinatura no banco (pelo e-mail do comprador). Cada aviso é guardado em eventos_kiwify, então dá para
   conferir os campos reais depois da primeira compra de teste e não processar o mesmo aviso duas vezes.

   Configuração (variáveis de ambiente):
   - KIWIFY_TOKEN: token do webhook (Kiwify → Apps → Webhooks). Confere a assinatura ?signature=HMAC-SHA1(corpo).
   - KIWIFY_PRODUTOS (opcional): JSON { "<id do produto>": "profissional:anual", "<id>": "extra" }.
     Sem ele, o plano é reconhecido pelo nome do produto/oferta (Essencial, Profissional, Clínica, Extra). */
import crypto from "node:crypto";
import { contasConfiguradas, salvarAssinatura, atualizarAssinatura, adicionarExtras, eventoJaProcessado } from "./conta.mjs";

const QTD_PACOTE_EXTRA = 30;

/* lê um campo tentando vários caminhos (a Kiwify usa variações de maiúsculas/estrutura) */
const pegar = (obj, ...caminhos) => {
  for (const c of caminhos) {
    const v = c.split(".").reduce((o, k) => (o == null ? o : o[k] ?? o[k.charAt(0).toUpperCase() + k.slice(1)]), obj);
    if (v != null && v !== "") return v;
  }
  return null;
};
const normal = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function identificarProduto(p) {
  const id = String(pegar(p, "product.product_id", "product_id", "product.id") || "");
  try {
    const mapa = JSON.parse(process.env.KIWIFY_PRODUTOS || "{}");
    if (mapa[id]) { const [plano, periodo] = mapa[id].split(":"); return { plano, periodo: periodo || null }; }
  } catch { /* mapa inválido: cai no reconhecimento pelo nome */ }
  const nome = normal([pegar(p, "product.product_name", "product_name"), pegar(p, "subscription.plan.name", "plan.name", "offer_name")].join(" "));
  const plano = /extra|avuls|pacote/.test(nome) ? "extra" : /clinica/.test(nome) ? "clinica" : /profission/.test(nome) ? "profissional" : /essencial/.test(nome) ? "essencial" : null;
  const freq = normal(pegar(p, "subscription.plan.frequency", "plan.frequency", "subscription.frequency"));
  const periodo = /anual|year|annual/.test(nome + " " + freq) ? "anual" : "mensal";
  return { plano, periodo };
}

function assinaturaValida(token, corpoBruto, assinatura) {
  if (!token) return true;                                   // sem token configurado: aceita (só em testes)
  const esperado = crypto.createHmac("sha1", token).update(corpoBruto).digest("hex");
  const a = Buffer.from(String(assinatura || "")), b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* recebe o corpo bruto (string) e a query; devolve { status, corpo } */
export async function webhookKiwify(corpoBruto, query) {
  if (!contasConfiguradas()) return { status: 503, corpo: { ok: false, erro: "Contas não configuradas." } };
  if (!assinaturaValida(process.env.KIWIFY_TOKEN, corpoBruto, query.signature)) return { status: 401, corpo: { ok: false, erro: "Assinatura inválida." } };
  let p;
  try { p = JSON.parse(corpoBruto); } catch { return { status: 400, corpo: { ok: false } }; }

  const email = String(pegar(p, "customer.email", "Customer.email", "email") || "").toLowerCase();
  const tipo = normal(pegar(p, "webhook_event_type", "event", "order_status") || "");
  const status = normal(pegar(p, "order_status", "status") || "");
  const pedido = String(pegar(p, "order_id", "order.id", "id") || "");
  const idEvento = `${pedido}:${tipo}:${normal(pegar(p, "subscription.charges.completed.length", "updated_at", "approved_date") || "")}`;
  if (!email) return { status: 200, corpo: { ok: true, ignorado: "sem e-mail" } };
  if (await eventoJaProcessado(idEvento, tipo, email, p)) return { status: 200, corpo: { ok: true, repetido: true } };

  const { plano, periodo } = identificarProduto(p);
  const proximo = pegar(p, "subscription.next_payment", "subscription.customer_access.access_until", "next_payment");
  const validoAte = proximo ? new Date(proximo).toISOString() : null;
  const assinaturaId = String(pegar(p, "subscription_id", "subscription.id") || "") || null;
  const txt = tipo + " " + status;

  if (/refund|reembols/.test(txt)) await atualizarAssinatura(email, { status: "reembolsada" });
  else if (/chargeback|chargedback/.test(txt)) await atualizarAssinatura(email, { status: "reembolsada" });
  else if (/cancel/.test(txt)) await atualizarAssinatura(email, { status: "cancelada", ...(validoAte ? { valido_ate: validoAte } : {}) });
  else if (/late|atras|overdue/.test(txt)) await atualizarAssinatura(email, { status: "atrasada" });
  else if (/approved|paid|aprovad|renew|renova/.test(txt)) {
    if (plano === "extra") await adicionarExtras(email, QTD_PACOTE_EXTRA);
    else if (plano) {
      const ate = validoAte || new Date(Date.now() + (periodo === "anual" ? 366 : 31) * 864e5).toISOString();
      await salvarAssinatura({ email, plano, periodo, status: "ativa", valido_ate: ate, kiwify_pedido: pedido || null, kiwify_assinatura: assinaturaId });
    } else console.error("[kiwify] produto não reconhecido — configure KIWIFY_PRODUTOS:", pegar(p, "product.product_id", "product_id"), pegar(p, "product.product_name"));
  }
  console.log(`[kiwify] ${tipo || status} · ${email} · ${plano || "?"}`);
  return { status: 200, corpo: { ok: true } };
}
