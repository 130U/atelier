import { hex, mix3, add3, mul3, smoothstep, hash, fbm, len } from '../lib.mjs';

const sunX = 0.26;
const sunY = 0.16;
const sky = hex('#fff6d8');

// One leaf per cell: a pointed oval, turned at random, lit from behind.
// Leaves gather in clusters, so the canopy keeps its gaps.
function leafLayer(x, y, s, p, seed, cluster) {
  const cx0 = Math.floor(x / s);
  const cy0 = Math.floor(y / s);
  let best = 0;
  let vein = 0;
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const cx = cx0 + i;
      const cy = cy0 + j;
      const ox = (cx + 0.5 + 0.6 * (hash(cx, cy, seed + 1) - 0.5)) * s;
      const oy = (cy + 0.5 + 0.6 * (hash(cx, cy, seed + 2) - 0.5)) * s;
      const density = p * smoothstep(-0.15, 0.35, fbm(ox * cluster + seed, oy * cluster, 3));
      if (hash(cx, cy, seed) > density) continue;
      const a = hash(cx, cy, seed + 3) * Math.PI;
      const L = s * (0.6 + 0.45 * hash(cx, cy, seed + 4));
      const lx = ((x - ox) * Math.cos(a) + (y - oy) * Math.sin(a)) / L;
      const ly = (-(x - ox) * Math.sin(a) + (y - oy) * Math.cos(a)) / L;
      if (Math.abs(lx) > 1) continue;
      const w = 0.36 * (1 - lx * lx) * (1 + 0.15 * lx);
      const m = smoothstep(w + 0.025, w - 0.025, Math.abs(ly));
      if (m > best) {
        best = m;
        vein = smoothstep(0.025, 0, Math.abs(ly)) * (1 - Math.abs(lx)) + 0.4 * smoothstep(0.02, 0, Math.abs(Math.abs(ly) - Math.abs(lx - 0.1) * 0.25 - 0.02) - 0.0) * smoothstep(0.9, 0.2, Math.abs(lx));
      }
    }
  return [best, Math.min(1, vein)];
}

export default {
  title: 'Underneath',
  sentence: 'Leaves backlit by the sun, seen from underneath.',
  size: [1500, 1000],
  look: { exposure: 0.95, grain: 0.03, vignette: 0.36, bloom: 0.75, threshold: 1, spread: 0.04 },
  shade(x, y) {
    const sd = len(x - sunX, y - sunY);
    let c = mul3(mix3(sky, hex('#cfe3f2'), smoothstep(0.2, 0.9, sd)), 1.5 + 7 * Math.exp(-sd * 13));

    const backlight = 0.5 + 1.1 * Math.exp(-sd * 3);
    for (const [s, p, seed, cluster, filter] of [
      [0.17, 0.85, 30, 1.1, [0.1, 0.16, 0.03]],
      [0.11, 0.9, 20, 1.6, [0.42, 0.6, 0.09]],
      [0.075, 0.92, 10, 2.1, [0.72, 0.9, 0.18]],
    ]) {
      const [m, vein] = leafLayer(x, y, s, p, seed, cluster);
      if (m <= 0) continue;
      const k = backlight * (1 + 0.5 * vein);
      c = mix3(c, [c[0] * filter[0] * k * 0.8, c[1] * filter[1] * k * 0.8, c[2] * filter[2] * k * 0.8], m);
    }
    const flare = Math.abs(Math.cos(Math.atan2(y - sunY, x - sunX) * 6)) ** 60 * Math.exp(-sd * 5);
    c = add3(c, sky, flare * 1.2);
    return c;
  },
};
