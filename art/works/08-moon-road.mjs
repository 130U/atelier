import { hex, add3, mul3, ramp, smoothstep, hash, noise, fbm, len } from '../lib.mjs';

const horizon = -0.09;
const mx = 0.17;
const my = 0.24;
const R = 0.034;
const moon = hex('#f3ead2');
const night = [
  [horizon, hex('#1f2a49')],
  [0.08, hex('#0e1531')],
  [0.5, hex('#04071a')],
];

function stars(x, y, px) {
  const s = 0.018;
  const cx = Math.floor(x / s);
  const cy = Math.floor(y / s);
  const h = hash(cx, cy, 3);
  if (h > 0.16) return 0;
  const sx = (cx + hash(cx, cy, 4)) * s;
  const sy = (cy + hash(cx, cy, 5)) * s;
  const d2 = (x - sx) ** 2 + (y - sy) ** 2;
  return (h / 0.16) ** 6 * 0.9 * Math.exp(-d2 / (px * px * 1.4));
}

export default {
  title: 'Moon road',
  sentence: 'The moon on calm water, broken into a road of light.',
  size: [1500, 1000],
  look: { exposure: 1.05, grain: 0.03, vignette: 0.4, bloom: 0.6, threshold: 0.6, spread: 0.025 },
  shade(x, y, u, v, px) {
    if (y >= horizon) {
      let c = ramp(night, y);
      const d = len(x - mx, y - my);
      c = add3(c, moon, 0.22 * Math.exp(-d * 7) + 0.5 * Math.exp(-d * 30));
      const disc = smoothstep(R + px, R - px, d);
      const maria = 0.86 + 0.14 * fbm((x - mx) * 40, (y - my) * 40, 3);
      c = add3(c, moon, disc * 2.4 * maria);
      c = add3(c, moon, stars(x, y, px) * (1 - smoothstep(0, 0.2, 0.25 - d)));
      c = add3(c, hex('#3a4566'), Math.exp(-(y - horizon) * 40) * 0.25);
      return c;
    }
    const depth = horizon - y;
    const s = 1 / (depth + 0.012);
    let c = mul3(ramp(night, horizon + depth * 0.4), 0.38);
    const n = noise((x - mx) * s * 7, s * 10) * 0.6 + noise((x - mx) * s * 16, s * 23) * 0.4;
    const width = 0.012 + depth * 0.5;
    const path = Math.exp(-(((x - mx) / width) ** 2));
    const glint = smoothstep(0.25, 0.6, n) * path + smoothstep(0.6, 0.75, n) * 0.06;
    c = add3(c, moon, glint * (1.5 - depth * 1.6));
    c = add3(c, moon, Math.exp(-depth * 60) * 0.05);
    return c;
  },
};
