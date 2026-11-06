import { hex, mix3, add3, mul3, ramp, smoothstep, hash, noise, fbm, fract, len } from '../lib.mjs';

const horizon = -0.04;
const sky = [
  [horizon, hex('#1c2a44')],
  [0.1, hex('#0d1630')],
  [0.5, hex('#050918')],
];
const lamp = hex('#ffb45a');
const hx = -0.215;

// Pines along the far edge, each a narrow triangle.
function treeline(x) {
  const k = Math.floor(x * 70);
  const t = fract(x * 70);
  const h = 0.012 + 0.03 * hash(k, 0, 5) ** 1.5;
  return horizon + 0.012 * fbm(x * 6, 1, 3) + h * (1 - Math.abs(t - 0.5) * 2);
}

export default {
  title: 'One lamp',
  sentence: 'A single lamp left on in a house across the snow.',
  size: [1500, 1000],
  look: { exposure: 1.05, grain: 0.035, vignette: 0.4, bloom: 0.8, threshold: 0.6, spread: 0.02 },
  shade(x, y, u, v, px) {
    if (y > horizon) {
      let c = ramp(sky, y);
      const s = 0.02;
      const cx = Math.floor(x / s);
      const cy = Math.floor(y / s);
      const h = hash(cx, cy, 2);
      if (h < 0.1) {
        const d = len(x - (cx + hash(cx, cy, 3)) * s, y - (cy + hash(cx, cy, 4)) * s);
        c = add3(c, hex('#dfe7ff'), (h / 0.1) ** 5 * 0.7 * Math.exp(-(d * d) / (px * px * 1.3)));
      }
      const top = treeline(x);
      if (y < top + px) c = mix3(c, hex('#04060b'), smoothstep(top + px, top - px, y));

      const inHouse = x > hx - 0.03 && x < hx + 0.032 && y < horizon + 0.026 + (0.016 - Math.abs(x - hx - 0.001) * 0.55);
      if (inHouse) c = hex('#06080e');
      const win = smoothstep(0.0065, 0.0045, Math.abs(x - hx + 0.008)) * smoothstep(0.0062, 0.0042, Math.abs(y - horizon - 0.011));
      c = mix3(c, mul3(lamp, 7), win);
      c = add3(c, lamp, 0.00004 / ((x - hx + 0.008) ** 2 + (y - horizon - 0.011) ** 2 + 0.00003));
      return c;
    }
    const depth = horizon - y;
    const s = 1 / (depth + 0.02);
    let c = mix3(hex('#26334f'), hex('#3c4b6c'), smoothstep(0, 0.45, depth));
    c = mul3(c, 0.9 + 0.12 * fbm(x * s * 0.9, s * 0.35, 4) + 0.04 * noise(x * s * 6, s * 2));
    c = add3(c, lamp, 0.12 * Math.exp(-(((x - hx + 0.008) / (0.01 + depth * 0.25)) ** 2)) * Math.exp(-depth * 9));
    c = add3(c, lamp, 0.004 / (len(x - hx, (y - horizon) * 3) * 40 + 0.4));
    return c;
  },
};
