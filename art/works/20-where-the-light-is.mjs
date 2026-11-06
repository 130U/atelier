import { hex, mix3, add3, mul3, smoothstep, hash, fbm, len } from '../lib.mjs';

const night = hex('#05070d');
const lamp = hex('#ffd29a');
const lx = 0.12;
const ly = 0.345;
const groundY = -0.38;

// How much of the lamp's cone reaches a point.
function cone(x, y) {
  const dx = x - lx;
  const dy = ly - y;
  if (dy <= 0) return 0;
  const a = Math.atan2(Math.abs(dx), dy);
  return (0.06 + 0.94 * smoothstep(0.62, 0.18, a) ** 1.5) / (1 + len(dx, dy) * 2.6);
}

export default {
  title: 'Where the light is',
  sentence: 'Snow falling past a streetlight, visible only where the light is.',
  size: [1000, 1250],
  look: { exposure: 1.05, grain: 0.035, vignette: 0.45, bloom: 0.65, threshold: 0.5, spread: 0.02 },
  shade(x, y, u, v, px) {
    let c = mul3(night, 0.9 + 0.2 * fbm(x * 3, y * 3, 3));
    const k = cone(x, y);
    c = add3(c, lamp, 0.07 * k);

    if (y < groundY) {
      c = mix3(hex('#121826'), hex('#1b2232'), fbm(x * 8, y * 30, 3) * 0.5 + 0.5);
      const pool = Math.exp(-(((x - lx) / 0.28) ** 2) - (((y - groundY + 0.06) / 0.07) ** 2));
      c = add3(c, lamp, 0.35 * pool * (0.85 + 0.15 * fbm(x * 40, y * 40, 2)));
    }

    for (const [s, seed, p, w, l, gain] of [
      [0.02, 1, 0.42, 0.0011, 0.008, 1.7],
      [0.037, 2, 0.4, 0.002, 0.016, 1.5],
      [0.12, 3, 0.3, 0.009, 0.03, 0.3],
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
          if (oy < groundY) continue;
          const drift = (hash(kx, ky, seed + 3) - 0.5) * 0.6;
          const ax = x - ox - drift * (y - oy);
          const ay = Math.max(0, Math.abs(y - oy) - l / 2);
          const d = len(ax, ay);
          const flake = w > 0.005 ? smoothstep(w, w * 0.4, d) : Math.exp(-(d * d) / (w * w));
          c = add3(c, lamp, gain * flake * cone(ox, oy) * (0.4 + 0.6 * hash(kx, ky, seed + 4)));
        }
    }

    const pole = smoothstep(0.006, 0.0045, Math.abs(x - 0.33)) * (y < 0.38 ? 1 : 0);
    const arm = smoothstep(0.004, 0.0025, Math.abs(y - 0.375)) * (x > lx - 0.01 && x < 0.335 ? 1 : 0);
    const head = smoothstep(0.03, 0.026, Math.abs(x - lx)) * smoothstep(0.014, 0.01, Math.abs(y - ly - 0.014));
    c = mix3(c, hex('#020203'), Math.max(pole, arm, head));
    c = add3(c, lamp, 0.00006 / ((x - lx) ** 2 + (y - ly) ** 2 + 0.00002));
    return c;
  },
};
