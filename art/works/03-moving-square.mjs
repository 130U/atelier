import { hex, mix3, add3, mul3, smoothstep, hash, fbm, noise, fract } from '../lib.mjs';

const seam = 0.16;
const horizon = 0.62;
const sun = hex('#ffcf8f');
const plaster = hex('#6e6153');
const woods = ['#6b4128', '#7a4c2e', '#5e3820', '#80553a'].map(hex);

// The floor seen in perspective: screen (x, y) → floor (X, Z).
const floor = (x, y) => {
  const z = 0.5 / (horizon - y);
  // z runs from about 0.45 at the bottom edge to 1.1 where the floor meets the wall.
  return [x * z, z];
};

// The window's light on the floor: four panes, a cross of shadow, sheer cloth.
function patch(X, Z) {
  const z0 = 0.56;
  const z1 = 0.92;
  const skew = 0.9;
  const lx = X + 0.02 - (Z - z0) * skew;
  const soft = 0.008 + (Z - z0) * 0.03;
  const inside =
    smoothstep(-0.2 - soft, -0.2 + soft, lx) * smoothstep(0.2 + soft, 0.2 - soft, lx) * smoothstep(z0 - soft, z0 + soft, Z) * smoothstep(z1 + soft, z1 - soft, Z);
  const mullion = smoothstep(0.007, 0.002, Math.abs(lx)) + smoothstep(0.008, 0.003, Math.abs(Z - (z0 + z1) / 2));
  const sheer = 0.74 + 0.18 * Math.sin(lx * 90 + 3 * noise(lx * 6, Z * 4)) + 0.08 * fbm(lx * 20, Z * 20, 3);
  return inside * (1 - Math.min(1, mullion) * 0.85) * sheer;
}

export default {
  title: 'Moving square',
  sentence: 'Sunlight through a curtain, moving slowly across a wooden floor.',
  size: [1500, 1000],
  look: { exposure: 1, grain: 0.03, vignette: 0.42, bloom: 0.35, threshold: 0.7, spread: 0.03 },
  shade(x, y, u, v, px) {
    if (y > seam) {
      let c = mul3(plaster, 0.11 * (0.92 + 0.08 * fbm(x * 9, y * 9, 3)));
      c = add3(c, sun, 0.035 * Math.exp(-((x - 0.1) ** 2) * 3));
      if (y < seam + 0.022) c = mix3(c, mul3(hex('#d8cfc2'), 0.13), smoothstep(seam, seam + 0.003, y));
      return c;
    }
    const [X, Z] = floor(x, y);
    const board = Math.floor(X / 0.075);
    const bx = fract(X / 0.075);
    const tone = woods[Math.floor(hash(board, 0, 3) * woods.length)];
    const run = Math.floor(Z / 0.5 + hash(board, 1, 3));
    const grain = 0.82 + 0.18 * fbm(X * 40 + board * 3.1, Z * 5 + run * 7, 4) + 0.06 * noise(X * 260, Z * 18);
    let wood = mul3(tone, grain * (0.9 + 0.2 * hash(board, run, 4)));
    const gap = smoothstep(0.04, 0.0, Math.min(bx, 1 - bx)) + smoothstep(0.01, 0, Math.abs(fract(Z / 0.5 + hash(board, 1, 3)) - 0.001));
    wood = mul3(wood, 1 - 0.6 * Math.min(1, gap));

    const light = patch(X, Z);
    const ambient = 0.09 + 0.05 * smoothstep(3, 1, Z);
    let c = mul3(wood, ambient + 2.6 * light);
    c = add3(c, sun, 0.12 * light);
    const sheen = Math.exp(-((X + 0.02 - (Z - 0.56) * 0.9) ** 2) * 8) * 0.04;
    c = add3(c, sun, sheen);
    return c;
  },
};
