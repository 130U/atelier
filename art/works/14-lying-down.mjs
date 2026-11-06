import { hex, mix3, add3, mul3, smoothstep, hash, fbm, len } from '../lib.mjs';

const ang = 0.62;
const ca = Math.cos(ang);
const sa = Math.sin(ang);
const warmCore = hex('#ffe3be');
const coolEdge = hex('#97afff');

function stars(x, y, px, band) {
  let c = [0, 0, 0];
  for (const [s, seed, p, gain] of [
    [0.006, 1, 0.22, 0.35],
    [0.014, 2, 0.16, 0.9],
    [0.045, 3, 0.1, 2.6],
  ]) {
    const cx = Math.floor(x / s);
    const cy = Math.floor(y / s);
    const h = hash(cx, cy, seed);
    if (h > p * (1 + 1.8 * band)) continue;
    const ox = (cx + hash(cx, cy, seed + 10)) * s;
    const oy = (cy + hash(cx, cy, seed + 20)) * s;
    const d2 = (x - ox) ** 2 + (y - oy) ** 2;
    const b = gain * hash(cx, cy, seed + 30) ** 3;
    const col = mix3(hex('#c9d8ff'), hex('#ffe0b8'), hash(cx, cy, seed + 40));
    c = add3(c, col, b * (Math.exp(-d2 / (px * px * 1.2)) + 0.03 * Math.exp(-Math.sqrt(d2) / (px * 6))));
  }
  return c;
}

export default {
  title: 'Lying down',
  sentence: 'The stars, if you lie on your back far from any city.',
  size: [1500, 1000],
  look: { exposure: 1.15, grain: 0.03, vignette: 0.55, bloom: 0.5, threshold: 0.5, spread: 0.012 },
  shade(x, y, u, v, px) {
    const a = x * ca + y * sa;
    const q = -x * sa + y * ca + 0.04 * fbm(a * 1.5, 3, 3);
    const band = Math.exp(-((q / 0.17) ** 2));
    const cloud = smoothstep(-0.25, 0.65, fbm(a * 3.2, q * 5, 6)) * band;
    const lane = smoothstep(0.0, 0.35, fbm(a * 4 + 3.3 + 1.2 * fbm(a, q * 3, 3), q * 12, 5)) * Math.exp(-((q / 0.06) ** 2));
    let c = mix3(hex('#03050c'), hex('#0a1022'), band * 0.8);
    const glow = mix3(coolEdge, warmCore, Math.exp(-((q / 0.08) ** 2)));
    c = add3(c, glow, 0.16 * cloud * (1 - 0.85 * lane));
    c = add3(c, stars(x, y, px, band * (1 - lane)));

    const k0 = Math.floor(x / 0.005);
    for (let i = -2; i <= 2; i++) {
      const k = k0 + i;
      const edge = smoothstep(0.35, 0.75, Math.abs(x)) * 0.9 + 0.1;
      const h = (0.015 + 0.13 * hash(k, 0, 50) ** 2) * edge;
      const base = -0.5;
      const t = (y - base) / h;
      if (t < 0 || t > 1) continue;
      const bend = (hash(k, 1, 50) - 0.5) * 0.03 * t * t;
      const bx = (k + 0.5) * 0.005 + bend;
      const w = 0.0016 * (1 - t);
      if (Math.abs(x - bx) < w + px) return mix3(c, hex('#010102'), smoothstep(w + px, w - px, Math.abs(x - bx)));
    }
    return c;
  },
};
