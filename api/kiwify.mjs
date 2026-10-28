/* DENTALCHECK — webhook da Kiwify em /api/kiwify. Lê o corpo bruto (sem converter) para conferir a assinatura. */
import { webhookKiwify } from "../server/kiwify.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  let bruto = "";
  for await (const parte of req) bruto += parte;
  const r = await webhookKiwify(bruto, req.query || {});
  res.status(r.status).json(r.corpo);
}
