// Two decks and a crossfade: one étude hands over to the next without a gap,
// and never are two of them heard at full volume together.
const FADE_IN = 0.9;
const FADE_OUT = 1.6;

interface Deck {
  el: HTMLAudioElement;
  gain: GainNode | null;
  id: string | null;
}

export class Player {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private decks: Deck[];
  private active = 0;
  private primed = false;
  constructor(private url: (id: string) => string) {
    this.decks = [0, 1].map(() => {
      const el = new Audio();
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      return { el, gain: null, id: null };
    });
  }

  private ensure() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    for (const d of this.decks) {
      d.gain = ctx.createGain();
      d.gain.gain.value = 0;
      ctx.createMediaElementSource(d.el).connect(d.gain).connect(this.master);
    }
  }

  get deck() {
    return this.decks[this.active];
  }
  get id() {
    return this.deck.id;
  }
  get time() {
    return this.deck.el.currentTime;
  }
  get duration() {
    return this.deck.el.duration || 0;
  }
  get playing() {
    return !!this.deck.id && !this.deck.el.paused;
  }

  // Start an étude from the beginning, fading out whatever is sounding.
  // Everything up to el.play() runs synchronously, inside the visitor's tap.
  play(id: string, next?: string) {
    this.ensure();
    const ctx = this.ctx!;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    this.master!.gain.cancelScheduledValues(now);
    this.master!.gain.setTargetAtTime(1, now, 0.1);
    const old = this.deck;
    if (old.id) {
      old.gain!.gain.cancelScheduledValues(now);
      old.gain!.gain.setValueAtTime(old.gain!.gain.value, now);
      old.gain!.gain.linearRampToValueAtTime(0, now + FADE_OUT);
      const el = old.el;
      window.setTimeout(() => {
        if (this.deck.el !== el) el.pause();
      }, FADE_OUT * 1000 + 100);
    }
    this.active = 1 - this.active;
    const d = this.deck;
    d.id = id;
    if (!d.el.src.endsWith(this.url(id))) d.el.src = this.url(id);
    d.el.currentTime = 0;
    d.gain!.gain.cancelScheduledValues(now);
    d.gain!.gain.setValueAtTime(0, now);
    d.gain!.gain.linearRampToValueAtTime(1, now + FADE_IN);
    const started = d.el.play();
    // On the first tap, start and stop the other deck silently too, so a
    // browser that guards autoplay lets it continue the cycle later.
    const other = this.decks[1 - this.active];
    if (next && !other.id && !this.primed) {
      this.primed = true;
      other.el.src = this.url(next);
      other.el
        .play()
        .then(() => other.el.pause())
        .catch(() => {});
    }
    return started;
  }

  async pause() {
    if (!this.ctx || !this.playing) return;
    const now = this.ctx.currentTime;
    this.master!.gain.cancelScheduledValues(now);
    this.master!.gain.setTargetAtTime(0, now, 0.08);
    const el = this.deck.el;
    await new Promise((ok) => window.setTimeout(ok, 320));
    el.pause();
  }

  async resume() {
    if (!this.ctx || !this.deck.id) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    await this.deck.el.play();
    const now = this.ctx.currentTime;
    this.master!.gain.cancelScheduledValues(now);
    this.master!.gain.setTargetAtTime(1, now, 0.12);
  }

  seek(fraction: number) {
    const el = this.deck.el;
    if (el.duration) el.currentTime = Math.max(0, Math.min(el.duration - 0.2, fraction * el.duration));
  }

  // Warm the other deck so the next étude can begin without a gap.
  preload(id: string) {
    const other = this.decks[1 - this.active];
    if (other.el.paused && !other.el.src.endsWith(this.url(id))) other.el.src = this.url(id);
  }
}
