import { hex, mix3, add3, mul3, smoothstep, fbm, voronoi, fract } from '../lib.mjs';

const shallow = hex('#86d9e3');
const deep = hex('#1f7fa8');
const lane = hex('#14366b');
const light = hex('#f2ffff');

// Light focused by a moving surface: bright where cells of the warped field meet.
function caustic(x, y, scale, seed) {
  const wx = x * scale + 2.2 * fbm(x * 2.6 + seed, y * 2.6, 4);
  const wy = y * scale + 2.2 * fbm(x * 2.6, y * 2.6 + seed, 4);
  const { f1, f2 } = voronoi(wx, wy, seed);
  return Math.exp(-(f2 - f1) * 26);
}

export default {
  title: 'Noon pool',
  sentence: 'A swimming pool at noon, light shaking on the bottom.',
  size: [1500, 1000],
  look: { exposure: 1, grain: 0.02, vignette: 0.25, bloom: 0.35, threshold: 0.9, spread: 0.01 },
  shade(x, y) {
    const rx = x + 0.012 * fbm(x * 4 + 3.1, y * 4, 3);
    const ry = y + 0.012 * fbm(x * 4, y * 4 + 8.7, 3);
    let c = mix3(shallow, deep, smoothstep(-0.75, 0.8, rx + ry * 0.4));

    const t = 0.055;
    const gx = Math.abs(fract(rx / t) - 0.5);
    const gy = Math.abs(fract(ry / t) - 0.5);
    const grout = smoothstep(0.455, 0.49, Math.max(gx, gy));
    c = mix3(c, mul3(c, 1.35), grout * 0.7);

    const stripe = smoothstep(0.03, 0.025, Math.abs(ry + 0.02)) * smoothstep(0.585, 0.575, rx);
    const tee = smoothstep(0.016, 0.011, Math.abs(rx - 0.58)) * smoothstep(0.12, 0.11, Math.abs(ry + 0.02));
    c = mix3(c, mix3(lane, c, 0.25), Math.max(stripe, tee));

    const strength = 0.6 + 0.4 * fbm(x * 1.3 + 5, y * 1.3, 3);
    const k = (caustic(x, y, 11, 1) * 0.6 + caustic(x + 0.3, y - 0.2, 19, 5) * 0.4) * strength;
    c = mul3(c, 0.72 + 0.4 * k);
    c = add3(c, light, k ** 1.8 * 1.4);
    return c;
  },
};
