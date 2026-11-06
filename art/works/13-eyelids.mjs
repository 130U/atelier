import { hex, mix3, mul3, ramp, fbm, ridge, len } from '../lib.mjs';

const field = [
  [0, mul3(hex('#ffc35a'), 1.6)],
  [0.22, hex('#ff6a22')],
  [0.5, hex('#b3170e')],
  [0.85, hex('#3b0504')],
];
const teal = hex('#2fb7a4');
const violet = hex('#6a4cff');

export default {
  title: 'Eyelids',
  sentence: 'Closing your eyes in the sun: red, warm, and moving.',
  size: [1200, 1200],
  look: { exposure: 1, grain: 0.03, vignette: 0.22, bloom: 0.4, threshold: 0.9, spread: 0.05 },
  shade(x, y) {
    const wx = x + 0.08 * fbm(x * 1.6 + 2, y * 1.6, 4);
    const wy = y + 0.08 * fbm(x * 1.6, y * 1.6 + 7, 4);
    let c = ramp(field, len(wx - 0.07, wy - 0.09) * (1 + 0.25 * fbm(x * 2.2, y * 2.2, 3)));

    const vessel = ridge(wx * 2.6 + 0.8 * fbm(wx * 2, wy * 2, 3), wy * 2.6) ** 60 + 0.6 * ridge(wx * 6 + 4, wy * 6 + 0.6 * fbm(wy * 3, wx * 3, 3)) ** 90;
    c = mul3(c, 1 - 0.42 * Math.min(1, vessel) * (0.6 + 0.4 * fbm(x * 3, y * 3, 2)));

    const g = Math.exp(-(len(x + 0.24, y + 0.2) ** 2) / 0.03);
    const p = Math.exp(-(len(x - 0.27, y + 0.27) ** 2) / 0.018);
    c = mix3(c, mul3(teal, 0.6), g * 0.22);
    c = mix3(c, mul3(violet, 0.5), p * 0.16);

    return c;
  },
};
