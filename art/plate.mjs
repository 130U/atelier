// One plate per étude, all drawn by the same rules:
//   angle    the pitch class, placed on the circle of fifths
//   radius   time, from the centre outwards
//   star     an onset; its size is how hard the note was struck
//   wash     watercolour in the colour of the key, as deep as the music is loud
//            and as wide as the key's pitches spread around the circle
//   gold     the strongest onsets, each joined to its nearest: the étude's constellation
import { TAU, clamp, smoothstep, hash, noise, fbm, len, hex } from './lib.mjs';
import palette from '../src/data/palette.json' with { type: 'json' };

export const SIZE = 1500;
export const R0 = 0.06;
export const R1 = 0.395;
export const INK = '#1f2747';
export const GOLD = '#b8862b';
export const LETTERS = palette.letters;

// The circle of fifths doubles as a colour wheel of watercolour pigments.
export const PIGMENTS = palette.pigments;

export const fifths = (pc) => (pc * 7) % 12;
export const keyIndex = (e) => fifths(e.mode === 'major' ? e.tonic : (e.tonic + 3) % 12);
export const pigmentHex = (e) => PIGMENTS[keyIndex(e)];

// A minor key shares its relative major's angle, so it shares its pigment;
// it is laid on a little more densely.
const pigment = (e) => hex(pigmentHex(e));

export function stars(data) {
  const out = [];
  const o = data.onsets;
  for (let i = 0; i < o.length; i += 3) {
    const t = o[i] / 100 / data.duration;
    const s = o[i + 1] / 99;
    for (let pc = 0; pc < 12; pc++) {
      if (!(o[i + 2] & (1 << pc))) continue;
      const a = ((fifths(pc) + (hash(i, pc, 5) - 0.5) * 0.5) / 12) * TAU;
      const r = R0 + (R1 - R0) * t;
      out.push({ t, s, a, x: Math.sin(a) * r, y: Math.cos(a) * r, pc, i: i / 3 });
    }
  }
  return out;
}

export function plateWork(e, data) {
  const absorb = pigment(e).map((v) => -Math.log(Math.max(0.03, v)));
  const indigo = hex('#2b3a78').map((v) => -Math.log(v));
  const paper = hex('#f7f0e3');
  // Loudness smoothed over about two seconds, so the wash swells rather than steps.
  const raw = data.loud;
  const loud = raw.map((_, i) => {
    let s = 0;
    let w = 0;
    for (let k = -4; k <= 4; k++) {
      const v = raw[i + k];
      if (v === undefined) continue;
      const g = Math.exp(-(k * k) / 8);
      s += v * g;
      w += g;
    }
    return s / w;
  });
  const n = loud.length;
  const density = e.mode === 'minor' ? 1.25 : 1;
  const loudAt = (t) => {
    const f = clamp(t) * (n - 1);
    const i = Math.floor(f);
    const a = loud[i] ?? 0;
    const b = loud[Math.min(n - 1, i + 1)] ?? a;
    return (a + (b - a) * (f - i)) / 99;
  };
  const spread = new Float64Array(12);
  data.profile.forEach((v, pc) => (spread[fifths(pc)] = v));
  const around = (theta) => {
    const f = (((theta / TAU) * 12) % 12 + 12) % 12;
    const i = Math.floor(f);
    const s = smoothstep(0, 1, f - i);
    return spread[i] * (1 - s) + spread[(i + 1) % 12] * s;
  };

  return {
    size: [SIZE, SIZE],
    look: { tone: 'paper', grain: 0.018, vignette: 0.12 },
    shade(x, y) {
      let c = paper.map((v) => v * (0.975 + 0.025 * fbm(x * 70, y * 70, 3) + 0.012 * noise(x * 420, y * 34)));
      const r = len(x, y);
      let theta = Math.atan2(x, y) + 0.22 * fbm(x * 2.6 + 4, y * 2.6, 3);
      const t = (r + 0.02 * fbm(x * 5 + 3, y * 5, 4) - R0) / (R1 - R0);
      const inside = smoothstep(-0.06, 0.03, t) * smoothstep(1.06, 0.95, t);
      if (inside > 0) {
        const body = 0.1 + 0.95 * loudAt(t) ** 1.5;
        const reach = 0.18 + 0.82 * around(theta) ** 2.4;
        const granulation = 0.82 + 0.36 * noise(x * 300, y * 300);
        const bloom = 0.7 + 0.6 * fbm(x * 3.6 + 7, y * 3.6 - 2, 5);
        const d = inside * body * reach * granulation * bloom;
        const edge = smoothstep(0.25, 0.42, d) * smoothstep(0.62, 0.45, d) * 0.35;
        c = c.map((v, k) => v * Math.exp(-absorb[k] * (d + edge) * 1.5 * density));
      }
      const halo = smoothstep(0.36, 0.44, r) * smoothstep(0.5, 0.44, r) * 0.06 * (0.5 + fbm(x * 5, y * 5, 3));
      return c.map((v, k) => v * Math.exp(-indigo[k] * halo));
    },
  };
}

// The ink and gold drawn over the wash, as SVG for clean lines.
export function plateSvg(e, data) {
  const S = SIZE;
  const px = (v) => (v * S).toFixed(1);
  const X = (x) => ((x + 0.5) * S).toFixed(1);
  const Y = (y) => ((0.5 - y) * S).toFixed(1);
  const all = stars(data);
  const parts = [];

  parts.push(`<circle cx="${S / 2}" cy="${S / 2}" r="${px(R1 + 0.022)}" fill="none" stroke="${INK}" stroke-opacity="0.55" stroke-width="1.2"/>`);
  parts.push(`<circle cx="${S / 2}" cy="${S / 2}" r="${px(R1 + 0.03)}" fill="none" stroke="${INK}" stroke-opacity="0.35" stroke-width="0.7"/>`);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    const sx = Math.sin(a);
    const sy = Math.cos(a);
    parts.push(`<line x1="${X(sx * R0 * 0.8)}" y1="${Y(sy * R0 * 0.8)}" x2="${X(sx * (R1 + 0.022))}" y2="${Y(sy * (R1 + 0.022))}" stroke="${INK}" stroke-opacity="0.1" stroke-width="0.8"/>`);
    parts.push(`<line x1="${X(sx * (R1 + 0.022))}" y1="${Y(sy * (R1 + 0.022))}" x2="${X(sx * (R1 + 0.038))}" y2="${Y(sy * (R1 + 0.038))}" stroke="${INK}" stroke-opacity="0.6" stroke-width="1.2"/>`);
    parts.push(`<text x="${X(sx * (R1 + 0.066))}" y="${Y(sy * (R1 + 0.066))}" dy="0.35em" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="27" fill="${INK}" fill-opacity="0.78">${LETTERS[k]}</text>`);
  }
  for (let sec = 30; sec < data.duration; sec += 30) {
    const r = R0 + ((R1 - R0) * sec) / data.duration;
    parts.push(`<circle cx="${S / 2}" cy="${S / 2}" r="${px(r)}" fill="none" stroke="${INK}" stroke-opacity="0.13" stroke-width="0.8" stroke-dasharray="2 6"/>`);
    const a = (0.5 / 12) * TAU;
    parts.push(`<text x="${X(Math.sin(a) * r)}" y="${Y(Math.cos(a) * r)}" dx="6" dy="-4" font-family="Georgia, serif" font-style="italic" font-size="15" fill="${INK}" fill-opacity="0.45">${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}</text>`);
  }

  for (const s of all) {
    const rad = 0.9 + 4.2 * s.s ** 1.3;
    parts.push(`<circle cx="${X(s.x)}" cy="${Y(s.y)}" r="${rad.toFixed(2)}" fill="${INK}" fill-opacity="${(0.42 + 0.5 * s.s).toFixed(2)}"/>`);
  }

  const ranked = [...all].sort((a, b) => b.s - a.s);
  const bright = ranked.slice(0, Math.max(14, Math.round(all.length * 0.022))).sort((a, b) => a.t - b.t);
  // A minimum spanning tree over the brightest stars: every star joined, no line crossing the sky for nothing.
  const linked = [0];
  const rest = new Set(bright.map((_, i) => i).slice(1));
  while (rest.size) {
    let best = null;
    for (const a of linked)
      for (const b of rest) {
        const d = Math.hypot(bright[a].x - bright[b].x, bright[a].y - bright[b].y);
        if (!best || d < best[2]) best = [a, b, d];
      }
    parts.push(`<line x1="${X(bright[best[0]].x)}" y1="${Y(bright[best[0]].y)}" x2="${X(bright[best[1]].x)}" y2="${Y(bright[best[1]].y)}" stroke="${GOLD}" stroke-opacity="0.6" stroke-width="1.2"/>`);
    linked.push(best[1]);
    rest.delete(best[1]);
  }
  for (const s of bright) {
    const r = 9 + 10 * s.s;
    const cx = Number(X(s.x));
    const cy = Number(Y(s.y));
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${(r * 1.9).toFixed(1)}" fill="url(#glow)"/>`);
    parts.push(
      `<path d="M${cx} ${cy - r} Q${cx} ${cy} ${cx + r * 0.32} ${cy} Q${cx} ${cy} ${cx} ${cy + r} Q${cx} ${cy} ${cx - r * 0.32} ${cy} Q${cx} ${cy} ${cx} ${cy - r}Z M${cx - r * 0.7} ${cy} Q${cx} ${cy} ${cx} ${cy - r * 0.22} Q${cx} ${cy} ${cx + r * 0.7} ${cy} Q${cx} ${cy} ${cx} ${cy + r * 0.22} Q${cx} ${cy} ${cx - r * 0.7} ${cy}Z" fill="${GOLD}"/>`,
    );
  }

  parts.push(`<circle cx="${S / 2}" cy="${S / 2}" r="${px(R0 * 0.62)}" fill="#f7f0e3" stroke="${INK}" stroke-opacity="0.5" stroke-width="1"/>`);
  parts.push(`<text x="${S / 2}" y="${S / 2}" dy="0.36em" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="25" fill="${INK}">${e.op}·${e.no}</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs><radialGradient id="glow"><stop offset="0" stop-color="${GOLD}" stop-opacity="0.38"/><stop offset="1" stop-color="${GOLD}" stop-opacity="0"/></radialGradient></defs>
  ${parts.join('\n  ')}
</svg>`;
}
