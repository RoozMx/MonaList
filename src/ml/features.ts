import { CFG } from '../config';

// Vector invariante a posición y tamaño: puntos relativos a la muñeca,
// escalados por la distancia muñeca → base del dedo medio (landmark 9).
// Hasta 2 manos (ordenadas por x) + desplazamiento relativo entre muñecas.
export function extractFeatures(hands: number[][]): number[] {
  const hs = [...hands].sort((a, b) => a[0] - b[0]).slice(0, 2);
  const out = new Array(CFG.FEATURE_LEN).fill(0);
  const size = (h: number[]) =>
    Math.hypot(h[27] - h[0], h[28] - h[1], h[29] - h[2]) || 1;

  hs.forEach((h, i) => {
    const s = size(h);
    for (let j = 0; j < 21; j++) {
      const o = i * 63 + j * 3;
      out[o]     = (h[j * 3]     - h[0]) / s;
      out[o + 1] = (h[j * 3 + 1] - h[1]) / s;
      out[o + 2] = (h[j * 3 + 2] - h[2]) / s;
    }
  });

  if (hs.length === 2) {
    const s0 = size(hs[0]);
    out[126] = (hs[1][0] - hs[0][0]) / s0;
    out[127] = (hs[1][1] - hs[0][1]) / s0;
    out[128] = (hs[1][2] - hs[0][2]) / s0;
  }
  return out;
}

export const flipX = (h: number[]) => h.map((v, i) => (i % 3 === 0 ? 1 - v : v));