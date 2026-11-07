// The brush: a few functions of x and y, evaluated per pixel in linear light,
// and a renderer that writes the result as pigment on paper.
import { hash, seeded } from '../src/lib/random.ts';

export { hash };
export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const len = (x, y) => Math.sqrt(x * x + y * y);

// Gradient noise on a permutation table, roughly in [-1, 1].
const perm = new Uint8Array(512);
const gx = new Float32Array(256);
const gy = new Float32Array(256);
{
  const r = seeded(1729);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) {
    const a = (i / 256) * TAU;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }
}

export function noise(x, y) {
  const fx0 = Math.floor(x);
  const fy0 = Math.floor(y);
  const fx = x - fx0;
  const fy = y - fy0;
  const ix = fx0 & 255;
  const iy = fy0 & 255;
  const a = perm[ix + perm[iy]];
  const b = perm[ix + 1 + perm[iy]];
  const c = perm[ix + perm[iy + 1]];
  const d = perm[ix + 1 + perm[iy + 1]];
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const n00 = gx[a] * fx + gy[a] * fy;
  const n10 = gx[b] * (fx - 1) + gy[b] * fy;
  const n01 = gx[c] * fx + gy[c] * (fy - 1);
  const n11 = gx[d] * (fx - 1) + gy[d] * (fy - 1);
  const x1 = n00 + (n10 - n00) * u;
  const x2 = n01 + (n11 - n01) * u;
  return (x1 + (x2 - x1) * v) * 1.414;
}

// Fractal sum with a small rotation per octave to hide the grid.
export function fbm(x, y, octaves = 5, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x, y);
    norm += amp;
    const nx = 0.8 * x - 0.6 * y;
    const ny = 0.6 * x + 0.8 * y;
    x = nx * lacunarity + 11.3;
    y = ny * lacunarity + 7.1;
    amp *= gain;
  }
  return sum / norm;
}

// Colour: hex in, linear light out, and back.
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
export const hex = (h) => [1, 3, 5].map((i) => toLin(parseInt(h.slice(i, i + 2), 16) / 255));

// Evaluates work.shade(x, y, u, v, px, state) for every pixel and returns 8-bit
// sRGB. x spans [-aspect/2, aspect/2] and y spans [-0.5, 0.5] with y up; u and
// v are in [0, 1] with v down. The shade is reflectance, so the result reads
// as pigment on paper, under a soft vignette and a little grain.
export function render(work, w, h) {
  const { grain = 0.03, vignette = 0.3 } = work.look ?? {};
  const aspect = w / h;
  const state = work.prepare ? work.prepare(w, h) : null;
  const px = 1 / h;
  const out = Buffer.alloc(w * h * 3);
  let o = 0;
  for (let j = 0; j < h; j++) {
    const v = (j + 0.5) / h;
    const y = 0.5 - v;
    for (let i = 0; i < w; i++) {
      const u = (i + 0.5) / w;
      const c = work.shade((u - 0.5) * aspect, y, u, v, px, state);
      const vig = 1 - vignette * smoothstep(0.35, 1.15, len((u - 0.5) * 1.6, (v - 0.5) * 1.6));
      const n = (hash(i, j, 7) + hash(i, j, 13) - 1) * grain;
      for (let k = 0; k < 3; k++) out[o++] = clamp(Math.round((toSrgb(clamp(Math.max(0, c[k]) * vig)) + n) * 255), 0, 255);
    }
  }
  return out;
}
