/* Gera os ícones PNG do app (192 e 512) sem dependências externas.
   Desenho: quadrado preto arredondado com o "D" da marca em off-white. */
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const crcTab = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTab[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(tipo, dados) {
  const t = Buffer.from(tipo), len = Buffer.alloc(4), c = Buffer.alloc(4);
  len.writeUInt32BE(dados.length); c.writeUInt32BE(crc(Buffer.concat([t, dados])));
  return Buffer.concat([len, t, dados, c]);
}
function png(S, pixel) {
  const raw = Buffer.alloc((S * 4 + 1) * S);
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0;
    for (let x = 0; x < S; x++) {
      /* 4x4 superamostragem para bordas suaves */
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const p = pixel((x + (sx + 0.5) / 4) / S * 512, (y + (sy + 0.5) / 4) / S * 512);
        r += p[0] * p[3]; g += p[1] * p[3]; b += p[2] * p[3]; a += p[3];
      }
      const o = y * (S * 4 + 1) + 1 + x * 4;
      raw[o] = a ? r / a : 0; raw[o + 1] = a ? g / a : 0; raw[o + 2] = a ? b / a : 0; raw[o + 3] = a / 16 * 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const PRETO = [21, 23, 25, 1], CLARO = [244, 244, 240, 1], NADA = [0, 0, 0, 0];
/* mesmo desenho de public/icons/icon.svg: "D" claro com corte curvo no pé da haste */
const bez = (t, a, b, c, d) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;
const CORTE = Array.from({ length: 81 }, (_, i) => [bez(i / 80, 128, 146, 182, 250), bez(i / 80, 226, 300, 336, 336)]);
const distSeg = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
const meioD = (x, y, x0, y0, y1, r) => (x >= x0 && x <= 258 && y >= y0 && y <= y1) || (x > 258 && Math.hypot(x - 258, y - 256) <= r);
function letraD(x, y) {
  if (!meioD(x, y, 144, 116, 396, 140)) return false;
  if (x < 200 && y > 340 && Math.hypot(x - 200, y - 340) > 56) return false; /* canto inferior arredondado */
  if (meioD(x, y, 226, 192, 320, 64)) return false;                          /* miolo */
  for (let i = 1; i < CORTE.length; i++) if (distSeg(x, y, ...CORTE[i - 1], ...CORTE[i]) < 17) return false;
  return true;
}
function pixel(x, y) {
  const R = 112, cx = Math.max(R, Math.min(512 - R, x)), cy = Math.max(R, Math.min(512 - R, y));
  if (Math.hypot(x - cx, y - cy) > R) return NADA;
  return letraD(x, y) ? CLARO : PRETO;
}

mkdirSync("public/icons", { recursive: true });
for (const s of [192, 512]) writeFileSync(`public/icons/icon-${s}.png`, png(s, pixel));
console.log("Ícones gerados em public/icons/");
