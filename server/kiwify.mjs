/* DENTALCHECK — webhook da Kiwify: compra, renovação, atraso, cancelamento e reembolso viram o status da
   assinatura no banco (pelo e-mail do comprador). Cada aviso é guardado em eventos_kiwify, então dá para
   conferir os campos reais depois da primeira compra de teste e não processar o mesmo aviso duas vezes.

   Configuração (variáveis de ambiente):
   - KIWIFY_TOKEN: token(s) do webhook (Kiwify → Apps → Webhooks), separados por vírgula — a Kiwify cria um
     webhook (e um token) por produto. Confere a assinatura ?signature=HMAC-SHA1(corpo) com qualquer um deles.
   - KIWIFY_PRODUTOS (opcional): JSON { "<id do produto>": "profissional:anual", "<id>": "extra" }.
     Sem ele, o plano é reconhecido pelo nome do produto/oferta (Essencial, Profissional, Clínica, Extra). */
import crypto from "node:crypto";
import { contasConfiguradas, salvarAssinatura, atualizarAssinatura, adicionarExtras, eventoJaProcessado, assinaturaDoEmail, acessoLiberado } from "./conta.mjs";
import { emailBoasVindas } from "./email.mjs";

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

/* mensal e anual são planos do MESMO produto na Kiwify: o período vem da frequência do aviso,
   do nome do plano ou, em último caso, do valor cobrado (todo anual custa mais de R$ 500). */
function identificarPeriodo(p, nome) {
  const freq = normal(pegar(p, "subscription.plan.frequency", "plan.frequency", "subscription.frequency", "subscription.plan.recurrence") || "");
  if (/anual|year|annual/.test(freq + " " + nome)) return "anual";
  if (/mensal|month/.test(freq)) return "mensal";
  const centavos = Number(pegar(p, "commissions.charge_amount", "commissions.product_base_price", "order.amount", "charge_amount") || 0);
  return centavos > 50000 ? "anual" : "mensal";
}
function identificarProduto(p) {
  const id = String(pegar(p, "product.product_id", "product_id", "product.id") || "");
  const nome = normal([pegar(p, "product.product_name", "product_name"), pegar(p, "subscription.plan.name", "plan.name", "offer_name")].join(" "));
  let plano = null;
  try {
    const mapa = JSON.parse(process.env.KIWIFY_PRODUTOS || "{}");
    if (mapa[id]) { const [pl, per] = mapa[id].split(":"); if (per) return { plano: pl, periodo: per }; plano = pl; }
  } catch { /* mapa inválido: cai no reconhecimento pelo nome */ }
  plano = plano || (/extra|avuls|pacote/.test(nome) ? "extra" : /clinica/.test(nome) ? "clinica" : /profission/.test(nome) ? "profissional" : /essencial/.test(nome) ? "essencial" : null);
  return { plano, periodo: identificarPeriodo(p, nome) };
}

function assinaturaValida(tokens, corpoBruto, assinatura) {
  const lista = String(tokens || "").split(",").map(t => t.trim()).filter(Boolean);
  if (!lista.length) return true;                            // sem token configurado: aceita (só em testes)
  const a = Buffer.from(String(assinatura || ""));
  return lista.some(token => {
    const b = Buffer.from(crypto.createHmac("sha1", token).update(corpoBruto).digest("hex"));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
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
      /* boas-vindas só na primeira ativação (ou na volta depois de cancelar/reembolsar), nunca em renovação */
      const antes = await assinaturaDoEmail(email).catch(() => null);
      const novaAtivacao = !antes || !antes.titular || !acessoLiberado(antes);
      await salvarAssinatura({ email, plano, periodo, status: "ativa", valido_ate: ate, kiwify_pedido: pedido || null, kiwify_assinatura: assinaturaId });
      if (novaAtivacao) await emailBoasVindas({ email, nome: pegar(p, "customer.full_name", "customer.first_name"), plano }).catch(e => console.error("[email]", e.message));
    } else console.error("[kiwify] produto não reconhecido — configure KIWIFY_PRODUTOS:", pegar(p, "product.product_id", "product_id"), pegar(p, "product.product_name"));
  }
  console.log(`[kiwify] ${tipo || status} · ${email} · ${plano || "?"}`);
  return { status: 200, corpo: { ok: true } };
}
