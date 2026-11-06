import { hex, add3, mul3, ramp, smoothstep, noise, fbm } from '../lib.mjs';

const air = [
  [-0.5, hex('#76808f')],
  [-0.12, hex('#b4a6ad')],
  [0.02, hex('#efd5c6')],
  [0.18, hex('#d4c4cb')],
  [0.5, hex('#a9abc0')],
];
const peach = hex('#ffc9a8');
const sunX = 0.06;

export default {
  title: 'No horizon',
  sentence: 'The sea at dawn, when there is no line between the water and the sky.',
  size: [1500, 1000],
  look: { exposure: 1, grain: 0.04, vignette: 0.18 },
  shade(x, y) {
    let c = ramp(air, y);
    c = add3(c, peach, 0.28 * Math.exp(-((x - sunX) ** 2) * 3 - (y - 0.03) ** 2 * 35));
    const depth = 0.02 - y;
    if (depth > 0) {
      const s = 1 / (depth + 0.03);
      const swell = fbm(x * s * 0.7, s * 0.45, 3);
      c = mul3(c, 1 + swell * 0.06 * smoothstep(0, 0.2, depth));
      const glint = smoothstep(0.62, 0.9, noise(x * s * 9, s * 6)) * Math.exp(-((x - sunX) ** 2) * 10);
      c = add3(c, peach, glint * 0.07 * smoothstep(0, 0.08, depth));
    }
    return c;
  },
};
