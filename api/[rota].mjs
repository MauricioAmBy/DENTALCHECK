/* DENTALCHECK — função da Vercel: atende /api/<rota> com a mesma lógica do servidor local (server/ia.mjs).
   As chaves (IA, Supabase, Kiwify) ficam nas variáveis de ambiente do projeto na Vercel. */
import { atender } from "../server/ia.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  let corpo = req.body;
  if (typeof corpo === "string") { try { corpo = JSON.parse(corpo); } catch { corpo = {}; } }
  const h = req.headers;
  const r = await atender(String(req.query.rota || ""), corpo, {
    senha: h["x-acesso"], token: String(h.authorization || "").replace(/^Bearer\s+/i, ""), aparelho: h["x-aparelho"], descricao: h["x-aparelho-nome"]
  });
  res.status(r.status).json(r.corpo);
}
