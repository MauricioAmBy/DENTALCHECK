/* Transforma o plano escolhido pelo dentista em instruções para a IA de imagem.
   O prompt é em inglês porque os modelos de imagem seguem instruções clínicas com mais precisão nesse idioma.
   Regras principais:
   - cada opção vira uma ordem explícita — o que FAZER e o que MANTER —, senão a IA aplica um "sorriso perfeito" padrão;
   - os dentes tratados são descritos pelo nome e pela posição em relação à linha média, e os vizinhos que NÃO
     podem mudar são listados um a um (a IA não conta dentes por número FDI com confiabilidade). */

const NOMES = { 1: "central incisor", 2: "lateral incisor", 3: "canine", 4: "first premolar", 5: "second premolar", 6: "first molar" };
const POSICAO = { 1: "the front tooth touching the midline", 2: "the 2nd tooth from the midline", 3: "the 3rd tooth from the midline (the pointed one)", 4: "the 4th tooth from the midline", 5: "the 5th tooth from the midline", 6: "the 6th tooth from the midline" };
const QUAD = { 1: "upper right", 2: "upper left", 3: "lower left", 4: "lower right" };
const LADO_IMG = { 1: "image left", 2: "image right", 3: "image right", 4: "image left" };
const VISIVEIS = [16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36];
const DENTES_VALIDOS = new Set(VISIVEIS);

const PROCEDIMENTOS = {
  lentes: "porcelain veneers (\"dental contact lenses\"): thin laminates bonded on the front of each treated tooth, covering its whole visible surface",
  clareamento: "professional tooth whitening ONLY — tooth shape, size and position must not change at all",
  implantes: "implant-supported crowns: at each treated position, a brand-new natural-looking crown emerging from healthy gum. If the space is empty, fill it with a new tooth of the right size for that position; if a damaged or missing tooth is there, replace it completely"
};
const MATERIAIS = {
  porcelana: "Material look: porcelain/ceramic — natural gloss, light reflections like real enamel, subtle surface texture.",
  resina: "Material look: composite resin — satin (less glossy) surface, slightly more opaque than porcelain, smooth polish."
};
/* descrição visual e comparativa: os nomes da escala VITA sozinhos não bastam para a IA */
const CORES = {
  BL1: "VITA BL1 — the brightest bleach shade: a very bright, clean white that is neutral to very slightly warm (never blue, grey or glowing).",
  BL2: "VITA BL2 — very bright clean white, a touch softer than BL1; neutral to slightly warm, never blue or grey.",
  BL3: "VITA BL3 — bright clean white that still reads as natural; almost no yellow, never blue or grey.",
  BL4: "VITA BL4 — light natural white: clearly whiter than average natural teeth, with a very faint warm tone.",
  B1: "VITA B1 — the lightest NATURAL shade: light, slightly cool/neutral ivory. NOT bleach white.",
  A1: "VITA A1 — light natural ivory with a soft warm (slightly yellow-beige) tone. NOT bleach white.",
  A2: "VITA A2 — natural medium-light ivory with a visible warm yellowish tone, like healthy unbleached teeth. Do NOT make them white."
};
const FORMATOS = {
  natural: "keep each treated tooth's current outline and proportions; only smooth small irregularities",
  oval: "oval/rounded: softly rounded incisal corners and convex outlines (gentle, feminine look)",
  quadrado: "square: straight incisal edges, defined right-angle corners, parallel sides (strong, masculine look)",
  triangular: "triangular/tapered: wider at the incisal edge and narrower near the gum"
};
const COMPRIMENTO = {
  manter: "Keep the current length of every treated tooth.",
  pouco: "Make the treated teeth about 0.5–1 mm longer (a small but visible increase).",
  mais: "Make the treated teeth about 1.5–2 mm longer (clearly longer, more youthful smile)."
};
const TRANSLUCIDEZ = {
  natural: "Incisal edges with a subtle, natural translucency only at the very tip, blending gradually into the body color — no visible line, band or step across the teeth, and no grey or blue areas inside the tooth.",
  alta: "High incisal translucency: a visible bluish-grey translucent band at the biting edges (young, natural enamel).",
  baixa: "Low translucency: uniform, opaque color all the way to the edge (no translucent band)."
};
const INTENSIDADE = {
  sutil: "Overall intensity: SUBTLE — make only the requested changes, conservatively; the smile must stay clearly recognizable.",
  natural: "Overall intensity: NATURAL — apply the requested changes fully but keep a natural, believable look.",
  marcante: "Overall intensity: STRIKING — apply the requested changes boldly (still photorealistic, still ONLY on the treated teeth)."
};
/* [ordem quando marcado, ordem quando NÃO marcado] — valem só para os dentes tratados */
const AJUSTES = {
  diastemas: ["Close the gaps between the treated teeth so they touch (redistribute widths proportionally).",
              "KEEP every existing gap/diastema exactly as it is — do NOT close any space between teeth."],
  alinhar: ["Correct small rotations and misalignment of the treated teeth.",
            "Do NOT move, rotate or realign any tooth: every tooth keeps its current position and angle."],
  bordas: ["Level the incisal edges of the treated teeth into a smooth, symmetric curve.",
           "Keep the current incisal edge line."],
  desgastes: ["Repair chips, worn edges, stains and white spots on the treated teeth.",
              "On teeth that are NOT treated, keep their natural characteristics (spots, wear) exactly as they are."],
  harmonizar: ["ALSO whiten every other visible tooth (not in the treated list) to blend with the new shade — but do not change their shape or position.",
               ""]
};
const GENGIVA = {
  "": "Do NOT change the gums at all (same gum line, same shape, same amount of gum showing).",
  leve: "Gingivoplasty, mild: around the treated teeth only, level the gum margins and remove about 1 mm of excess gum where those teeth look short.",
  moderada: "Gingivoplasty, moderate: around the treated teeth only, remove about 2 mm of gum, showing longer crowns with a symmetric scalloped gum line."
};

const nomeDente = n => `${QUAD[Math.floor(n / 10)]} ${NOMES[n % 10]} (FDI ${n}; ${POSICAO[n % 10]}, on the ${LADO_IMG[Math.floor(n / 10)]} side)`;
const curto = n => `${QUAD[Math.floor(n / 10)]} ${NOMES[n % 10]} (${n})`;

export function montarPrompt(p) {
  const dentes = [...new Set((p.dentes || []).map(Number))].filter(n => DENTES_VALIDOS.has(n)).sort((a, b) => a - b);
  const proc = PROCEDIMENTOS[p.procedimento] ? p.procedimento : "lentes";
  if (!dentes.length) throw new Error("Selecione pelo menos um dente.");
  const soClarear = proc === "clareamento";
  const cor = CORES[p.cor] ? p.cor : "BL3";
  const ajustes = new Set((p.ajustes || []).filter(a => AJUSTES[a]));
  const notas = String(p.observacoes || "").replace(/\s+/g, " ").slice(0, 400);
  const naoTratados = VISIVEIS.filter(n => !dentes.includes(n));
  const sup = dentes.filter(n => n < 30), inf = dentes.filter(n => n >= 30);

  const linhas = [
    "Edit this dental photograph: a cosmetic dentistry simulation that must follow the dentist's plan below EXACTLY.",
    "Apply only what the plan asks for, and ONLY on the treated teeth listed. Everything else must stay exactly as it is in the photo.",
    "",
    "WHICH TEETH (most important rule):",
    `- Change EXACTLY ${dentes.length} tooth/teeth: ${dentes.map(nomeDente).join("; ")}.`,
    "- Orientation: the patient faces the camera, so the patient's RIGHT side is on the LEFT of the image. Count teeth from the midline (the line between the two front teeth).",
    naoTratados.length ? `- NOT treated: ${[
      ...[[sup, "upper", n => n < 30], [inf, "lower", n => n >= 30]].map(([trat, nome, daArcada]) =>
        trat.length ? naoTratados.filter(daArcada).map(curto).join(", ") : `ALL ${nome} teeth`)
    ].filter(Boolean).join("; ")}. ` + (ajustes.has("harmonizar")
      ? "These keep their exact shape, size, position and texture (only their color may be lightened, see the harmonize rule)."
      : "These must remain pixel-identical to the input: same color, shape, size, position, stains and texture.")
      : "- All visible teeth are treated.",
    dentes.length <= 4 ? `- Be careful: only ${dentes.length} tooth/teeth change. Neighbouring teeth must NOT receive the new color, material or shape.` : "",
    "",
    "TREATMENT PLAN FOR THE TREATED TEETH:",
    `1. Procedure: ${PROCEDIMENTOS[proc]}.`,
    `2. Color: ${CORES[cor]} All treated teeth share this same shade, evenly over each tooth, with only a soft natural gradation (slightly deeper near the gum). No blotches, no spots, no pearlescent, iridescent or bluish effect.`
  ].filter(l => l !== "");
  let i = 3;
  if (!soClarear) {
    /* lente/coroa cobre o dente: nada do esmalte antigo pode aparecer */
    linhas.push(`${i++}. Each treated tooth is COMPLETELY covered by the new restoration: no original stain, white spot, dark area, crack, old filling or color patch may remain visible on it — not even faintly.`);
    if (proc === "lentes" && MATERIAIS[p.material]) linhas.push(`${i++}. ${MATERIAIS[p.material]}`);
    if (proc === "implantes") linhas.push(`${i++}. ${MATERIAIS.porcelana} The new crowns must match the size and proportions of the neighbouring/opposite teeth.`);
    linhas.push(`${i++}. Tooth shape: ${FORMATOS[p.formato] || FORMATOS.natural}.`);
    linhas.push(`${i++}. Length: ${COMPRIMENTO[p.comprimento] || COMPRIMENTO.manter}`);
    linhas.push(`${i++}. ${TRANSLUCIDEZ[p.translucidez] || TRANSLUCIDEZ.natural}`);
  } else {
    linhas.push(`${i++}. Do NOT change any tooth's shape, size, length or position — only the color of the treated teeth.`);
  }
  for (const [id, [sim, nao]] of Object.entries(AJUSTES)) {
    if (soClarear && !["harmonizar", "desgastes"].includes(id)) continue;   // clareamento: forma e posição já travadas
    const t = ajustes.has(id) ? sim : nao;
    if (t) linhas.push(`${i++}. ${t}`);
  }
  linhas.push(`${i++}. Gums: ${GENGIVA[p.gengiva || ""] || GENGIVA[""]}`);
  linhas.push(`${i++}. ${INTENSIDADE[p.intensidade] || INTENSIDADE.natural}`);
  if (notas) linhas.push(`${i++}. Dentist's extra notes (may be in Portuguese) — follow them: "${notas}"`);

  linhas.push(
    "",
    "PHOTO RULES:",
    "- Keep EXACTLY the same framing, zoom, camera position and composition as the input image: the output must line up pixel-for-pixel with the input everywhere except the treated teeth. Do not crop, zoom, shift, rotate or re-render the photo.",
    "- Do NOT open or close the mouth, do NOT move the jaw, and do NOT change the lip contour.",
    `- Edit ONLY the treated teeth${p.gengiva ? " and the gum right around them" : ""}. Lips, skin, beard, face, expression, tongue, the other teeth, lighting, white balance, shadows, focus and background must stay identical.`,
    "- Photorealistic result, like a real clinical photo taken after treatment: realistic proportions, contact points, reflections and shadows matching the original lighting. Even the whitest shade must look lit by the SAME light as the rest of the photo, with visible enamel texture. No cartoon, no plastic or blurred teeth, no glow.",
    "",
    "Return only the edited photograph."
  );
  return linhas.join("\n");
}
