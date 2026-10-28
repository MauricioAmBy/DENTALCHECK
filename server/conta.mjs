/* DENTALCHECK — contas, planos e limites (Supabase).
   O servidor usa a chave service_role (só nas variáveis de ambiente) e fala com o Supabase pela API REST,
   sem dependências. O navegador só faz login (chave anon) e manda o token em cada chamada /api/. */

export const PLANOS = {
  essencial:    { nome: "Essencial",    simulacoes: 40,  aparelhos: 2,  profissionais: 1, identidades: 1,    versoes: false },
  profissional: { nome: "Profissional", simulacoes: 150, aparelhos: 3,  profissionais: 1, identidades: null, versoes: true },
  clinica:      { nome: "Clínica",      simulacoes: 350, aparelhos: 10, profissionais: 5, identidades: null, versoes: true }
};
const CARENCIA_DIAS = 3;                               // pagamento atrasado: acesso mantido por alguns dias

const env = () => ({ url: (process.env.SUPABASE_URL || "").replace(/\/$/, ""), anon: process.env.SUPABASE_ANON_KEY, service: process.env.SUPABASE_SERVICE_KEY });
export const contasConfiguradas = () => { const e = env(); return !!(e.url && e.service && e.anon); };
export const configPublica = () => { const e = env(); return { url: e.url, anon: e.anon }; };
export const mesAtual = () => new Date().toISOString().slice(0, 7);

/* erro com status HTTP e código para o app reagir (ex.: limite atingido → oferecer pacote extra) */
export class ErroConta extends Error {
  constructor(status, mensagem, codigo) { super(mensagem); this.status = status; this.codigo = codigo; }
}

export async function rest(caminho, opcoes = {}) {
  const e = env();
  const r = await fetch(`${e.url}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: { apikey: e.service, authorization: `Bearer ${e.service}`, "content-type": "application/json", ...(opcoes.headers || {}) }
  });
  const texto = await r.text();
  const dados = texto ? JSON.parse(texto) : null;
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${dados?.message || texto}`);
  return dados;
}
const rpc = (nome, args) => rest(`rpc/${nome}`, { method: "POST", body: JSON.stringify(args) });
const enc = encodeURIComponent;

/* confere o token de login e devolve o usuário { id, email } */
export async function usuarioDoToken(token) {
  if (!token) throw new ErroConta(401, "Entre com o seu e-mail e senha.", "sem-login");
  const e = env();
  const r = await fetch(`${e.url}/auth/v1/user`, { headers: { apikey: e.anon, authorization: `Bearer ${token}` } });
  if (!r.ok) throw new ErroConta(401, "Sua sessão expirou. Entre de novo.", "sem-login");
  const u = await r.json();
  return { id: u.id, email: String(u.email || "").toLowerCase() };
}

/* assinatura do usuário: como titular (e-mail da compra) ou como profissional da equipe */
export async function assinaturaDoEmail(email) {
  const [titular] = await rest(`assinaturas?email=eq.${enc(email)}&select=*`);
  if (titular) return { ...titular, titular: true };
  const [membro] = await rest(`membros?email=eq.${enc(email)}&select=assinatura_id`);
  if (!membro) return null;
  const [a] = await rest(`assinaturas?id=eq.${membro.assinatura_id}&select=*`);
  return a ? { ...a, titular: false } : null;
}

export function acessoLiberado(a) {
  if (!a) return false;
  const ate = a.valido_ate ? new Date(a.valido_ate).getTime() : Infinity;
  if (a.status === "ativa") return a.kiwify_pedido !== "cortesia" || ate > Date.now();   // cortesia com prazo expira sozinha
  if (a.status === "atrasada") return ate + CARENCIA_DIAS * 864e5 > Date.now();
  if (a.status === "cancelada") return ate > Date.now();      // cancelou: usa até o fim do período pago
  return false;
}

/* aparelho: registra no primeiro uso e respeita o limite do plano */
async function registrarAparelho(a, aparelho, descricao) {
  if (!aparelho) throw new ErroConta(400, "Aparelho não identificado. Recarregue a página.", "sem-aparelho");
  const lista = await rest(`aparelhos?assinatura_id=eq.${a.id}&select=aparelho`);
  const limite = PLANOS[a.plano].aparelhos;
  if (!lista.some(x => x.aparelho === aparelho) && lista.length >= limite)
    throw new ErroConta(403, `Seu plano permite ${limite} aparelhos conectados. Desconecte um aparelho em “Minha conta” para usar este.`, "limite-aparelhos");
  await rest("aparelhos?on_conflict=assinatura_id,aparelho", {
    method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ assinatura_id: a.id, aparelho, descricao: String(descricao || "").slice(0, 120), ultimo_uso: new Date().toISOString() })
  });
}

/* ponto único: token + aparelho → conta liberada (lança ErroConta se não puder usar) */
export async function exigirConta(token, aparelho, descricao) {
  const u = await usuarioDoToken(token);
  const a = await assinaturaDoEmail(u.email);
  if (!a) throw new ErroConta(402, "Não encontramos uma assinatura para este e-mail. Use o mesmo e-mail da compra.", "sem-assinatura");
  if (!acessoLiberado(a)) throw new ErroConta(402, a.status === "atrasada" ? "O pagamento da assinatura está pendente. Regularize para continuar." : "Sua assinatura não está ativa.", "assinatura-inativa");
  await registrarAparelho(a, aparelho, descricao);
  return { usuario: u, assinatura: a, plano: PLANOS[a.plano] };
}

/* consome 1 simulação do mês; devolve o total usado */
export async function consumirSimulacao(conta) {
  const usado = await rpc("consumir_simulacao", { p_assinatura: conta.assinatura.id, p_mes: mesAtual(), p_limite: conta.plano.simulacoes });
  if (usado < 0) throw new ErroConta(402, `Você usou todas as ${conta.plano.simulacoes} simulações do plano neste mês. Compre um pacote extra ou mude de plano.`, "limite-simulacoes");
  return usado;
}
export const devolverSimulacao = conta => rpc("devolver_simulacao", { p_assinatura: conta.assinatura.id, p_mes: mesAtual() }).catch(() => {});

/* resumo para a tela "Minha conta" */
export async function resumoConta(conta) {
  const a = conta.assinatura;
  const [uso] = await rest(`uso_mensal?assinatura_id=eq.${a.id}&mes=eq.${mesAtual()}&select=simulacoes,extras`);
  const aparelhos = await rest(`aparelhos?assinatura_id=eq.${a.id}&select=aparelho,descricao,ultimo_uso&order=ultimo_uso.desc`);
  const membros = a.titular ? await rest(`membros?assinatura_id=eq.${a.id}&select=email`) : [];
  return {
    email: conta.usuario.email, titular: a.titular, titularEmail: a.email,
    plano: a.plano, planoNome: conta.plano.nome, periodo: a.periodo, status: a.status, validoAte: a.valido_ate, cortesia: a.kiwify_pedido === "cortesia",
    limites: conta.plano,
    uso: { mes: mesAtual(), simulacoes: uso?.simulacoes || 0, extras: uso?.extras || 0 },
    aparelhos, membros: membros.map(m => m.email)
  };
}

/* ações da tela "Minha conta" */
export async function acaoConta(conta, corpo) {
  const a = conta.assinatura;
  const email = String(corpo.email || "").trim().toLowerCase();
  switch (corpo.acao) {
    case "remover-aparelho":
      await rest(`aparelhos?assinatura_id=eq.${a.id}&aparelho=eq.${enc(String(corpo.aparelho || ""))}`, { method: "DELETE" });
      return { ok: true };
    case "adicionar-membro": {
      if (!a.titular) throw new ErroConta(403, "Só o titular da assinatura pode gerenciar a equipe.");
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new ErroConta(400, "Informe um e-mail válido.");
      const atuais = await rest(`membros?assinatura_id=eq.${a.id}&select=email`);
      if (atuais.length + 1 >= conta.plano.profissionais) throw new ErroConta(403, `Seu plano permite ${conta.plano.profissionais} profissional(is) no total.`, "limite-profissionais");
      if (email === a.email) throw new ErroConta(400, "Esse e-mail já é o titular.");
      const [ocupado] = await rest(`membros?email=eq.${enc(email)}&select=email`);
      if (ocupado) throw new ErroConta(400, "Esse e-mail já faz parte de uma equipe.");
      await rest("membros", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ assinatura_id: a.id, email }) });
      return { ok: true };
    }
    case "remover-membro":
      if (!a.titular) throw new ErroConta(403, "Só o titular da assinatura pode gerenciar a equipe.");
      await rest(`membros?assinatura_id=eq.${a.id}&email=eq.${enc(email)}`, { method: "DELETE" });
      return { ok: true };
    default:
      throw new ErroConta(400, "Ação desconhecida.");
  }
}

/* ---------- usado pelo webhook da Kiwify ---------- */
export async function salvarAssinatura(dados) {
  const linha = { ...dados, email: dados.email.toLowerCase(), atualizado_em: new Date().toISOString() };
  await rest("assinaturas?on_conflict=email", { method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(linha) });
}
export async function atualizarAssinatura(email, campos) {
  await rest(`assinaturas?email=eq.${enc(email.toLowerCase())}`, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ ...campos, atualizado_em: new Date().toISOString() }) });
}
export async function adicionarExtras(email, qtd) {
  const a = await assinaturaDoEmail(email.toLowerCase());
  if (!a) return false;
  await rpc("adicionar_extras", { p_assinatura: a.id, p_mes: mesAtual(), p_qtd: qtd });
  return true;
}
export async function eventoJaProcessado(id, tipo, email, dados) {
  try {
    await rest("eventos_kiwify", { method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify({ id, tipo, email, dados }) });
    return false;
  } catch (e) { if (/409|duplicate/i.test(e.message)) return true; throw e; }
}
