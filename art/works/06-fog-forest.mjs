import { hex, mix3, add3, mul3, ramp, smoothstep, hash, noise, fbm } from '../lib.mjs';

const fog = [
  [-0.5, hex('#8f998c')],
  [-0.18, hex('#b9c1b5')],
  [0.15, hex('#d3d8ce')],
  [0.5, hex('#e4e6de')],
];
const bark = hex('#121611');
const moss = hex('#2b3424');
const beam = hex('#fff1d2');
const layers = 8;

export default {
  title: 'Suggestion',
  sentence: 'Fog in a forest, where the farthest trees are only a suggestion.',
  size: [1500, 1000],
  look: { exposure: 1, grain: 0.035, vignette: 0.32, bloom: 0.15, threshold: 1.2, spread: 0.04 },
  shade(x, y) {
    let air = ramp(fog, y + 0.03 * fbm(x * 2, y * 2, 3));
    const a = x * 0.55 + y * 0.835;
    const rays = smoothstep(0.15, 0.8, noise(a * 7 + 0.5 * fbm(a * 2, 1, 2), 2.3)) * smoothstep(-0.45, 0.45, y) * smoothstep(-0.9, 0.5, x);
    air = add3(air, beam, 0.2 * rays);

    // Near layers first: the first trunk a ray meets is the one we see.
    for (let l = 0; l < layers; l++) {
      const t = l / (layers - 1);
      const ground = -0.5 + 0.36 * t ** 0.7;
      const cell = 0.06 + 0.3 * (1 - t) ** 1.5;
      const fogAmount = 0.04 + 0.9 * t ** 0.75;
      const k0 = Math.floor(x / cell);
      for (let i = -1; i <= 1; i++) {
        const k = k0 + i;
        if (hash(k, l, 7) > 0.5) continue;
        const width = (0.004 + 0.034 * (1 - t) ** 2.2) * (0.6 + 0.8 * hash(k, l, 8));
        const lean = (hash(k, l, 9) - 0.5) * 0.04;
        const cx = (k + 0.2 + 0.6 * hash(k, l, 10)) * cell + lean * (y - ground) + 0.003 * noise(y * 5, k + l * 10);
        const half = width * (1 - 0.12 * (y - ground));
        const d = Math.abs(x - cx);
        if (d < half) {
          const side = 0.7 + 0.3 * smoothstep(-half, half, x - cx);
          const barkTex = 0.85 + 0.3 * fbm(x * 260 + k, y * 30, 3);
          const mist = (1 - fogAmount) * smoothstep(ground + 0.2, ground - 0.04, y) * (0.35 + 0.65 * t);
          const trunk = mix3(mul3(bark, side * barkTex), air, Math.min(1, fogAmount + mist + 0.15 * smoothstep(0.1, 0.5, y)));
          return mix3(air, trunk, smoothstep(half, half * 0.7, d));
        }
      }
      if (y < ground && l === 0) {
        const floor = mix3(mul3(moss, 0.7), air, 0.25 + 0.65 * smoothstep(-0.5, -0.14, y));
        air = mix3(air, mul3(floor, 0.9 + 0.2 * fbm(x * 9, y * 30, 3)), 0.6);
      }
    }
    return air;
  },
};
