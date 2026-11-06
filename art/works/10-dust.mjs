import { hex, add3, mul3, mix3, smoothstep, hash, fbm, len } from '../lib.mjs';

const room = hex('#140e0a');
const sun = hex('#ffd2a0');
const ax = -0.95;
const ay = 0.62;
const bx = 0.32;
const by = -0.4;
const L = len(bx - ax, by - ay);
const dx = (bx - ax) / L;
const dy = (by - ay) / L;

// Distance along and across the beam from the window to the floor.
function beam(x, y) {
  const px = x - ax;
  const py = y - ay;
  const t = (px * dx + py * dy) / L;
  const q = Math.abs(-px * dy + py * dx);
  const w = 0.05 + 0.13 * t;
  return smoothstep(w, w * 0.55, q) * smoothstep(-0.02, 0.15, t) * smoothstep(1.06, 0.96, t);
}

export default {
  title: 'Dust',
  sentence: 'Dust turning in a beam of light in an empty room.',
  size: [1500, 1000],
  look: { exposure: 1, grain: 0.04, vignette: 0.45, bloom: 0.6, threshold: 0.55, spread: 0.02 },
  shade(x, y, u, v, px) {
    let c = mul3(room, 0.8 + 0.2 * fbm(x * 4, y * 4, 3));
    if (y < -0.38) {
      c = mul3(hex('#1a120c'), 0.9);
      const spot = smoothstep(0.24, 0.16, len((x - bx) * 0.8, (y - by) * 2.6));
      c = add3(c, sun, 0.55 * spot);
    }
    const m = beam(x, y);
    c = add3(c, sun, m * 0.2 * (0.75 + 0.5 * fbm(x * 3 + 4, y * 3, 4)));

    for (const [s, seed, size, gain] of [
      [0.011, 1, 0.0011, 3],
      [0.024, 2, 0.0022, 2.2],
      [0.07, 3, 0.007, 0.5],
    ]) {
      const cx = Math.floor(x / s);
      const cy = Math.floor(y / s);
      const h = hash(cx, cy, seed);
      if (h > 0.4) continue;
      const ox = (cx + hash(cx, cy, seed + 10)) * s;
      const oy = (cy + hash(cx, cy, seed + 20)) * s;
      const d = len(x - ox, y - oy);
      const r = size * (0.5 + hash(cx, cy, seed + 30));
      const mote = smoothstep(r + px, r * 0.3, d);
      c = add3(c, sun, mote * gain * beam(ox, oy) * (0.3 + 0.7 * hash(cx, cy, seed + 40)));
    }
    return c;
  },
};
