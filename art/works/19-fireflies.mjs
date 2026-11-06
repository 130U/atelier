import { hex, mix3, add3, ramp, smoothstep, hash, fbm, len } from '../lib.mjs';

const horizon = -0.06;
const dusk = [
  [horizon, hex('#b56f55')],
  [0.06, hex('#5a4363')],
  [0.25, hex('#252a4c')],
  [0.5, hex('#0f1430')],
];
const glow = hex('#d9ff6e');
const treeline = (x) => horizon + 0.03 + 0.06 * fbm(x * 3, 2, 5) + 0.02 * fbm(x * 14, 5, 3);

export default {
  title: 'Fireflies',
  sentence: 'Fireflies over a field at the end of a summer day.',
  size: [1500, 1000],
  look: { exposure: 1.05, grain: 0.04, vignette: 0.45, bloom: 0.8, threshold: 0.35, spread: 0.015 },
  shade(x, y, u, v, px) {
    let c = ramp(dusk, y);
    const top = treeline(x);
    if (y < top + px) c = mix3(c, hex('#05070a'), smoothstep(top + px, top - px, y));
    if (y < horizon - 0.01) c = mix3(c, mix3(hex('#0c120c'), hex('#1b1f1a'), smoothstep(-0.5, horizon, y)), smoothstep(horizon - 0.01, horizon - 0.03, y));

    for (const [s, seed, p, r0, r1, gain, lo, hi] of [
      [0.03, 1, 0.3, 0.0012, 0.0022, 2.2, -0.3, 0.02],
      [0.07, 2, 0.28, 0.0025, 0.004, 2, -0.42, 0.08],
      [0.2, 3, 0.18, 0.01, 0.016, 0.18, -0.5, -0.1],
    ]) {
      const cx = Math.floor(x / s);
      const cy = Math.floor(y / s);
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) {
          const kx = cx + i;
          const ky = cy + j;
          if (hash(kx, ky, seed) > p) continue;
          const ox = (kx + hash(kx, ky, seed + 1)) * s;
          const oy = (ky + hash(kx, ky, seed + 2)) * s;
          if (oy < lo || oy > hi) continue;
          const r = r0 + (r1 - r0) * hash(kx, ky, seed + 3);
          const d = len(x - ox, y - oy);
          const on = hash(kx, ky, seed + 4) ** 1.5;
          const core = r1 > 0.01 ? smoothstep(r, r * 0.8, d) : Math.exp(-(d * d) / (r * r));
          c = add3(c, glow, gain * on * (core + 0.05 * Math.exp(-d / (r * 4))));
        }
    }

    const k0 = Math.floor(x / 0.004);
    for (let i = -2; i <= 2; i++) {
      const k = k0 + i;
      const h = 0.02 + 0.12 * hash(k, 0, 9) ** 2;
      const t = (y + 0.5) / h;
      if (t < 0 || t > 1) continue;
      const bx = (k + 0.5) * 0.004 + (hash(k, 1, 9) - 0.5) * 0.04 * t * t;
      const w = 0.0015 * (1 - t);
      if (Math.abs(x - bx) < w + px) c = mix3(c, hex('#020302'), smoothstep(w + px, w - px, Math.abs(x - bx)));
    }
    return c;
  },
};
