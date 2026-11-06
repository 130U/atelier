// The brush: a few functions of x and y. Every image in the exhibition is
// computed per pixel from these, in linear light, then tone-mapped like film.

export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const mix = (a, b, t) => a + (b - a) * t;
export const fract = (x) => x - Math.floor(x);
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const len = (x, y) => Math.sqrt(x * x + y * y);

// Integer hash → [0, 1).
export function hash(x, y = 0, z = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440670441);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Gradient noise on a permutation table, roughly in [-1, 1].
const perm = new Uint8Array(512);
const gx = new Float32Array(256);
const gy = new Float32Array(256);
{
  const r = rng(1729);
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

// Ridged noise: thin bright lines where the field crosses zero.
export const ridge = (x, y) => 1 - Math.abs(noise(x, y));

// Cellular distances to the nearest and second-nearest feature point.
const cell = { f1: 0, f2: 0, id: 0 };
export function voronoi(x, y, seed = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  let id = 0;
  for (let dj = -1; dj <= 1; dj++)
    for (let di = -1; di <= 1; di++) {
      const cx = ix + di;
      const cy = iy + dj;
      const dx = cx + hash(cx, cy, seed) - x;
      const dy = cy + hash(cx, cy, seed + 1) - y;
      const d = dx * dx + dy * dy;
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hash(cx, cy, seed + 2);
      } else if (d < f2) f2 = d;
    }
  cell.f1 = Math.sqrt(f1);
  cell.f2 = Math.sqrt(f2);
  cell.id = id;
  return cell;
}

// Colour. Hex in, linear light out.
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
export const hex = (h) => [1, 3, 5].map((i) => toLin(parseInt(h.slice(i, i + 2), 16) / 255));
export const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// A vertical ramp through colour stops: stops = [[t, [r,g,b]], ...], t ascending.
export function ramp(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      return mix3(c0, c1, smoothstep(0, 1, (t - t0) / (t1 - t0)));
    }
  }
  return stops[stops.length - 1][1];
}

const aces = (x) => clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14));

// Three passes of a running-sum box blur approximate a Gaussian.
function blur(buf, w, h, r) {
  const tmp = new Float32Array(buf.length);
  const pass = (src, dst, n, m, stride, step) => {
    for (let line = 0; line < m; line++) {
      const base = line * stride;
      for (let ch = 0; ch < 3; ch++) {
        let acc = 0;
        for (let k = -r; k <= r; k++) acc += src[base + clamp(k, 0, n - 1) * step + ch];
        for (let k = 0; k < n; k++) {
          dst[base + k * step + ch] = acc / (2 * r + 1);
          acc += src[base + Math.min(n - 1, k + r + 1) * step + ch] - src[base + Math.max(0, k - r) * step + ch];
        }
      }
    }
  };
  for (let i = 0; i < 3; i++) {
    pass(buf, tmp, w, h, w * 3, 3);
    pass(tmp, buf, h, w, 3, w * 3);
  }
}

// Renders shade(x, y, u, v, px, state) for every pixel. x spans
// [-aspect/2, aspect/2] and y spans [-0.5, 0.5] with y up; u and v are in
// [0, 1] with v down. Bright light spills into a soft bloom, as in a lens.
export function render(work, w, h) {
  const { exposure = 1, grain = 0.03, vignette = 0.3, bloom = 0, threshold = 0.8, spread = 0.02 } = work.look ?? {};
  const aspect = w / h;
  const state = work.prepare ? work.prepare(w, h) : null;
  const px = 1 / h;
  const hdr = new Float32Array(w * h * 3);
  let o = 0;
  for (let j = 0; j < h; j++) {
    const v = (j + 0.5) / h;
    const y = 0.5 - v;
    for (let i = 0; i < w; i++) {
      const u = (i + 0.5) / w;
      const c = work.shade((u - 0.5) * aspect, y, u, v, px, state);
      hdr[o++] = Math.max(0, c[0] * exposure);
      hdr[o++] = Math.max(0, c[1] * exposure);
      hdr[o++] = Math.max(0, c[2] * exposure);
    }
  }

  let glow = null;
  const ds = 4;
  const bw = Math.ceil(w / ds);
  const bh = Math.ceil(h / ds);
  if (bloom > 0) {
    glow = new Float32Array(bw * bh * 3);
    for (let by = 0; by < bh; by++)
      for (let bx = 0; bx < bw; bx++) {
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = 0; dy < ds; dy++)
          for (let dx = 0; dx < ds; dx++) {
            const x = bx * ds + dx;
            const y = by * ds + dy;
            if (x >= w || y >= h) continue;
            const p = (y * w + x) * 3;
            r += hdr[p];
            g += hdr[p + 1];
            b += hdr[p + 2];
            n++;
          }
        r /= n; g /= n; b /= n;
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const k = Math.max(0, l - threshold) / Math.max(l, 1e-4);
        const q = (by * bw + bx) * 3;
        glow[q] = r * k;
        glow[q + 1] = g * k;
        glow[q + 2] = b * k;
      }
    blur(glow, bw, bh, Math.max(1, Math.round((spread * h) / ds)));
  }

  const out = Buffer.alloc(w * h * 3);
  o = 0;
  for (let j = 0; j < h; j++) {
    const v = (j + 0.5) / h;
    for (let i = 0; i < w; i++) {
      const u = (i + 0.5) / w;
      const vig = 1 - vignette * smoothstep(0.35, 1.15, len((u - 0.5) * 1.6, (v - 0.5) * 1.6));
      const n = (hash(i, j, 7) + hash(i, j, 13) - 1) * grain;
      let gr = 0, gg = 0, gb = 0;
      if (glow) {
        const fx = Math.min(bw - 1.001, Math.max(0, (i + 0.5) / ds - 0.5));
        const fy = Math.min(bh - 1.001, Math.max(0, (j + 0.5) / ds - 0.5));
        const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const a = (y0 * bw + x0) * 3, b = a + 3, c = a + bw * 3, d = c + 3;
        const s = (k) => (glow[a + k] * (1 - tx) + glow[b + k] * tx) * (1 - ty) + (glow[c + k] * (1 - tx) + glow[d + k] * tx) * ty;
        gr = s(0) * bloom;
        gg = s(1) * bloom;
        gb = s(2) * bloom;
      }
      const p = (j * w + i) * 3;
      const rgb = [hdr[p] + gr, hdr[p + 1] + gg, hdr[p + 2] + gb];
      for (let k = 0; k < 3; k++) out[o++] = clamp(Math.round((toSrgb(aces(rgb[k] * vig)) + n) * 255), 0, 255);
    }
  }
  return out;
}
