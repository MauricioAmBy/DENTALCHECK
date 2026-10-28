/* DENTALCHECK — painel do administrador (/admin): lista as contas e libera acesso gratuito (cortesia).
   Só funciona para os e-mails de ADMIN_EMAILS (separados por vírgula), conferidos pelo token de login.
   A cortesia é uma assinatura comum marcada com kiwify_pedido = "cortesia"; se a pessoa comprar depois,
   a Kiwify sobrescreve normalmente. */
import { PLANOS, ErroConta, rest, usuarioDoToken, mesAtual, acessoLiberado } from "./conta.mjs";

export const CORTESIA = "cortesia";
const enc = encodeURIComponent;

function ehAdmin(email) {
  const lista = String(process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  return lista.includes(email);
}

async function usuariosDoLogin() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, ""), chave = process.env.SUPABASE_SERVICE_KEY;
  const r = await fetch(`${url}/auth/v1/admin/users?per_page=1000`, { headers: { apikey: chave, authorization: `Bearer ${chave}` } });
  if (!r.ok) throw new Error(`Supabase ${r.status}`);
  return (await r.json()).users || [];
}

/* tudo numa lista por e-mail: conta de login + assinatura (própria ou da equipe) + uso do mês */
async function listar() {
  const [usuarios, assinaturas, membros, uso] = await Promise.all([
    usuariosDoLogin(),
    rest("assinaturas?select=*&order=criado_em.desc"),
    rest("membros?select=*"),
    rest(`uso_mensal?mes=eq.${mesAtual()}&select=*`)
  ]);
  const porId = Object.fromEntries(assinaturas.map(a => [a.id, a]));
  const usoDe = id => uso.find(u => u.assinatura_id === id) || { simulacoes: 0, extras: 0 };
  const emails = new Set([...usuarios.map(u => String(u.email || "").toLowerCase()), ...assinaturas.map(a => a.email), ...membros.map(m => m.email)]);
  return [...emails].filter(Boolean).map(email => {
    const u = usuarios.find(x => String(x.email || "").toLowerCase() === email);
    const propria = assinaturas.find(a => a.email === email);
    const m = membros.find(x => x.email === email);
    const a = propria || (m && porId[m.assinatura_id]);
    return {
      email,
      conta: u ? { criada: u.created_at, confirmada: !!u.email_confirmed_at, ultimoLogin: u.last_sign_in_at } : null,
      assinatura: a ? {
        plano: a.plano, planoNome: PLANOS[a.plano]?.nome || a.plano, periodo: a.periodo, status: a.status, validoAte: a.valido_ate,
        origem: a.kiwify_pedido === CORTESIA ? "cortesia" : "kiwify", titular: !!propria, titularEmail: a.email,
        liberado: acessoLiberado(a), uso: usoDe(a.id), limite: PLANOS[a.plano]?.simulacoes
      } : null
    };
  }).sort((x, y) => String(y.conta?.criada || "").localeCompare(String(x.conta?.criada || "")));
}

async function liberarCortesia(email, plano, ate) {
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new ErroConta(400, "Informe um e-mail válido.");
  if (!PLANOS[plano]) throw new ErroConta(400, "Plano inválido.");
  const [membro] = await rest(`membros?email=eq.${enc(email)}&select=email`);
  if (membro) throw new ErroConta(400, "Esse e-mail faz parte da equipe de outra assinatura. Remova-o da equipe antes.");
  const validoAte = ate ? new Date(ate + "T23:59:59-03:00").toISOString() : null;
  if (validoAte && new Date(validoAte) < new Date()) throw new ErroConta(400, "A data final já passou.");
  await rest("assinaturas?on_conflict=email", {
    method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ email, plano, periodo: "mensal", status: "ativa", valido_ate: validoAte, kiwify_pedido: CORTESIA, kiwify_assinatura: null, atualizado_em: new Date().toISOString() })
  });
}

async function encerrar(email) {
  await rest(`assinaturas?email=eq.${enc(email)}`, {
    method: "PATCH", headers: { prefer: "return=minimal" },
    body: JSON.stringify({ status: "cancelada", valido_ate: new Date().toISOString(), atualizado_em: new Date().toISOString() })
  });
}

/* corpo.acao: "verificar" | "listar" | "liberar" { email, plano, ate? "AAAA-MM-DD" } | "encerrar" { email } */
export async function atenderAdmin(corpo, cab) {
  const u = await usuarioDoToken(cab.token);
  if (!ehAdmin(u.email)) throw new ErroConta(403, "Área restrita ao administrador.", "nao-admin");
  const email = String(corpo.email || "").trim().toLowerCase();
  if (corpo.acao === "verificar") return { ok: true, admin: true };
  if (corpo.acao === "liberar") await liberarCortesia(email, String(corpo.plano || ""), corpo.ate || null);
  else if (corpo.acao === "encerrar") await encerrar(email);
  return { ok: true, contas: await listar() };
}
