import { hex, mix3, add3, mul3, smoothstep, fbm, len } from '../lib.mjs';

const fy = 0.03;
const warm = hex('#ffae62');
const wax = hex('#f1e4cc');
const wall = hex('#2a1a10');
const table = hex('#4a2e1a');
const top = -0.012;
const floorY = -0.37;
const halfW = 0.072;

// How much candlelight reaches a point, falling off with distance.
const reach = (x, y) => 0.0045 / ((x * x + (y - fy - 0.04) ** 2) + 0.004);

export default {
  title: 'Past its reach',
  sentence: 'A candle in a dark room; everything past its reach is a guess.',
  size: [1000, 1250],
  look: { exposure: 1, grain: 0.035, vignette: 0.45, bloom: 0.7, threshold: 0.8, spread: 0.03 },
  shade(x, y, u, v, px) {
    const L = reach(x, y);
    let c = mul3(wall, L * (0.7 + 0.3 * fbm(x * 6, y * 6, 4)));

    if (y < floorY) {
      const grain = 0.8 + 0.2 * fbm(x * 3, y * 60, 3);
      c = mul3(table, L * 1.3 * grain);
      c = add3(c, warm, 0.05 * Math.exp(-(x * x) * 600) * smoothstep(-0.5, floorY, y));
    }

    if (Math.abs(x) < halfW + px && y < top && y > floorY - 0.01) {
      const side = Math.sqrt(Math.max(0, 1 - (x / halfW) ** 2));
      const glow = Math.exp(-(top - y) * 7);
      const lip = Math.exp(-(top - y) * 26);
      let body = mul3(wax, (0.012 + 0.07 * L + 0.45 * glow * glow) * (0.3 + 0.7 * side));
      body = add3(body, warm, 0.5 * lip * (0.6 + 0.4 * side));
      const cover = smoothstep(halfW + px, halfW - px, Math.abs(x)) * smoothstep(top + px, top - px, y);
      c = mix3(c, body, cover);
    }

    if (Math.abs(x) < 0.0026 && y > top - 0.002 && y < fy + 0.012) c = mix3(c, hex('#120a06'), 0.9);

    const t = (y - fy) / 0.12;
    const width = 0.019 * Math.sin(Math.PI * Math.min(1, Math.max(0, t)) ** 0.62);
    const e = t > 0 && t < 1 ? Math.abs(x + 0.004 * t * t) / Math.max(width, 1e-4) : 9;
    const flame = smoothstep(1.05, 0.7, e);
    if (flame > 0) {
      const core = smoothstep(0.75, 0.15, e) * smoothstep(0.95, 0.35, t);
      let f = mix3(hex('#ff7a1c'), hex('#ffd27a'), smoothstep(0.9, 0.4, e));
      f = mix3(f, hex('#fff6e2'), core);
      f = mix3(f, hex('#3a62ff'), smoothstep(0.18, 0.02, t) * 0.7);
      c = add3(c, mul3(f, 6), flame);
    }
    c = add3(c, warm, 0.00028 / (x * x + (y - fy - 0.05) ** 2 + 0.00012));
    return c;
  },
};
