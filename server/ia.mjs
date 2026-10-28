/* DENTALCHECK — chamadas à IA (Google Gemini), usadas pelo servidor local e pelas funções da Vercel.
   Cada rota recebe o corpo JSON já lido e devolve { status, corpo }. A chave da API fica só no servidor. */
import { montarPrompt } from "./prompt-sorriso.mjs";

const lista = (v, padrao) => (v || padrao).split(",").map(s => s.trim()).filter(Boolean);
const MODELOS = () => lista(process.env.GEMINI_MODELO, "gemini-3.1-flash-image,gemini-2.5-flash-image");
const MODELOS_TEXTO = () => lista(process.env.GEMINI_MODELO_TEXTO, "gemini-3.8-flash,gemini-3.1-flash-lite,gemini-flash-latest");
const LIMITE_DIA = () => Number(process.env.LIMITE_IA_DIA || 200);
const ok = (corpo, status = 200) => ({ status, corpo });

/* senha de acesso: obrigatória quando ACESSO_SENHA está configurada (site publicado); no computador local não há */
export function acessoLiberado(senhaEnviada) {
  const senha = process.env.ACESSO_SENHA;
  return !senha || senhaEnviada === senha;
}

/* limite diário de simulações (controle de custo), em memória: no servidor local vale por dia;
   na Vercel cada instância conta separado, então serve só como freio contra excesso */
let usoDia = { dia: "", n: 0 };
function contarUso() {
  const hoje = new Date().toISOString().slice(0, 10);
  if (usoDia.dia !== hoje) usoDia = { dia: hoje, n: 0 };
  if (usoDia.n >= LIMITE_DIA()) return false;
  usoDia.n++;
  return true;
}

const imagemDe = corpo => String((corpo && corpo.imagem) || "").replace(/^data:image\/\w+;base64,/, "");

async function chamarGemini(modelo, imagem, prompt) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: imagem } }, { text: prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"], imageConfig: { aspectRatio: "4:3" } }
    })
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) return { erro: dados.error?.message || `HTTP ${r.status}`, status: r.status };
  const img = (dados.candidates?.[0]?.content?.parts || []).find(p => p.inlineData);
  if (!img) {
    const motivo = dados.candidates?.[0]?.finishReason || dados.promptFeedback?.blockReason || "sem imagem";
    return { erro: "A IA não devolveu imagem (" + motivo + ")." };
  }
  return { imagem: img.inlineData.data, mime: img.inlineData.mimeType || "image/png" };
}

/* simular  { imagem: "<jpeg base64>", plano: {...} } → { ok, imagem, mime } */
async function simular(corpo) {
  const imagem = imagemDe(corpo);
  if (!imagem) return ok({ ok: false, erro: "Foto ausente." }, 400);
  let prompt;
  try { prompt = montarPrompt(corpo.plano || {}); } catch (e) { return ok({ ok: false, erro: e.message }, 400); }
  if (!contarUso()) return ok({ ok: false, erro: `Limite diário de ${LIMITE_DIA()} simulações atingido.` }, 429);

  const inicio = Date.now();
  let ultimo;
  for (const modelo of MODELOS()) {
    ultimo = await chamarGemini(modelo, imagem, prompt);
    if (ultimo.imagem) {
      console.log(`[IA] simulação gerada com ${modelo} em ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
      return ok({ ok: true, imagem: ultimo.imagem, mime: ultimo.mime });
    }
    if (ultimo.status !== 404 && ultimo.status !== 400) break;   // modelo inexistente → tenta o próximo
  }
  console.error("[IA] erro:", ultimo.erro);
  /* o detalhe do erro fica só no registro do servidor: a mensagem ao usuário não expõe o provedor de IA */
  return ok({ ok: false, erro: "A IA não conseguiu gerar a simulação. Tente novamente em instantes." }, 502);
}

/* ---------- análise de imagem com modelo de texto (barato e rápido) ---------- */

/* envia a imagem + pergunta e devolve o JSON respondido pela IA */
async function perguntarJSON(imagem, pedido, nome) {
  for (const modelo of MODELOS_TEXTO()) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ inlineData: { mimeType: "image/jpeg", data: imagem } }, { text: pedido }] }],
        /* sem "raciocínio" interno: a resposta cai de ~15 s para ~3 s nesta tarefa simples */
        generationConfig: { responseMimeType: "application/json", temperature: 0, thinkingConfig: { thinkingBudget: 0 } }
      })
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) { console.error(`[IA] ${nome} (${modelo}):`, dados.error?.message || r.status); if (r.status === 404 || r.status === 400) continue; return null; }
    try {
      const texto = (dados.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
      return { modelo, json: JSON.parse(texto.replace(/```json|```/g, "")) };
    } catch { console.error(`[IA] ${nome}: resposta inesperada`); return null; }
  }
  return null;
}

/* [ymin, xmin, ymax, xmax] em 0–1000 → { x, y, w, h } em fração */
function caixa(b) {
  if (!Array.isArray(b) || b.length !== 4) return null;
  const [y0, x0, y1, x1] = b.map(v => Math.max(0, Math.min(1000, Number(v))) / 1000);
  return x1 - x0 > 0.01 && y1 - y0 > 0.01 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

const ANGULOS = ["sorriso", "repouso", "perfil", "perfil-esq", "boca", "intra-frontal", "intra-dir", "intra-esq", "oclusal-sup", "oclusal-inf", "outro"];
const PEDIDO_ANALISE = `You are organizing clinical photos for a dental case presentation. Analyze this photo and answer only JSON:
{
  "rotation": 0 | 90 | 180 | 270,
  "type": "<one id from the list>",
  "mouth_box": [ymin, xmin, ymax, xmax] or null,
  "face_box": [ymin, xmin, ymax, xmax] or null
}
"rotation" = degrees CLOCKWISE the image must be rotated to look upright and natural:
 - face photos: head up, eyes above the mouth;
 - frontal/lateral intraoral photos: upper teeth at the top, lower teeth at the bottom, the bite line (occlusal plane) running horizontally;
 - occlusal photos (looking at the chewing surfaces of one arch): front teeth (incisors) at the top of the image.
 Phones often save photos sideways: if the bite line runs vertically, the answer is 90 or 270.
"type" ids:
 - "sorriso": frontal face (or most of the face) smiling, teeth visible
 - "repouso": frontal face with lips closed or relaxed
 - "perfil": face turned to the side showing the patient's RIGHT side (the nose points to the RIGHT edge of the upright image)
 - "perfil-esq": face turned to the side showing the patient's LEFT side (the nose points to the LEFT edge of the upright image)
 - "boca": close-up of the smile from the front WITHOUT cheek retractors: lips and teeth fill most of the photo, little or none of the eyes
 - "intra-frontal": intraoral close-up from the front WITH cheek retractors, both arches visible
 - "intra-dir": intraoral close-up of the patient's RIGHT side (buccal view of right premolars/molars)
 - "intra-esq": intraoral close-up of the patient's LEFT side
 - "oclusal-sup": occlusal view of the UPPER arch (palate visible)
 - "oclusal-inf": occlusal view of the LOWER arch (tongue visible)
 - "outro": anything else
"mouth_box" = lips + all visible teeth and gums; "face_box" = the whole face from hairline to chin. Coordinates normalized 0-1000 in the ORIGINAL image as given (before rotation). Use null when not visible.`;

/* localizar  { imagem } → { ok, caixa } — posição da boca, para a região do sorriso */
async function localizar(corpo) {
  const imagem = imagemDe(corpo); if (!imagem) return ok({ ok: false }, 400);
  const resp = await perguntarJSON(imagem, "Detect the mouth of the main person in this photo: the area including both lips and all visible teeth and gums. " +
    'Answer only JSON: {"box_2d": [ymin, xmin, ymax, xmax]} with coordinates normalized to 0-1000. If there is no visible mouth, answer {"box_2d": null}.', "localizar");
  let c = resp ? caixa(resp.json.box_2d) : null;
  /* às vezes a primeira pergunta volta sem a boca: tenta de novo pela análise completa da foto */
  if (!c) {
    const outra = await perguntarJSON(imagem, PEDIDO_ANALISE, "localizar (2ª tentativa)");
    c = outra ? caixa(outra.json.mouth_box) : null;
  }
  if (!c) return ok({ ok: false, erro: "Boca não encontrada na foto." });
  console.log(`[IA] boca localizada: x ${c.x.toFixed(2)}–${(c.x + c.w).toFixed(2)}, y ${c.y.toFixed(2)}–${(c.y + c.h).toFixed(2)}`);
  return ok({ ok: true, caixa: c });
}

/* analisar-foto  { imagem } → { ok, rotacao, angulo, boca, rosto }
   Organiza fotos clínicas: quanto girar, qual ângulo é e onde estão boca e rosto (na imagem original). */
async function analisarFoto(corpo) {
  const imagem = imagemDe(corpo); if (!imagem) return ok({ ok: false }, 400);
  const resp = await perguntarJSON(imagem, PEDIDO_ANALISE, "analisar-foto");
  if (!resp) return ok({ ok: false, erro: "Não foi possível analisar a foto." }, 502);
  const j = resp.json;
  const rotacao = [0, 90, 180, 270].includes(Number(j.rotation)) ? Number(j.rotation) : 0;
  const angulo = ANGULOS.includes(j.type) ? j.type : "outro";
  console.log(`[IA] foto analisada com ${resp.modelo}: ${angulo}, girar ${rotacao}°`);
  return ok({ ok: true, rotacao, angulo, boca: caixa(j.mouth_box), rosto: caixa(j.face_box) });
}

/* dentes  { imagem } → { ok, dentes: [{ n, caixa }] }
   Acha e numera (FDI) cada dente visível — ou o espaço vazio onde ele deveria estar.
   Serve para o doutor selecionar dentes clicando na foto e para o app só aplicar a IA nos dentes escolhidos. */
const FDI_VISIVEIS = [16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36];
const PEDIDO_DENTES = `Dental photo of a smile, patient facing the camera. Detect each visible tooth and label it with its FDI number.
Orientation: the patient's RIGHT side is on the LEFT of the image.
Upper arch, from image left to image right: 16, 15, 14, 13, 12, 11 | 21, 22, 23, 24, 25, 26 (11 and 21 are the two front teeth on each side of the midline; 13 and 23 are the canines).
Lower arch, from image left to image right: 46, 45, 44, 43, 42, 41 | 31, 32, 33, 34, 35, 36.
If a tooth is missing but its space is visible, still return the box of that empty space.
Answer only JSON: [{"fdi": 11, "box_2d": [ymin, xmin, ymax, xmax]}, ...] with coordinates normalized 0-1000. Only include teeth (or spaces) that are actually visible.`;

async function detectarDentes(corpo) {
  const imagem = imagemDe(corpo); if (!imagem) return ok({ ok: false }, 400);
  const resp = await perguntarJSON(imagem, PEDIDO_DENTES, "dentes");
  if (!resp || !Array.isArray(resp.json)) return ok({ ok: false, erro: "Não foi possível identificar os dentes." }, 502);
  const vistos = new Set(), dentes = [];
  for (const d of resp.json) {
    const n = Number(d.fdi), c = caixa(d.box_2d);
    if (!FDI_VISIVEIS.includes(n) || !c || vistos.has(n)) continue;
    vistos.add(n); dentes.push({ n, caixa: c });
  }
  console.log(`[IA] ${dentes.length} dentes identificados com ${resp.modelo}: ${dentes.map(d => d.n).join(" ")}`);
  return ok({ ok: true, dentes });
}

/* acesso  { senha } → { ok } — confere a senha de acesso do site publicado */
async function acesso(corpo) {
  if (!process.env.ACESSO_SENHA) return ok({ ok: true, livre: true });
  return corpo && corpo.senha === process.env.ACESSO_SENHA ? ok({ ok: true }) : ok({ ok: false, erro: "Senha de acesso incorreta." }, 401);
}

/* tabela de rotas: /api/<nome> */
export const ROTAS = { simular, localizar, "analisar-foto": analisarFoto, dentes: detectarDentes, acesso };

/* ponto único de entrada: confere senha e configuração, chama a rota e trata erros */
export async function atender(nome, corpo, senha) {
  const rota = ROTAS[nome];
  if (!rota) return ok({ ok: false, erro: "Rota não existe." }, 404);
  if (nome !== "acesso" && !acessoLiberado(senha)) return ok({ ok: false, erro: "Acesso não autorizado. Entre de novo com a senha.", semAcesso: true }, 401);
  if (nome !== "acesso" && !process.env.GEMINI_API_KEY) return ok({ ok: false, erro: "A IA não está configurada no servidor." }, 500);
  try { return await rota(corpo || {}); }
  catch (e) { console.error(e); return ok({ ok: false, erro: "Erro interno." }, 500); }
}
