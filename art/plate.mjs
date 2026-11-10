// One plate per étude, all drawn by the same rules, as a polar plot of the
// recording set inside a gilded astrolabe ring:
//   position angle  pitch class, on the circle of fifths, C at the top
//   radial distance elapsed time, centre to rim
//   point           a note onset; larger the stronger the attack
//   nebula          each pitch class in its own pigment from the colour wheel,
//                   laid where and when it sounds, deeper as the music is louder
//   gold            the strongest onsets, joined by a minimum spanning tree
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import { TAU, clamp, smoothstep, hash, noise, fbm, len, hex } from './lib.mjs';
import { LETTERS, PIGMENTS, PLATE, fifths, keyIndex, ident, short, nameOf, clock } from '../src/lib/theory.ts';

export const SIZE = 1500;
const { R0, R1 } = PLATE;
const BAND_IN = 0.352;
const BAND_OUT = 0.412;
const INK = '#1f2747';
export const GOLD = '#a8781f';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const font = (p) => opentype.parse(fs.readFileSync(path.join(root, 'node_modules', '@fontsource', p)).buffer.slice(0));
const FONTS = {
  serif: font('newsreader/files/newsreader-latin-500-normal.woff'),
  italic: font('newsreader/files/newsreader-latin-400-italic.woff'),
  hand: font('nothing-you-could-do/files/nothing-you-could-do-latin-400-normal.woff'),
  mono: font('ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff'),
};

// Text as outlines, so the plate carries its own type. Sharps and flats are
// drawn by hand, since the fonts do not include them.
export function text(str, x, y, size, { face = 'serif', anchor = 'start', fill = INK, opacity = 1, spacing = 0 } = {}) {
  const f = FONTS[face];
  const parts = [];
  let width = 0;
  for (const ch of str) width += ch === '♯' || ch === '♭' ? size * 0.42 : f.getAdvanceWidth(ch, size) + spacing;
  let cx = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
  const strokes = [];
  for (const ch of str) {
    const s = size;
    if (ch === '♯') {
      strokes.push(
        `M${cx + s * 0.12} ${y - s * 0.66}V${y + s * 0.08}M${cx + s * 0.28} ${y - s * 0.72}V${y + s * 0.02}M${cx + 0.02 * s} ${y - s * 0.38}L${cx + s * 0.38} ${y - s * 0.46}M${cx + 0.02 * s} ${y - s * 0.16}L${cx + s * 0.38} ${y - s * 0.24}`,
      );
      cx += s * 0.42;
    } else if (ch === '♭') {
      strokes.push(`M${cx + s * 0.08} ${y - s * 0.78}V${y}M${cx + s * 0.08} ${y - s * 0.3}C${cx + s * 0.36} ${y - s * 0.48} ${cx + s * 0.44} ${y - s * 0.16} ${cx + s * 0.08} ${y}`);
      cx += s * 0.42;
    } else {
      // Glyph origins use hundredth-pixel coordinates for finite outline paths.
      parts.push(f.getPath(ch, Math.round(cx * 100) / 100, Math.round(y * 100) / 100, size).toPathData(2));
      cx += f.getAdvanceWidth(ch, size) + spacing;
    }
  }
  const out = [`<path d="${parts.join(' ')}" fill="${fill}" fill-opacity="${opacity}"/>`];
  if (strokes.length) out.push(`<path d="${strokes.join(' ')}" fill="none" stroke="${fill}" stroke-opacity="${opacity}" stroke-width="${(size * 0.065).toFixed(2)}" stroke-linecap="round"/>`);
  return out.join('');
}

function stars(data) {
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
  const absorbOf = (h) => hex(h).map((v) => -Math.log(Math.max(0.03, v)));
  const pcAbsorb = Array.from({ length: 12 }, (_, pc) => absorbOf(PIGMENTS[fifths(pc)]));
  const keyAbsorb = absorbOf(PIGMENTS[keyIndex(e)]);
  const paper = hex('#f8f1e2');
  const goldLo = hex('#a9772a');
  const goldHi = hex('#f6dc95');

  return {
    size: [SIZE, SIZE],
    look: { tone: 'paper', grain: 0.016, vignette: 0.16 },
    // When and where each pitch class sounds: 120 time bins by 12 classes,
    // smoothed, with the loudness envelope alongside.
    prepare() {
      const B = 120;
      const grid = Array.from({ length: B }, () => new Float64Array(12));
      const o = data.onsets;
      for (let i = 0; i < o.length; i += 3) {
        const b = Math.min(B - 1, Math.floor((o[i] / 100 / data.duration) * B));
        for (let pc = 0; pc < 12; pc++) if (o[i + 2] & (1 << pc)) grid[b][pc] += 0.3 + o[i + 1] / 99;
      }
      const smooth = grid.map((_, b) => {
        const acc = new Float64Array(12);
        for (let k = -3; k <= 3; k++) {
          const row = grid[b + k];
          if (!row) continue;
          const w = Math.exp(-(k * k) / 4.5);
          for (let pc = 0; pc < 12; pc++) acc[pc] += row[pc] * w;
        }
        return acc;
      });
      let max = 0;
      for (const row of smooth) for (const v of row) max = Math.max(max, v);
      const loud = data.loud;
      const loudAt = (t) => {
        const f = clamp(t) * (loud.length - 1);
        const i = Math.floor(f);
        const a = loud[i] ?? 0;
        return (a + ((loud[Math.min(loud.length - 1, i + 1)] ?? a) - a) * (f - i)) / 99;
      };
      return { grid: smooth.map((row) => row.map((v) => v / max)), B, loudAt };
    },
    shade(x, y, u, v, px, { grid, B, loudAt }) {
      let c = paper.map((p) => p * (0.972 + 0.028 * fbm(x * 70, y * 70, 3) + 0.012 * noise(x * 440, y * 36)));
      const r = len(x, y);

      // The gilded ring: hammered leaf catching the light unevenly.
      if (r > BAND_IN - 0.002 && r < BAND_OUT + 0.002) {
        const a = Math.atan2(x, y);
        const shine = 0.5 + 0.4 * Math.cos(2 * a - 0.9) + 0.25 * fbm(x * 40, y * 40, 3);
        const gold = goldLo.map((g, k) => g + (goldHi[k] - g) * clamp(shine));
        const edge = smoothstep(BAND_IN - 0.002, BAND_IN + 0.0015, r) * smoothstep(BAND_OUT + 0.002, BAND_OUT - 0.0015, r);
        return c.map((p, k) => p + (gold[k] - p) * edge);
      }

      // A faint wash of the key's own colour over the whole field.
      const field = smoothstep(BAND_IN + 0.01, BAND_IN - 0.05, r) * 0.1 * (0.7 + 0.6 * fbm(x * 3, y * 3, 4));
      c = c.map((p, k) => p * Math.exp(-keyAbsorb[k] * field));

      const theta = Math.atan2(x, y) + 0.12 * fbm(x * 3 + 4, y * 3, 3);
      const t = (r + 0.015 * fbm(x * 6 + 3, y * 6, 4) - R0) / (R1 - R0);
      const inside = smoothstep(-0.05, 0.03, t) * smoothstep(1.05, 0.96, t);
      if (inside > 0) {
        const f = clamp(t) * (B - 1);
        const b0 = Math.floor(f);
        const fr = f - b0;
        const row0 = grid[b0];
        const row1 = grid[Math.min(B - 1, b0 + 1)];
        const body = 0.35 + 0.9 * loudAt(t) ** 1.2;
        const granulation = 0.8 + 0.4 * noise(x * 320, y * 320);
        const bloom = 0.65 + 0.7 * fbm(x * 4 + 7, y * 4 - 2, 5);
        const absorb = [0, 0, 0];
        for (let pc = 0; pc < 12; pc++) {
          const amount = row0[pc] * (1 - fr) + row1[pc] * fr;
          if (amount < 0.01) continue;
          let d = theta - (fifths(pc) / 12) * TAU;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          const spread = 0.34 + 0.12 * fbm(x * 2 + pc, y * 2, 2);
          const k = Math.exp(-((d / spread) ** 2)) * amount ** 0.8;
          for (let ch = 0; ch < 3; ch++) absorb[ch] += pcAbsorb[pc][ch] * k;
        }
        const depth = inside * body * granulation * bloom * 1.25;
        c = c.map((p, ch) => p * Math.exp(-absorb[ch] * depth));
      }
      return c;
    },
  };
}

// Ink, gold and lettering drawn over the paint.
export function plateSvg(e, data) {
  const S = SIZE;
  const X = (x) => +((x + 0.5) * S).toFixed(1);
  const Y = (y) => +((0.5 - y) * S).toFixed(1);
  const R = (r) => +(r * S).toFixed(1);
  const C = S / 2;
  const at = (a, r) => [X(Math.sin(a) * r), Y(Math.cos(a) * r)];
  const parts = [];

  // Rings and graduation, as on an astrolabe: five divisions to each key.
  for (const [r, w, o] of [
    [BAND_IN, 1.4, 0.75],
    [BAND_OUT, 1.4, 0.75],
    [BAND_OUT + 0.012, 0.8, 0.5],
    [R1 + 0.004, 0.9, 0.35],
  ])
    parts.push(`<circle cx="${C}" cy="${C}" r="${R(r)}" fill="none" stroke="${INK}" stroke-opacity="${o}" stroke-width="${w}"/>`);
  for (let k = 0; k < 60; k++) {
    const a = (k / 60) * TAU;
    const major = k % 5 === 0;
    const [x1, y1] = at(a, BAND_OUT);
    const [x2, y2] = at(a, BAND_OUT - (major ? 0.02 : 0.009));
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-opacity="${major ? 0.85 : 0.55}" stroke-width="${major ? 1.6 : 0.9}"/>`);
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    const [lx, ly] = at(a, (BAND_IN + BAND_OUT) / 2 - 0.004);
    parts.push(text(LETTERS[k], lx, ly + 11, 31, { face: 'serif', anchor: 'middle' }));
    const [sx, sy] = at(a, R0 * 0.85);
    const [ex, ey] = at(a, R1);
    parts.push(`<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${INK}" stroke-opacity="0.09" stroke-width="0.9"/>`);
  }

  // Time, every thirty seconds.
  for (let sec = 30; sec < data.duration; sec += 30) {
    const r = R0 + ((R1 - R0) * sec) / data.duration;
    parts.push(`<circle cx="${C}" cy="${C}" r="${R(r)}" fill="none" stroke="${INK}" stroke-opacity="0.14" stroke-width="0.8" stroke-dasharray="1.5 6"/>`);
    const [tx, ty] = at((0.5 / 12) * TAU, r);
    parts.push(text(`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, tx + 5, ty - 4, 17, { face: 'italic', opacity: 0.55 }));
  }

  // Every onset as a point; the strongest as stars with diffraction spikes.
  const all = stars(data);
  for (const s of all) {
    const rad = 0.8 + 3.8 * s.s ** 1.35;
    parts.push(`<circle cx="${X(s.x)}" cy="${Y(s.y)}" r="${rad.toFixed(2)}" fill="${INK}" fill-opacity="${(0.4 + 0.5 * s.s).toFixed(2)}"/>`);
  }
  const ranked = [...all].sort((a, b) => b.s - a.s);
  const bright = ranked.slice(0, Math.max(14, Math.round(all.length * 0.022))).sort((a, b) => a.t - b.t);
  const linked = [0];
  const rest = new Set(bright.map((_, i) => i).slice(1));
  while (rest.size) {
    let best = null;
    for (const a of linked)
      for (const b of rest) {
        const d = Math.hypot(bright[a].x - bright[b].x, bright[a].y - bright[b].y);
        if (!best || d < best[2]) best = [a, b, d];
      }
    parts.push(`<line x1="${X(bright[best[0]].x)}" y1="${Y(bright[best[0]].y)}" x2="${X(bright[best[1]].x)}" y2="${Y(bright[best[1]].y)}" stroke="${GOLD}" stroke-opacity="0.7" stroke-width="1.3"/>`);
    linked.push(best[1]);
    rest.delete(best[1]);
  }
  for (const s of bright) {
    const r = 10 + 12 * s.s;
    const cx = X(s.x);
    const cy = Y(s.y);
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${(r * 2.2).toFixed(1)}" fill="url(#glow)"/>`);
    parts.push(`<path d="M${cx - r * 2.4} ${cy}H${cx + r * 2.4}M${cx} ${cy - r * 2.4}V${cy + r * 2.4}" stroke="${GOLD}" stroke-opacity="0.45" stroke-width="0.8"/>`);
    parts.push(
      `<path d="M${cx} ${cy - r}Q${cx} ${cy} ${cx + r * 0.3} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r * 0.3} ${cy}Q${cx} ${cy} ${cx} ${cy - r}ZM${cx - r * 0.66} ${cy}Q${cx} ${cy} ${cx} ${cy - r * 0.2}Q${cx} ${cy} ${cx + r * 0.66} ${cy}Q${cx} ${cy} ${cx} ${cy + r * 0.2}Q${cx} ${cy} ${cx - r * 0.66} ${cy}Z" fill="url(#leaf)" stroke="${GOLD}" stroke-width="0.6"/>`,
    );
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${(r * 0.12).toFixed(1)}" fill="#fff8e6"/>`);
  }

  // The centre: a small gilded boss with the catalogue number.
  parts.push(`<circle cx="${C}" cy="${C}" r="${R(R0 * 0.66)}" fill="url(#leaf)" stroke="${INK}" stroke-opacity="0.6" stroke-width="1"/>`);
  parts.push(text(short(e), C, C + 9, 27, { face: 'italic', anchor: 'middle' }));

  // Corners, as on an atlas plate.
  const m = 70;
  parts.push(text(ident(e).toUpperCase(), m, m + 20, 21, { face: 'mono', spacing: 2, opacity: 0.8 }));
  parts.push(text(e.key, m, m + 66, 34, { face: 'serif' }));
  parts.push(text(e.tempo, m, m + 104, 27, { face: 'italic', opacity: 0.75 }));
  parts.push(text(nameOf(e), m - 2, S - m - 10, 70, { face: 'hand' }));
  const lines = [`MAG ${e.magnitude.toFixed(1)}`, clock(e.duration), `${e.onsets} ONSETS`];
  lines.forEach((line, i) => parts.push(text(line, S - m, S - m - 8 - (lines.length - 1 - i) * 32, 19, { face: 'mono', anchor: 'end', spacing: 1.5, opacity: 0.75 })));

  // A small rose at the top right: north is C.
  const rx = S - m - 34;
  const ry = m + 40;
  const rose = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU;
    const long = k % 2 === 0 ? 34 : 18;
    const l = a - 0.32;
    const rr = a + 0.32;
    rose.push(
      `M${rx} ${ry}L${(rx + Math.sin(l) * 7).toFixed(1)} ${(ry - Math.cos(l) * 7).toFixed(1)}L${(rx + Math.sin(a) * long).toFixed(1)} ${(ry - Math.cos(a) * long).toFixed(1)}L${(rx + Math.sin(rr) * 7).toFixed(1)} ${(ry - Math.cos(rr) * 7).toFixed(1)}Z`,
    );
  }
  parts.push(`<path d="${rose.join('')}" fill="url(#leaf)" stroke="${INK}" stroke-width="0.8" stroke-opacity="0.7"/>`);
  parts.push(text('C', rx, ry - 44, 22, { face: 'serif', anchor: 'middle', opacity: 0.8 }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <radialGradient id="glow"><stop offset="0" stop-color="#e9b24a" stop-opacity="0.45"/><stop offset="1" stop-color="#e9b24a" stop-opacity="0"/></radialGradient>
    <linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7dd96"/><stop offset="0.5" stop-color="#c9963a"/><stop offset="1" stop-color="#f0cf7a"/></linearGradient>
  </defs>
  ${parts.join('\n  ')}
</svg>`;
}
