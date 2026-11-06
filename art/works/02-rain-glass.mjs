import { hex, mix3, add3, mul3, ramp, smoothstep, hash, noise, fbm, len } from '../lib.mjs';

const lights = ['#ffb14a', '#ffc879', '#ffe3b5', '#ff5b45', '#ffb14a', '#7fd8cc'].map(hex);
const night = [
  [-0.5, hex('#1c140f')],
  [-0.12, hex('#0e1019')],
  [0.5, hex('#05060b')],
];

// The street, out of focus: every lamp and window becomes a disc.
function street(x, y) {
  let c = ramp(night, y);
  for (const [s, r0, r1, seed, gain, peak] of [
    [0.14, 0.04, 0.09, 1, 0.9, 0.55],
    [0.07, 0.016, 0.032, 9, 0.7, 0.22],
  ]) {
    const cx0 = Math.floor(x / s);
    const cy0 = Math.floor(y / s);
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const cx = cx0 + i;
        const cy = cy0 + j;
        const h = hash(cx, cy, seed);
        const py = (cy + 0.5) * s;
        const density = 0.01 + peak * Math.exp(-(((py + 0.1) / 0.13) ** 2));
        if (h > density) continue;
        const ox = (cx + 0.15 + 0.7 * hash(cx, cy, seed + 1)) * s;
        const oy = (cy + 0.15 + 0.7 * hash(cx, cy, seed + 2)) * s;
        const rad = r0 + (r1 - r0) * hash(cx, cy, seed + 3);
        const d = len(x - ox, y - oy);
        if (d > rad * 1.05) continue;
        const disc = smoothstep(rad, rad * 0.8, d) * (0.75 + 0.25 * smoothstep(rad * 0.4, rad, d));
        const col = lights[Math.floor(hash(cx, cy, seed + 4) * lights.length)];
        c = add3(c, col, disc * gain * 0.55 * (0.2 + 0.8 * hash(cx, cy, seed + 5) ** 2));
      }
  }
  return c;
}

export default {
  title: 'Rain glass',
  sentence: 'Rain on a window at night, and the street behind it dissolving into colour.',
  size: [1500, 1000],
  look: { exposure: 1.1, grain: 0.035, vignette: 0.35, bloom: 0.45, threshold: 0.5, spread: 0.02 },
  shade(x, y, u, v, px) {
    let c = street(x, y);
    c = mix3(c, hex('#20242e'), 0.12 + 0.08 * fbm(x * 3, y * 3, 3));

    // Trails where drops have already run down the glass.
    const ts = 0.07;
    const col = Math.floor(x / ts);
    for (let i = -1; i <= 1; i++) {
      const k = col + i;
      if (hash(k, 0, 21) > 0.4) continue;
      const tx = (k + 0.2 + 0.6 * hash(k, 1, 21)) * ts + 0.006 * noise(y * 14, k);
      const end = -0.5 + hash(k, 2, 21) * 0.9;
      const w = 0.0025 + 0.003 * hash(k, 3, 21);
      if (y > end && Math.abs(x - tx) < w) {
        const t = 1 - Math.abs(x - tx) / w;
        c = mix3(c, mul3(street(x + (x - tx) * 2, y), 1.2), smoothstep(0, 0.4, t) * 0.9);
      }
    }

    // Drops: each one a small lens showing the street upside down.
    const s = 0.042;
    const cx0 = Math.floor(x / s);
    const cy0 = Math.floor(y / s);
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const cx = cx0 + i;
        const cy = cy0 + j;
        if (hash(cx, cy, 31) > 0.3) continue;
        const ox = (cx + 0.2 + 0.6 * hash(cx, cy, 32)) * s;
        const oy = (cy + 0.2 + 0.6 * hash(cx, cy, 33)) * s;
        const rad = 0.004 + 0.019 * hash(cx, cy, 34) ** 1.8;
        const d = len(x - ox, (y - oy) * 1.12);
        if (d > rad + px) continue;
        const cover = smoothstep(rad + px, rad - px, d);
        let drop = mul3(street(ox - (x - ox) * 4.5, oy - (y - oy) * 4.5 - 0.1), 1.6);
        drop = add3(drop, c, 0.35);
        drop = mul3(drop, 1 - 0.35 * smoothstep(rad * 0.6, rad, d));
        drop = add3(drop, hex('#ffffff'), 0.25 * smoothstep(rad * 0.16, 0, len(x - ox + rad * 0.3, y - oy - rad * 0.34)));
        c = mix3(c, drop, cover);
      }
    return c;
  },
};
