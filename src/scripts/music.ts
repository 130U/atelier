// Six records, none of them recorded. Each is a set of rules; the browser
// plays them as you listen, so no two hearings are the same.
import compositions from '../data/compositions.json';

export type Rec = (typeof compositions.records)[number];
export type NoteEvent = { kind: 'bell' | 'chord'; midi: number; velocity: number };

const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface Layer {
  rec: Rec;
  out: GainNode;
  dry: GainNode;
  wet: GainNode;
  echo: GainNode;
  step: number;
  next: number;
  bellIndex: number;
  stoppers: (() => void)[];
}

export class Orchestra {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private reverb!: ConvolverNode;
  private delayIn!: GainNode;
  private noise!: AudioBuffer;
  private layer: Layer | null = null;
  private timer = 0;
  onNote: ((e: NoteEvent) => void) | null = null;

  get playing() {
    return this.layer?.rec ?? null;
  }

  private build() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.01;
    limiter.release.value = 0.4;
    limiter.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(limiter);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(5.5);
    const ret = ctx.createGain();
    ret.gain.value = 0.85;
    this.reverb.connect(ret).connect(this.master);

    // A ping-pong echo, darkened on every repeat.
    this.delayIn = ctx.createGain();
    const merger = ctx.createChannelMerger(2);
    const left = ctx.createDelay(2);
    const right = ctx.createDelay(2);
    const fb = ctx.createGain();
    const tone = ctx.createBiquadFilter();
    left.delayTime.value = 0.42;
    right.delayTime.value = 0.42;
    fb.gain.value = 0.36;
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    this.delayIn.connect(left);
    left.connect(right).connect(tone).connect(fb).connect(left);
    left.connect(merger, 0, 0);
    right.connect(merger, 0, 1);
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.5;
    merger.connect(echoOut);
    echoOut.connect(this.master);
    echoOut.connect(this.reverb);

    const len = ctx.sampleRate * 3;
    this.noise = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = this.noise.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + w * 0.029;
        b1 = 0.985 * b1 + w * 0.032;
        b2 = 0.95 * b2 + w * 0.048;
        d[i] = (b0 + b1 + b2 + w * 0.02) * 0.9;
      }
    }
  }

  // A long tail of noise that darkens as it decays, like a large hall.
  private impulse(seconds: number) {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let y = 0;
      for (let i = 0; i < n; i++) {
        const t = i / ctx.sampleRate;
        const a = 0.65 * Math.exp(-t * 0.9) + 0.05;
        y += a * ((Math.random() * 2 - 1) - y);
        d[i] = t < 0.02 ? 0 : y * Math.exp((-6.9 * t) / (seconds * 0.8));
      }
    }
    return buf;
  }

  async play(rec: Rec) {
    if (!this.ctx) this.build();
    const ctx = this.ctx!;
    if (ctx.state === 'suspended') await ctx.resume();
    if (this.layer?.rec.id === rec.id) return;
    const now = ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0.8, now, 0.8);
    if (this.layer) this.retire(this.layer, 3);

    const out = ctx.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(1, now + 3);
    out.connect(this.master);
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const echo = ctx.createGain();
    dry.connect(out);
    wet.gain.value = 0.9;
    wet.connect(this.reverb);
    echo.gain.value = 0.55;
    echo.connect(this.delayIn);
    const layer: Layer = { rec, out, dry, wet, echo, step: 0, next: now + 0.1, bellIndex: 2, stoppers: [] };
    this.layer = layer;
    this.texture(layer);
    if (rec.glide > 0) this.glide(layer);
    if (!this.timer) this.timer = window.setInterval(() => this.schedule(), 30);
  }

  stop() {
    if (!this.ctx || !this.layer) return;
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0, now, 0.6);
    this.retire(this.layer, 2.5);
    this.layer = null;
  }

  private retire(layer: Layer, seconds: number) {
    const now = this.ctx!.currentTime;
    layer.out.gain.cancelScheduledValues(now);
    layer.out.gain.setValueAtTime(layer.out.gain.value, now);
    layer.out.gain.linearRampToValueAtTime(0, now + seconds);
    if (this.layer === layer) this.layer = null;
    window.setTimeout(() => {
      layer.stoppers.forEach((s) => s());
      layer.out.disconnect();
    }, seconds * 1000 + 6000);
  }

  private schedule() {
    const layer = this.layer;
    if (!layer || !this.ctx) return;
    const ctx = this.ctx;
    const rec = layer.rec;
    const stepDur = 60 / rec.bpm / 2;
    const perChord = rec.chordBars * 8;
    while (layer.next < ctx.currentTime + 0.3) {
      const t = layer.next;
      const s = layer.step;
      if (s % perChord === 0) {
        const degree = rec.progression[Math.floor(s / perChord) % rec.progression.length];
        this.chord(layer, t, perChord * stepDur, degree);
      }
      const accent = s % 8 === 0 ? 1.6 : s % 4 === 0 ? 1.2 : s % 2 === 0 ? 0.9 : 0.6;
      if (Math.random() < rec.bells.density * accent) this.bell(layer, t);
      if (rec.texture.type === 'rain') for (let k = 0; k < 5; k++) this.drop(layer, t + Math.random() * stepDur);
      if (rec.texture.type === 'night' && Math.random() < 0.18) this.cricket(layer, t);
      if (rec.texture.type === 'water' && Math.random() < 0.05) this.bubble(layer, t);
      layer.step++;
      layer.next += stepDur;
    }
  }

  private tone(layer: Layer, degree: number, k: number, base: number) {
    const sc = layer.rec.scale;
    const d = degree + 2 * k;
    return base + sc[d % sc.length] + 12 * Math.floor(d / sc.length);
  }

  private chord(layer: Layer, t: number, dur: number, degree: number) {
    const ctx = this.ctx!;
    const rec = layer.rec;
    const base = rec.root + 12;
    const tones = [0, 1, 2, 3].map((k) => this.tone(layer, degree, k, base));
    const attack = Math.min(3, dur * 0.4);
    const release = 4.5;
    const cutoff = 380 + rec.pad.brightness * 1700;
    for (const m of tones) {
      const g = ctx.createGain();
      const level = 0.05 * rec.pad.level * (m === tones[3] ? 0.55 : 1);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level, t + attack);
      g.gain.setValueAtTime(level, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + release);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 0.4;
      f.frequency.setValueAtTime(cutoff * 0.4, t);
      f.frequency.linearRampToValueAtTime(cutoff, t + attack);
      f.frequency.linearRampToValueAtTime(cutoff * 0.6, t + dur + release);
      const p = ctx.createStereoPanner();
      p.pan.value = rand(-0.5, 0.5);
      f.connect(g).connect(p);
      p.connect(layer.dry);
      p.connect(layer.wet);
      for (const [type, detune, mul, amp] of [
        ['sawtooth', -6, 1, 0.5],
        ['sawtooth', 7, 1, 0.5],
        ['triangle', 0, 0.5, 0.6],
      ] as const) {
        const o = ctx.createOscillator();
        const oa = ctx.createGain();
        o.type = type;
        o.frequency.value = hz(m) * mul;
        o.detune.value = detune + rand(-3, 3);
        oa.gain.value = amp;
        o.connect(oa).connect(f);
        o.start(t);
        o.stop(t + dur + release + 0.2);
      }
    }
    if (rec.bass > 0) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = hz(tones[0] - 24);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16 * rec.bass, t + 1.5);
      g.gain.setValueAtTime(0.16 * rec.bass, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + 2);
      o.connect(g).connect(layer.dry);
      o.start(t);
      o.stop(t + dur + 2.2);
    }
    this.emit(t, { kind: 'chord', midi: tones[0], velocity: 1 });
  }

  private bell(layer: Layer, t: number) {
    const ctx = this.ctx!;
    const rec = layer.rec;
    const sc = rec.scale;
    layer.bellIndex = Math.max(0, Math.min(sc.length * 2 - 1, layer.bellIndex + Math.round(rand(-2.4, 2.4))));
    const i = layer.bellIndex;
    const m = rec.root + 12 * rec.bells.octave + sc[i % sc.length] + 12 * Math.floor(i / sc.length);
    const v = rand(0.45, 1) * rec.bells.level;
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const idx = ctx.createGain();
    const amp = ctx.createGain();
    const pan = ctx.createStereoPanner();
    car.frequency.value = hz(m);
    mod.frequency.value = hz(m) * rec.bells.ratio;
    idx.gain.setValueAtTime(hz(m) * 2.2, t);
    idx.gain.exponentialRampToValueAtTime(hz(m) * 0.08, t + 1.4);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.07 * v, t + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 3.8);
    pan.pan.value = rand(-0.7, 0.7);
    mod.connect(idx).connect(car.frequency);
    car.connect(amp).connect(pan);
    pan.connect(layer.dry);
    pan.connect(layer.wet);
    pan.connect(layer.echo);
    car.start(t);
    mod.start(t);
    car.stop(t + 4);
    mod.stop(t + 4);
    this.emit(t, { kind: 'bell', midi: m, velocity: v });
  }

  private glide(layer: Layer) {
    const ctx = this.ctx!;
    const rec = layer.rec;
    const o = ctx.createOscillator();
    const vib = ctx.createOscillator();
    const vibAmt = ctx.createGain();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = hz(rec.root + 24);
    vib.frequency.value = 4.6;
    vibAmt.gain.value = 3;
    vib.connect(vibAmt).connect(o.frequency);
    g.gain.value = 0.022 * rec.glide;
    o.connect(g);
    g.connect(layer.wet);
    g.connect(layer.echo);
    o.start();
    vib.start();
    const move = window.setInterval(() => {
      const m = rec.root + 24 + rec.scale[Math.floor(Math.random() * rec.scale.length)];
      o.frequency.setTargetAtTime(hz(m), ctx.currentTime, 1.4);
    }, (60 / rec.bpm) * 4000);
    layer.stoppers.push(() => {
      window.clearInterval(move);
      o.stop();
      vib.stop();
    });
  }

  private texture(layer: Layer) {
    const ctx = this.ctx!;
    const { type, level } = layer.rec.texture;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    const shape: { [k: string]: [BiquadFilterType, number, number, number, number] } = {
      air: ['bandpass', 5200, 0.6, 0.02, 0.07],
      rain: ['highpass', 1800, 0.3, 0.05, 0.11],
      water: ['lowpass', 650, 0.5, 0.09, 0.09],
      room: ['lowpass', 260, 0.3, 0.05, 0.03],
      night: ['bandpass', 7000, 0.8, 0.012, 0.13],
    };
    const [ft, freq, q, amount, speed] = shape[type] ?? shape.air;
    f.type = ft;
    f.frequency.value = freq;
    f.Q.value = q;
    g.gain.value = amount * level;
    lfo.frequency.value = speed;
    depth.gain.value = amount * level * 0.6;
    lfo.connect(depth).connect(g.gain);
    src.connect(f).connect(g);
    g.connect(layer.dry);
    g.connect(layer.wet);
    src.start();
    lfo.start();
    layer.stoppers.push(() => {
      src.stop();
      lfo.stop();
    });
  }

  private drop(layer: Layer, t: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const p = ctx.createStereoPanner();
    f.type = 'bandpass';
    f.frequency.value = rand(2500, 6500);
    f.Q.value = 4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(rand(0.05, 0.2) * layer.rec.texture.level, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    p.pan.value = rand(-1, 1);
    src.connect(f).connect(g).connect(p).connect(layer.dry);
    src.start(t, Math.random() * 2, 0.08);
  }

  private cricket(layer: Layer, t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const p = ctx.createStereoPanner();
    o.frequency.value = rand(4300, 4900);
    p.pan.value = rand(-0.9, 0.9);
    const level = 0.006 * layer.rec.texture.level;
    for (let k = 0; k < 3; k++) {
      const s = t + k * 0.045;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(level, s + 0.006);
      g.gain.linearRampToValueAtTime(0, s + 0.025);
    }
    o.connect(g).connect(p);
    p.connect(layer.dry);
    p.connect(layer.wet);
    o.start(t);
    o.stop(t + 0.2);
  }

  private bubble(layer: Layer, t: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f0 = rand(500, 900);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 2.2, t + 0.07);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.012 * layer.rec.texture.level, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g);
    g.connect(layer.wet);
    o.start(t);
    o.stop(t + 0.12);
  }

  private emit(t: number, e: NoteEvent) {
    const delay = Math.max(0, (t - this.ctx!.currentTime) * 1000);
    window.setTimeout(() => this.onNote?.(e), delay);
  }
}

export const records = compositions.records;

// The record that suits the hour where the listener is.
export function recordForNow(date = new Date()) {
  const h = date.getHours();
  const id = h < 4 ? 'r02' : h < 7 ? 'r05' : h < 16 ? 'r03' : h < 19 ? 'r01' : h < 22 ? 'r06' : 'r04';
  return records.find((r) => r.id === id)!;
}
