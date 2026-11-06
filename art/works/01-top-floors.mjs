import { hex, mix3, add3, mul3, ramp, smoothstep, hash, noise, rng, fract } from '../lib.mjs';

const sky = [
  [-0.24, hex('#f1a070')],
  [-0.04, hex('#d48d8a')],
  [0.12, hex('#64699a')],
  [0.5, hex('#0f173a')],
];
const sun = hex('#ff8f45');
const lamp = hex('#ffc27a');

const r = rng(23);
function skyline(x0, x1, minW, maxW, minTop, maxTop, bias) {
  const out = [];
  for (let x = x0; x < x1; ) {
    const w = minW + r() * (maxW - minW);
    out.push({ x0: x, x1: x + w, top: minTop + r() ** bias * (maxTop - minTop), tone: r(), seed: out.length + 1 });
    x += w + (r() < 0.3 ? r() * 0.03 : 0.002);
  }
  return out;
}
const far = skyline(-0.8, 0.8, 0.02, 0.06, -0.3, -0.12, 1.2);
const near = skyline(-0.8, 0.8, 0.045, 0.13, -0.42, 0.2, 2.6);
const find = (list, x) => list.find((b) => x >= b.x0 && x < b.x1);

// Only what rises above the shadow of the western blocks still holds the sun.
const shadowLine = (x) => -0.02 + 0.04 * noise(x * 2.1, 4.1);

export default {
  title: 'Top floors',
  sentence: 'The last light of the day, held only by the top floors of a city.',
  size: [1500, 1000],
  look: { exposure: 1, grain: 0.03, vignette: 0.35, bloom: 0.55, threshold: 0.55, spread: 0.018 },
  shade(x, y, u, v, px) {
    let c = ramp(sky, y);
    c = add3(c, sun, 0.4 * Math.exp(-((x - 0.5) ** 2) * 4 - (y + 0.16) ** 2 * 30));

    const f = find(far, x);
    if (f && y < f.top + px) {
      const cover = smoothstep(f.top + px, f.top - px, y);
      c = mix3(c, mix3(hex('#1a1f3a'), c, 0.32 + 0.12 * f.tone), cover);
    }

    let b = find(near, x);
    // Tall towers step back near the top.
    if (b && b.top > 0.02 && y > b.top - 0.05) {
      const inset = (b.x1 - b.x0) * 0.18;
      if (x < b.x0 + inset || x > b.x1 - inset) b = null;
    }
    if (b && y < b.top + px) {
      const cover =
        smoothstep(b.top + px, b.top - px, y) * smoothstep(b.x0 - px, b.x0 + px, x) * smoothstep(b.x1 + px, b.x1 - px, x);
      const haze = smoothstep(-0.5, 0.25, y) * 0.25;
      let bc = mix3(mix3(hex('#05080f'), hex('#0b1020'), b.tone), ramp(sky, y), haze * 0.5);
      const lit = smoothstep(shadowLine(x), shadowLine(x) + 0.03, y);
      const face = 0.55 + 0.45 * smoothstep(b.x0, b.x1, x);
      bc = add3(bc, sun, 0.62 * lit * face);

      const wx = (x - b.x0) / 0.009;
      const wy = (y + 0.5) / 0.014;
      const fx = fract(wx);
      const fy = fract(wy);
      const pane = smoothstep(0.28, 0.36, fx) * smoothstep(0.72, 0.64, fx) * smoothstep(0.3, 0.38, fy) * smoothstep(0.7, 0.62, fy);
      const inset = smoothstep(1, 2, wx) * smoothstep(1, 2, (b.x1 - x) / 0.009) * smoothstep(1, 2, (b.top - y) / 0.014);
      const h = hash(b.seed, Math.floor(wx), Math.floor(wy));
      let win = mix3(bc, ramp(sky, y + 0.25), 0.12);
      if (h < 0.045) win = mul3(lamp, 0.35 + h * 10);
      if (lit > 0 && h > 0.6) win = add3(win, sun, 2.6 * lit);
      c = mix3(c, mix3(bc, win, pane * inset), cover);
    }

    c = add3(c, hex('#ff9d5c'), 0.06 * smoothstep(-0.3, -0.5, y));
    return c;
  },
};
