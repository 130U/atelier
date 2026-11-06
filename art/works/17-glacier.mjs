import { hex, mix3, add3, mul3, ramp, smoothstep, hash, noise, fbm, voronoi, len } from '../lib.mjs';

const ice = [
  [0, hex('#d4f8ff')],
  [0.18, hex('#6ad3ff')],
  [0.45, hex('#1278c4')],
  [0.75, hex('#063a7a')],
  [1, hex('#01122a')],
];

// Looking up from inside a crevasse: a slit of sky, and blue walls below it.
const slitX = (y) => 0.02 * noise(y * 3, 1) + 0.04 * (y - 0.5);
const slitHalf = (y) => Math.max(0, 0.05 * smoothstep(0.02, 0.5, y) ** 1.3 + 0.012 * fbm(y * 14, 3, 3));

export default {
  title: 'Only blue',
  sentence: 'Inside a glacier, where the only light that reaches you is blue.',
  size: [1000, 1250],
  look: { exposure: 1.05, grain: 0.03, vignette: 0.42, bloom: 0.6, threshold: 0.75, spread: 0.035 },
  shade(x, y, u, v, px) {
    const sx = slitX(y);
    const half = slitHalf(y);
    const from = Math.abs(x - sx) - half;
    if (from < 0 && y > 0.02) {
      return mix3(mul3(hex('#9fe4ff'), 2), mul3(hex('#f4fbff'), 3.4), smoothstep(0.05, 0.4, y));
    }

    const toSlit = len(Math.max(0, from) * 1.4, Math.max(0, 0.06 - y) * 0.9);
    const t = smoothstep(0, 0.75, toSlit + 0.15 * (0.5 - y) * 0.3);
    let c = ramp(ice, t);
    const curve = (x - sx) * (x - sx) * 1.8;
    const strata = Math.sin((y + curve + 0.035 * fbm(x * 3, y * 2, 3)) * 120) * 0.5 + 0.5;
    c = mul3(c, 0.9 + 0.14 * strata ** 4);
    const dirt = smoothstep(0.992, 1, Math.sin((y + curve + 0.03 * fbm(x * 2, 9, 3)) * 19 + 1.3));
    c = mul3(c, 1 - 0.4 * dirt);
    const { f1 } = voronoi(x * 22, y * 13, 3);
    c = mul3(c, 0.86 + 0.24 * f1);

    const s = 0.011;
    const bx = Math.floor(x / s);
    const by = Math.floor(y / s);
    if (hash(bx, by, 4) < 0.18) {
      const d = len(x - (bx + hash(bx, by, 5)) * s, y - (by + hash(bx, by, 6)) * s);
      c = add3(c, hex('#e9fbff'), 0.3 * smoothstep(0.0022, 0.0005, d) * (1 - t));
    }
    c = add3(c, hex('#c8f3ff'), 0.9 * Math.exp(-Math.max(0, from) * 55) * smoothstep(-0.1, 0.4, y));
    return c;
  },
};
