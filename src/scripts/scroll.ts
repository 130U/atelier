// The handscroll. Each étude is painted once, in full, as a chromagram: twelve
// rows of pitch class in the order of the circle of fifths, time running left
// to right. A note is a stroke of watercolour in its pitch's pigment, pressed
// where the key was struck and thinning as the string dies away. The finished
// painting is then unrolled at the playhead, so each stroke appears as its
// note sounds and its tail lengthens while it rings.

import { type Rand } from '../lib/random';

// True solar time in hours: clock time corrected by the equation of time,
// taken at the central meridian of the visitor's time zone.
export function trueSolarTime(date = new Date()) {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const day = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86400000);
  const b = ((2 * Math.PI) / 365) * (day - 81);
  const equation = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const clock = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  return (((clock + equation / 60) % 24) + 24) % 24;
}

export interface Score {
  duration: number;
  onsets: number[];
  loud: number[];
}

// Where a moment falls across the scroll, as a fraction of its width, and back.
const MARGIN = 0.0075;
export const across = (t: number, duration: number) => Math.min(1, Math.max(0, t / duration)) * (1 - 2 * MARGIN) + MARGIN;
export const when = (f: number) => Math.min(1, Math.max(0, (f - MARGIN) / (1 - 2 * MARGIN)));

const DECAY = 0.6; // seconds for a struck note to fall to 1/e
const REACH = 0.46; // the widest stroke, as a share of a row

function lattice(rand: Rand) {
  const g = new Float32Array(256 * 256).map(() => rand());
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = x - xi;
    const v = y - yi;
    const su = u * u * (3 - 2 * u);
    const sv = v * v * (3 - 2 * v);
    const at = (i: number, j: number) => g[((j & 255) << 8) | (i & 255)];
    return (at(xi, yi) * (1 - su) + at(xi + 1, yi) * su) * (1 - sv) + (at(xi, yi + 1) * (1 - su) + at(xi + 1, yi + 1) * su) * sv;
  };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Pigment as absorbance, so overlapping washes mix the way paint does
// (Beer–Lambert): one unit of density gives the pigment's own colour.
const absorbance = (hex: string) =>
  [1, 3, 5].map((i) => -Math.log(Math.max(0.03, parseInt(hex.slice(i, i + 2), 16) / 255)));

export function paint(score: Score, pigments: string[], w: number, h: number, rand: Rand) {
  const rowH = h / 12;
  const reach = rowH * REACH;

  // Each row's envelope, column by column: a note sets its pitch's row to
  // the strength it was struck with, and the row decays until struck again.
  const half = Array.from({ length: 12 }, () => new Float32Array(w));
  const pressure = new Float32Array(w);
  const env = new Float32Array(12);
  const n = score.onsets.length / 3;
  const fall = Math.exp(-score.duration / ((1 - 2 * MARGIN) * w) / DECAY);
  let k = 0;
  for (let x = 0; x < w; x++) {
    const t = when((x + 0.5) / w) * score.duration;
    for (let r = 0; r < 12; r++) env[r] *= fall;
    for (; k < n && score.onsets[k * 3] / 100 <= t; k++) {
      const s = score.onsets[k * 3 + 1] / 99;
      const mask = score.onsets[k * 3 + 2];
      for (let pc = 0; pc < 12; pc++) if (mask & (1 << pc)) env[(pc * 7) % 12] = Math.max(env[(pc * 7) % 12], s);
    }
    for (let r = 0; r < 12; r++) half[r][x] = env[r] > 0.015 ? reach * env[r] ** 0.6 : 0;
    const loud = score.loud[Math.min(score.loud.length - 1, Math.floor(t * 4))] ?? 50;
    pressure[x] = 0.55 + 0.55 * (loud / 99);
  }

  // A brush lands round: dilate each stroke's leading edge by a disc.
  const span = Math.ceil(reach) + 1;
  for (let r = 0; r < 12; r++) {
    const src = half[r];
    const out = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      let m = src[x];
      for (let j = 1; j <= span && x + j < w; j++) {
        const v = src[x + j];
        if (v > j) m = Math.max(m, Math.sqrt(v * v - j * j));
      }
      out[x] = m;
    }
    half[r] = out;
  }

  const n1 = lattice(rand);
  const n2 = lattice(rand);
  const ox = rand() * 256;
  const oy = rand() * 256;
  const A = pigments.map(absorbance);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  const img = g.createImageData(w, h);
  const d = img.data;
  const scale = rowH / 12; // texture scale follows the row, so phone and desk match

  for (let y = 0; y < h; y++) {
    const r = Math.min(11, Math.floor(y / rowH));
    const dy = Math.abs(y + 0.5 - (r + 0.5) * rowH);
    const row = half[r];
    const a = A[r];
    for (let x = 0; x < w; x++) {
      const hw = row[x];
      if (hw < 0.35) continue;
      const fx = x / scale + ox;
      const fy = y / scale + oy;
      // Where the water stops, the edge wanders with the fibres of the paper.
      const edge = dy / hw + (n1(fx * 0.3, fy * 0.3) - 0.5) * 0.24;
      if (edge >= 1) continue;
      const cover = Math.min(1, (1 - edge) * hw * 1.6);
      // Pigment gathers at the edge as a wash dries (edge darkening).
      const rim = 1 + 0.8 * Math.exp(-((((1 - edge) * hw) / 1.1) ** 2));
      // Granulation: pigment settles into the tooth of the paper.
      const grain = 0.74 + 0.5 * n2(fx * 1.1, fy * 1.1);
      // Dry brush: as the stroke thins the hairs part into streaks.
      const thin = hw / reach;
      const hair = n2(fx * 0.05 + 37, fy * 0.9);
      const dry = smooth(0.78 - thin * 1.1, 0.9 - thin * 1.1, hair);
      const density = 0.92 * pressure[x] * cover * rim * grain * dry * (0.65 + 0.35 * thin);
      if (density < 0.01) continue;
      const tr = Math.exp(-a[0] * density);
      const tg = Math.exp(-a[1] * density);
      const tb = Math.exp(-a[2] * density);
      // Store as colour over transparent, so that over white it gives tr, tg, tb.
      const alpha = 1 - Math.min(tr, tg, tb);
      const p = (y * w + x) * 4;
      d[p] = (255 * (tr - 1 + alpha)) / alpha;
      d[p + 1] = (255 * (tg - 1 + alpha)) / alpha;
      d[p + 2] = (255 * (tb - 1 + alpha)) / alpha;
      d[p + 3] = 255 * alpha;
    }
  }
  g.putImageData(img, 0, 0);
  return canvas;
}

// One sheet of the scroll: the painting, unrolled to the present moment. What
// is still to come shows faintly, like the underdrawing of a copybook.
const GHOST = 0.13;
const WET = 0.045; // the stretch behind the playhead that is still wet, as a share of the width

export class Sheet {
  id: string | null = null;
  duration = 1;
  private art: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D;
  private wet = document.createElement('canvas');
  private wg = this.wet.getContext('2d')!;
  private shown = -1;
  private gloss = 0;
  private shownGloss = -1;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.g = canvas.getContext('2d')!;
  }

  size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    return [Math.max(1, Math.round(this.canvas.clientWidth * dpr)), Math.max(1, Math.round(this.canvas.clientHeight * dpr))] as const;
  }

  begin(id: string) {
    this.id = id;
    this.art = null;
    this.shown = -1;
    this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  set(art: HTMLCanvasElement, duration: number) {
    this.art = art;
    this.duration = duration;
    this.canvas.width = art.width;
    this.canvas.height = art.height;
    this.shown = -1;
  }

  // Unroll to time t. While the music plays the newest ink is wet and a
  // shade darker; when it stops, it dries.
  draw(t: number, playing: boolean, dt: number) {
    const art = this.art;
    if (!art) return;
    this.gloss += ((playing ? 1 : 0) - this.gloss) * Math.min(1, dt * 1.2);
    const W = art.width;
    const H = art.height;
    const x = t > 0 ? Math.round(across(t, this.duration) * W * 4) / 4 : 0;
    if (x === this.shown && Math.abs(this.gloss - this.shownGloss) < 0.01) return;
    this.shown = x;
    this.shownGloss = this.gloss;
    const g = this.g;
    g.clearRect(0, 0, W, H);
    if (x < W) {
      g.globalAlpha = GHOST;
      g.drawImage(art, x, 0, W - x, H, x, 0, W - x, H);
    }
    g.globalAlpha = 1;
    if (x >= 1) g.drawImage(art, 0, 0, x, H, 0, 0, x, H);
    const span = Math.min(x, Math.round(W * WET));
    if (span >= 2 && this.gloss > 0.01) {
      if (this.wet.width !== span || this.wet.height !== H) {
        this.wet.width = span;
        this.wet.height = H;
      }
      const wg = this.wg;
      wg.globalCompositeOperation = 'copy';
      wg.drawImage(art, x - span, 0, span, H, 0, 0, span, H);
      wg.globalCompositeOperation = 'destination-in';
      const fade = wg.createLinearGradient(0, 0, span, 0);
      fade.addColorStop(0, 'rgba(0,0,0,0)');
      fade.addColorStop(1, 'rgba(0,0,0,1)');
      wg.fillStyle = fade;
      wg.fillRect(0, 0, span, H);
      g.globalAlpha = 0.5 * this.gloss;
      g.drawImage(this.wet, x - span, 0);
      g.globalAlpha = 1;
    }
  }
}
