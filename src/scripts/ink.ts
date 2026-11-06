// Sumi ink on paper. Drops bloom and dry; strong notes are laid as dry-brush
// strokes; loud passages leave a pale wash of colour. The painting starts
// from the true solar time at which the page is opened, so no two are alike.

export type Rand = () => number;

export function seeded(seed: number): Rand {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

const INK = [22, 22, 30];

function lattice(rand: Rand) {
  const g = new Float32Array(64 * 64).map(() => rand());
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const at = (i: number, j: number) => g[(((j & 63) + 64) % 64) * 64 + (((i & 63) + 64) % 64)];
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    return at(xi, yi) * (1 - u) * (1 - v) + at(xi + 1, yi) * u * (1 - v) + at(xi, yi + 1) * (1 - u) * v + at(xi + 1, yi + 1) * u * v;
  };
}

// A drop of ink on absorbent paper: a mottled body, an irregular edge where
// the water stops, and that edge darker, as ink gathers there as it dries.
function dropStamp(rand: Rand, color: number[]) {
  const N = 192;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const img = g.createImageData(N, N);
  const n = lattice(rand);
  const o = rand() * 40;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = (x - N / 2) / (N / 2);
      const dy = (y - N / 2) / (N / 2);
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const edge = 0.7 + 0.18 * n(Math.cos(a) * 2 + o, Math.sin(a) * 2 + o) + 0.07 * n(Math.cos(a) * 7 + o, Math.sin(a) * 7);
      if (r > edge + 0.03) continue;
      const body = Math.min(1, Math.max(0, (edge - r) / 0.2));
      const mottle = 0.35 + 0.65 * n(dx * 5 + o, dy * 5 + o);
      const rim = Math.exp(-(((edge - r) / 0.05) ** 2)) * 0.22;
      const grain = 0.86 + 0.28 * Math.random();
      const alpha = Math.min(1, (body * (0.55 + 0.45 * mottle) * 0.95 + rim) * grain);
      const p = (y * N + x) * 4;
      img.data[p] = color[0];
      img.data[p + 1] = color[1];
      img.data[p + 2] = color[2];
      img.data[p + 3] = alpha * 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}

// A small, soft round tip for fine lines, where hairs would only read as noise.
function tipStamp() {
  const N = 48;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  grad.addColorStop(0, `rgba(${INK.join(',')}, 1)`);
  grad.addColorStop(0.55, `rgba(${INK.join(',')}, 0.85)`);
  grad.addColorStop(1, `rgba(${INK.join(',')}, 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, N, N);
  return c;
}

// The water that runs ahead of the ink into the paper: pale, with a ragged,
// fibrous edge.
function bleedStamp(rand: Rand) {
  const N = 192;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  const img = g.createImageData(N, N);
  const n = lattice(rand);
  const o = rand() * 40;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = (x - N / 2) / (N / 2);
      const dy = (y - N / 2) / (N / 2);
      const r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const fibre = 0.1 * n(Math.cos(a) * 18 + o, Math.sin(a) * 18 + o) + 0.06 * n(Math.cos(a) * 41, Math.sin(a) * 41 + o);
      const edge = 0.62 + 0.2 * n(Math.cos(a) * 1.6 + o, Math.sin(a) * 1.6) + fibre;
      if (r > edge) continue;
      const fade = Math.min(1, (edge - r) / 0.5) ** 0.7;
      const alpha = fade * (0.55 + 0.45 * n(dx * 9 + o, dy * 9)) * (0.85 + 0.3 * Math.random());
      const p = (y * N + x) * 4;
      img.data[p] = INK[0];
      img.data[p + 1] = INK[1];
      img.data[p + 2] = INK[2];
      img.data[p + 3] = Math.min(1, alpha) * 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}

// The mark of a loaded brush dragged sideways: streaks where the hairs part.
function brushStamp(rand: Rand) {
  const W = 96;
  const H = 96;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(W, H);
  const n = lattice(rand);
  const o = rand() * 40;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (W / 2);
      const dy = (y - H / 2) / (H / 2);
      // A flat belly of hairs: even along the stroke, ragged only at its sides.
      const shape = Math.max(0, 1 - Math.abs(dx) ** 4) * Math.max(0, 1 - Math.abs(dy) ** 3);
      const hairs = n(o, y * 0.55 + o) * 0.6 + n(o + 3, y * 1.7) * 0.4;
      const split = hairs > 0.4 ? 1 : hairs > 0.3 ? 0.45 : 0.12;
      const alpha = Math.min(1, shape * 1.4) * split;
      const p = (y * W + x) * 4;
      img.data[p] = INK[0];
      img.data[p + 1] = INK[1];
      img.data[p + 2] = INK[2];
      img.data[p + 3] = alpha * 235;
    }
  g.putImageData(img, 0, 0);
  return c;
}

interface Mark {
  t0: number;
  life: number;
  paint: (g: CanvasRenderingContext2D, k: number) => void;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

export class Ink {
  private g: CanvasRenderingContext2D;
  private dry = document.createElement('canvas');
  private dg: CanvasRenderingContext2D;
  private marks: Mark[] = [];
  private drops: HTMLCanvasElement[];
  private brushes: HTMLCanvasElement[];
  private bleeds: HTMLCanvasElement[];
  private tip = tipStamp();
  private tints = new Map<string, HTMLCanvasElement[]>();
  private lastFade = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;

  constructor(
    private canvas: HTMLCanvasElement,
    private rand: Rand,
  ) {
    this.g = canvas.getContext('2d')!;
    this.dg = this.dry.getContext('2d')!;
    this.drops = Array.from({ length: 6 }, () => dropStamp(rand, INK));
    this.brushes = Array.from({ length: 3 }, () => brushStamp(rand));
    this.bleeds = Array.from({ length: 4 }, () => bleedStamp(rand));
    this.resize();
  }

  get size() {
    return { w: this.w, h: this.h };
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio, 1.5);
    const W = Math.round(r.width * dpr);
    const H = Math.round(r.height * dpr);
    if (W === this.canvas.width && H === this.canvas.height) return;
    const old = document.createElement('canvas');
    old.width = this.dry.width;
    old.height = this.dry.height;
    if (old.width) old.getContext('2d')!.drawImage(this.dry, 0, 0);
    this.canvas.width = this.dry.width = W;
    this.canvas.height = this.dry.height = H;
    if (old.width) this.dg.drawImage(old, 0, 0, W, H);
    this.w = r.width;
    this.h = r.height;
    this.dpr = dpr;
  }

  private tintStamps(hex: string) {
    if (!this.tints.has(hex)) {
      const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      this.tints.set(hex, Array.from({ length: 3 }, () => dropStamp(this.rand, rgb)));
    }
    return this.tints.get(hex)!;
  }

  private add(life: number, paint: Mark['paint']) {
    this.marks.push({ t0: performance.now(), life, paint });
  }

  // A drop that blooms outwards over its life, then dries a little paler.
  drop(x: number, y: number, size: number, tone: number, stamp?: HTMLCanvasElement) {
    const s = stamp ?? this.drops[Math.floor(this.rand() * this.drops.length)];
    const rot = this.rand() * Math.PI * 2;
    const squash = 0.8 + this.rand() * 0.4;
    const d = this.dpr;
    this.add(900 + size * 6, (g, k) => {
      const r = size * (0.35 + 0.65 * easeOut(k)) * d;
      g.save();
      g.translate(x * d, y * d);
      g.rotate(rot);
      g.scale(1, squash);
      g.globalAlpha = tone * (1 - 0.25 * k);
      g.drawImage(s, -r, -r, r * 2, r * 2);
      g.restore();
    });
  }

  // A blot where the brush is pressed: a pale bleed spreading into the paper,
  // and inside it a dense, irregular core.
  blot(x: number, y: number, size: number, tone: number) {
    this.drop(x, y, size, tone * 0.32, this.bleeds[Math.floor(this.rand() * this.bleeds.length)]);
    this.drop(x + (this.rand() - 0.5) * size * 0.2, y + (this.rand() - 0.5) * size * 0.2, size * 0.42, Math.min(1, tone * 1.25));
  }

  // A pale wash in the colour of the key.
  wash(x: number, y: number, size: number, tone: number, hex: string) {
    const stamps = this.tintStamps(hex);
    this.drop(x, y, size, tone, stamps[Math.floor(this.rand() * stamps.length)]);
  }

  // A dry-brush stroke along a gentle curve, laid down over its life.
  stroke(x0: number, y0: number, x1: number, y1: number, width: number, tone: number) {
    const bend = (this.rand() - 0.5) * 0.6;
    const cx = (x0 + x1) / 2 - (y1 - y0) * bend;
    const cy = (y0 + y1) / 2 + (x1 - x0) * bend;
    const brush = this.brushes[Math.floor(this.rand() * this.brushes.length)];
    const length = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(8, Math.round(length / (width * 0.16)));
    const jitter = Array.from({ length: steps + 1 }, () => this.rand());
    const d = this.dpr;
    this.add(520, (g, k) => {
      // (a single sweep, laid down progressively)
      const upto = Math.round(steps * easeOut(k));
      for (let i = 0; i <= upto; i++) {
        const u = i / steps;
        const x = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx + u * u * x1;
        const y = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy + u * u * y1;
        const tx = 2 * (1 - u) * (cx - x0) + 2 * u * (x1 - cx);
        const ty = 2 * (1 - u) * (cy - y0) + 2 * u * (y1 - cy);
        const pressure = Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.02)) ** 0.7 * (0.75 + 0.25 * jitter[i]);
        const w = width * pressure * d;
        g.save();
        g.translate(x * d, y * d);
        g.rotate(Math.atan2(ty, tx));
        g.globalAlpha = tone * (0.35 + 0.65 * (1 - u * 0.7)) * 0.22;
        g.drawImage(brush, -w * 0.18, -w / 2, w * 0.36, w);
        g.restore();
      }
    });
  }

  // The brush moved from one point to the next while the music sounded: a
  // run of overlapping presses, straight onto the paper, so the line is
  // continuous and its weight follows the playing.
  line(x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, tone: number) {
    const d = this.dpr;
    const g = this.dg;
    const length = Math.hypot(x1 - x0, y1 - y0);
    const angle = Math.atan2(y1 - y0, x1 - x0);
    const fine = Math.max(w0, w1) * d < 6;
    const steps = Math.max(1, Math.ceil(length / (Math.min(w0, w1) * (fine ? 0.25 : 0.035) + 0.3)));
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const w = (w0 + (w1 - w0) * u) * d;
      g.save();
      g.translate((x0 + (x1 - x0) * u) * d, (y0 + (y1 - y0) * u) * d);
      g.rotate(angle + (this.rand() - 0.5) * 0.12);
      if (fine) {
        g.globalAlpha = Math.min(1, tone) * 0.35;
        g.drawImage(this.tip, -w / 2, -w / 2, w, w);
      } else {
        g.globalAlpha = Math.min(1, tone) * 0.075;
        const b = this.brushes[Math.floor(this.rand() * this.brushes.length)];
        g.drawImage(b, -w * 0.3, -w / 2, w * 0.6, w);
      }
      g.restore();
    }
  }

  frame(now: number) {
    const g = this.g;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // Old ink fades slowly, so the painting never closes over.
    if (now - this.lastFade > 4000) {
      this.lastFade = now;
      this.dg.save();
      this.dg.globalCompositeOperation = 'destination-out';
      this.dg.fillStyle = 'rgba(0,0,0,0.012)';
      this.dg.fillRect(0, 0, this.dry.width, this.dry.height);
      this.dg.restore();
    }
    g.drawImage(this.dry, 0, 0);
    this.marks = this.marks.filter((m) => {
      const k = Math.min(1, (now - m.t0) / m.life);
      if (k >= 1) {
        m.paint(this.dg, 1);
        return false;
      }
      m.paint(g, k);
      return true;
    });
  }
}

// Brushes that wander through the open centre of the sky. Each onset leaves
// ink near one of them, pulled towards its pitch class on the circle of fifths.
export class Hand {
  agents: { x: number; y: number; phase: number; angle: number }[];
  last: { x: number; y: number } | null = null;
  private t = 0;
  constructor(
    private rand: Rand,
    start: number,
  ) {
    this.agents = [0, 1, 2].map((i) => ({
      x: Math.sin(start) * (0.45 + 0.1 * i) + (rand() - 0.5) * 0.2,
      y: -Math.cos(start) * (0.45 + 0.1 * i) + (rand() - 0.5) * 0.2,
      phase: rand() * 100,
      angle: 0,
    }));
  }
  move(dt: number) {
    this.t += dt;
    for (const [i, a] of this.agents.entries()) {
      const speed = 0.1 + i * 0.05;
      const ang = Math.sin(this.t * 0.11 + a.phase) * 2.2 + Math.sin(this.t * 0.037 + a.phase * 2) * 3.1;
      a.angle = ang;
      a.x += Math.cos(ang) * speed * dt;
      a.y += Math.sin(ang) * speed * dt;
      const r = Math.hypot(a.x, a.y);
      if (r > 0.82) {
        a.x *= 0.82 / r;
        a.y *= 0.82 / r;
        a.phase += 1.3;
      }
    }
  }
  place(pcAngle: number, which: number) {
    const a = this.agents[which % this.agents.length];
    const pull = 0.12 + this.rand() * 0.12;
    return {
      x: a.x + Math.sin(pcAngle) * pull + (this.rand() - 0.5) * 0.08,
      y: a.y - Math.cos(pcAngle) * pull + (this.rand() - 0.5) * 0.08,
    };
  }
}
