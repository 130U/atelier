import { hex, mix3, add3, mul3, ramp, smoothstep, hash, noise, fbm, len } from '../lib.mjs';

const lake = -0.15;
const sky = [
  [lake, hex('#0a1a24')],
  [0.15, hex('#050f19')],
  [0.5, hex('#02050b')],
];
const green = hex('#46ffa8');
const violet = hex('#8f6bff');

const ridgeline = (x) => lake + 0.03 + 0.045 * fbm(x * 2.2 + 3, 0.5, 4) + 0.015 * fbm(x * 9, 2, 3);

// A ribbon: a sharp lower hem, rays rising from it, fading with height.
function curtain(x, y, k) {
  const hem = 0.04 + 0.16 * fbm(x * 0.7 + k * 3.7, k, 4) + 0.08 * k;
  const dy = y - hem;
  if (dy < -0.015) return null;
  const height = 0.07 + 0.08 * (fbm(x * 1.3, k + 4, 3) + 0.5);
  const body = Math.exp(-Math.max(0, dy) / height) * smoothstep(-0.012, 0.006, dy);
  const rays = 0.55 + 0.45 * noise(x * 70 + 6 * fbm(x * 2.5, k, 3), dy * 0.8 + k);
  const fold = smoothstep(-0.1, 0.5, fbm(x * 1.6 + k * 5, 2 + k, 3));
  return mul3(mix3(green, violet, smoothstep(0.03, 0.2, dy)), body * rays * fold);
}

function above(x, y, px) {
  let c = ramp(sky, y);
  const s = 0.016;
  const cx = Math.floor(x / s);
  const cy = Math.floor(y / s);
  const h = hash(cx, cy, 6);
  if (h < 0.12) {
    const d = len(x - (cx + hash(cx, cy, 7)) * s, y - (cy + hash(cx, cy, 8)) * s);
    c = add3(c, hex('#e2ecff'), (h / 0.12) ** 5 * 0.8 * Math.exp(-(d * d) / (px * px * 1.4)));
  }
  for (const [k, gain, shift] of [
    [0, 0.85, 0],
    [1, 0.4, 0.5],
  ]) {
    const a = curtain(x + shift, y, k);
    if (a) c = add3(c, a, gain);
  }
  const top = ridgeline(x);
  if (y < top + px) c = mix3(c, hex('#03070a'), smoothstep(top + px, top - px, y));
  return c;
}

export default {
  title: 'Aurora',
  sentence: 'The aurora over a frozen lake, and its reflection, a little darker.',
  size: [1500, 1000],
  look: { exposure: 1.05, grain: 0.035, vignette: 0.42, bloom: 0.55, threshold: 0.35, spread: 0.035 },
  shade(x, y, u, v, px) {
    if (y >= lake) return above(x, y, px);
    const depth = lake - y;
    const wobble = 0.003 * noise(x * 30, depth * 60);
    let c = mul3(above(x + wobble, lake + depth, px), 0.38 + 0.08 * fbm(x * 4, depth * 30, 3));
    const snow = smoothstep(0.2, 0.55, fbm(x * 2.5 + 9, y * 14, 4)) * smoothstep(0.02, 0.25, depth);
    c = mix3(c, hex('#1a2633'), snow * 0.5);
    return c;
  },
};
