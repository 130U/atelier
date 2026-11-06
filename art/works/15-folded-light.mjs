import { hex, mix3, add3, mul3, smoothstep, fbm, len } from '../lib.mjs';

const linen = hex('#d2bb98');
const sun = hex('#fff0d2');
const gx = -0.22;
const gy = 0.13;
const R = 0.11;
const n = 1.33;
const dirx = Math.cos(-0.2);
const diry = Math.sin(-0.2);
const reach = 0.5;

// Refract a 2-d direction (dx, dy) through a surface with unit normal (nx, ny).
function refract(dx, dy, nx, ny, eta) {
  const cosi = -(dx * nx + dy * ny);
  const k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < 0) return null;
  const f = eta * cosi - Math.sqrt(k);
  return [eta * dx + f * nx, eta * dy + f * ny];
}

export default {
  title: 'Folded light',
  sentence: 'Light through a glass of water, folded into a bright curve on the table.',
  size: [1200, 1200],
  look: { exposure: 1, grain: 0.025, vignette: 0.38, bloom: 0.6, threshold: 0.95, spread: 0.018 },
  // The water acts as a cylindrical lens. I trace parallel sunlight through it
  // and let the rays pile up on the table; where they crowd, the caustic is.
  prepare(w, h) {
    const map = new Float32Array(w * h);
    const N = 16000;
    const step = 0.6 / h;
    for (let r = 0; r < N; r++) {
      const b = ((r + 0.5) / N) * 2 - 1;
      const ox = gx - dirx * R * 2 - diry * b * R;
      const oy = gy - diry * R * 2 + dirx * b * R;
      const proj = (gx - ox) * dirx + (gy - oy) * diry;
      const t1 = proj - Math.sqrt(R * R - (b * R) ** 2);
      let px = ox + dirx * t1;
      let py = oy + diry * t1;
      let d = refract(dirx, diry, (px - gx) / R, (py - gy) / R, 1 / n);
      if (!d) continue;
      const dot = (px - gx) * d[0] + (py - gy) * d[1];
      const t2 = -2 * dot;
      px += d[0] * t2;
      py += d[1] * t2;
      d = refract(d[0], d[1], -(px - gx) / R, -(py - gy) / R, n);
      if (!d) continue;
      const m = Math.hypot(d[0], d[1]);
      for (let s = 0; s < reach / step; s++) {
        const x = px + (d[0] / m) * s * step;
        const y = py + (d[1] / m) * s * step;
        const i = Math.round((x + 0.5) * w);
        const j = Math.round((0.5 - y) * h);
        if (i < 1 || j < 1 || i >= w - 1 || j >= h - 1) break;
        const fade = Math.exp(-s * step * 1.6) * (1 - (s * step) / reach) ** 2;
        map[j * w + i] += fade;
      }
    }
    const soft = new Float32Array(map.length);
    for (let j = 1; j < h - 1; j++)
      for (let i = 1; i < w - 1; i++) {
        let s = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) s += map[(j + dj) * w + i + di] * (di || dj ? 0.09 : 0.28);
        soft[j * w + i] = s;
      }
    const sorted = Float32Array.from(soft).sort();
    const ref = sorted[Math.floor(sorted.length * 0.99)] || 1;
    for (let i = 0; i < soft.length; i++) soft[i] = Math.min(3, soft[i] / ref);
    return { map: soft, w, h };
  },
  shade(x, y, u, v, px, { map, w, h }) {
    const weave = 0.025 * Math.sin(x * 1500) * Math.sin(y * 1500) + 0.04 * fbm(x * 70, y * 70, 2);
    const light = 0.7 + 0.4 * smoothstep(0.7, -0.7, x - y * 0.3);
    let c = mul3(linen, light * (0.96 + weave) * (0.92 + 0.08 * fbm(x * 4, y * 4, 3)));

    const rx = x - gx;
    const ry = y - gy;
    const along = rx * dirx + ry * diry;
    const across = Math.abs(-rx * diry + ry * dirx);
    const shadow =
      along > 0
        ? smoothstep(R + 0.02 + along * 0.05, R - 0.012, across) * smoothstep(reach + 0.05, reach - 0.1, along)
        : smoothstep(R + 0.015, R - 0.005, len(rx, ry));
    c = mix3(c, mul3(mix3(c, hex('#8697b8'), 0.3), 0.32), shadow * 0.9);

    const k = map[Math.min(h - 1, Math.floor(v * h)) * w + Math.min(w - 1, Math.floor(u * w))];
    c = add3(c, sun, k * 0.9 * (along > 0 ? 0.25 + 0.75 * shadow : 0));

    const e = len(rx, ry) / R;
    if (e < 1.03) {
      c = mix3(c, mul3(mix3(linen, hex('#cfe6ee'), 0.3), 0.62 + 0.3 * smoothstep(0.9, -0.4, (rx * dirx + ry * diry) / R)), smoothstep(1.02, 0.97, e));
      const wall = smoothstep(0.05, 0, Math.abs(e - 0.96));
      const lit = 0.2 + 0.8 * smoothstep(-0.3, 0.9, -(rx * dirx + ry * diry) / R);
      c = mix3(c, mul3(c, 0.7), wall * 0.4);
      c = add3(c, sun, smoothstep(0.02, 0, Math.abs(e - 1)) * lit * 1.2);
      c = add3(c, sun, 1.8 * smoothstep(0.08, 0.0, len(rx / R + 0.5, ry / R - 0.5)));
    }
    return c;
  },
};
