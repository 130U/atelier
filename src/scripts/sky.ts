import { etudes, byId, nameOf, clock, relation, partnerOf, companions, positionAngle, keyIndex, fifths, hash, pigment, PLATE, type Etude } from '../lib/theory';
import { Player } from './player';

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const url = {
  audio: (id: string) => `${BASE}audio/${id}.mp3`,
  data: (id: string) => `${BASE}data/${id}.json`,
  plate: (id: string) => `${BASE}plates/${id}.jpg`,
  thumb: (id: string) => `${BASE}plates/thumb/${id}.jpg`,
};
const TAU = Math.PI * 2;

interface Analysis {
  duration: number;
  onsets: number[];
  times: Float64Array;
}
const cache = new Map<string, Promise<Analysis>>();
function analysis(id: string) {
  if (!cache.has(id))
    cache.set(
      id,
      fetch(url.data(id))
        .then((r) => r.json())
        .then((d) => ({ duration: d.duration, onsets: d.onsets, times: Float64Array.from({ length: d.onsets.length / 3 }, (_, i) => d.onsets[i * 3] / 100) })),
    );
  return cache.get(id)!;
}

// The last onset at or before t.
function lastBefore(times: Float64Array, t: number) {
  let lo = 0;
  let hi = times.length - 1;
  if (hi < 0 || times[0] > t) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T;

export function start() {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const player = new Player(url.audio);
  const order = etudes.map((e) => e.id);
  const stars = new Map([...document.querySelectorAll<SVGGElement>('#sky .star')].map((g) => [g.dataset.id!, g]));
  const seq = new Map([...document.querySelectorAll<HTMLButtonElement>('[data-goto]')].map((b) => [b.dataset.goto!, b]));

  const chart = $('.chart');
  const tip = $('#tip');
  const trail = $<SVGPathElement>('#trail');
  const intro = $('#intro');
  const etudeEl = $('#etude');
  const img = $<HTMLImageElement>('#plate-img');
  const live = $<HTMLCanvasElement>('#plate-live');
  const ident = $('#ident');
  const nameEl = $('#name');
  const zh = $('#zh');
  const facts = $('#facts');
  const relations = $('#relations');
  const playerEl = $('#player');
  const playBtn = $<HTMLButtonElement>('#play');
  const nowTitle = $('#now-title');
  const nowName = $('#now-name');
  const timeEl = $('#time');
  const bar = $('#bar');
  const barFill = $('#bar-fill');
  const cycle = $<HTMLInputElement>('#cycle');
  const about = $<HTMLDialogElement>('#about');
  const lightbox = $<HTMLDialogElement>('#lightbox');
  const lightboxImg = $<HTMLImageElement>('#lightbox-img');

  let selected: string | null = null;
  let advancing = false;
  let current: { id: string; a: Analysis } | null = null;

  const centre = (id: string) => {
    const c = stars.get(id)!.querySelector('.body') as SVGCircleElement;
    return { x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) };
  };

  // A line of gold runs from the last star to the next.
  function drawTrail(from: string, to: string) {
    if (reduce) return;
    const a = centre(from);
    const b = centre(to);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    trail.setAttribute('d', `M${a.x} ${a.y} L${b.x} ${b.y}`);
    trail.style.setProperty('--len', String(len));
    trail.style.strokeDasharray = String(len);
    trail.classList.remove('on');
    void trail.getBoundingClientRect();
    trail.classList.add('on');
  }

  function fact(label: string, value: string) {
    const div = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    div.append(dt, dd);
    return div;
  }

  // Neighbours: the étude published beside it, its companions in the same
  // star system, those in its relative key, and those in its dominant or
  // subdominant, each named in the terms of harmony.
  function neighbours(e: Etude) {
    const out: { e: Etude; why: string }[] = [];
    const seen = new Set([e.id]);
    const add = (x: Etude, why: string) => {
      if (seen.has(x.id)) return;
      seen.add(x.id);
      out.push({ e: x, why });
    };
    const p = partnerOf(e);
    add(p, `published beside it, ${relation(e, p)}`);
    for (const x of companions(e)) add(x, 'in the same key, its companion star');
    for (const x of etudes) if (keyIndex(x) === keyIndex(e) && x.mode !== e.mode) add(x, relation(e, x));
    for (const x of etudes) {
      const up = (x.tonic - e.tonic + 12) % 12;
      if (x.mode === e.mode && (up === 7 || up === 5)) add(x, relation(e, x));
    }
    return out;
  }

  function multiplicity(e: Etude) {
    const c = companions(e);
    if (!c.length) return 'single';
    const names = c.map((x) => `Op. ${x.op} No. ${x.no}`).join(' and ');
    return `${c.length === 1 ? 'double' : 'triple'}, with ${names}`;
  }

  function showNow(e: Etude) {
    nowTitle.textContent = `Op. ${e.op} · No. ${e.no}`;
    nowName.textContent = nameOf(e);
  }

  function select(id: string, opts: { play?: boolean } = {}) {
    const e = byId.get(id);
    if (!e) return;
    const prev = selected;
    selected = id;
    for (const [k, g] of stars) g.classList.toggle('selected', k === id);
    for (const [k, b] of seq) b.setAttribute('aria-current', String(k === id));
    intro.hidden = true;
    etudeEl.hidden = false;
    img.srcset = `${url.thumb(id)} 520w, ${url.plate(id)} 1500w`;
    img.sizes = '(max-width: 960px) 92vw, 440px';
    img.src = url.thumb(id);
    img.alt = `Plate for Op. ${e.op}, No. ${e.no} in ${e.key}: its notes as stars on the circle of fifths`;
    ident.textContent = `Op. ${e.op} · No. ${e.no}`;
    nameEl.textContent = nameOf(e);
    zh.textContent = e.zh;
    facts.replaceChildren(
      fact('key', e.key),
      fact('position angle', `${positionAngle(e)}°, ${e.mode === 'major' ? 'outer' : 'inner'} ring`),
      fact('magnitude', e.magnitude.toFixed(1)),
      fact('multiplicity', multiplicity(e)),
      fact('tempo', e.tempo),
      fact('duration', clock(e.duration)),
      fact('onsets', String(e.onsets)),
    );
    relations.replaceChildren(
      ...neighbours(e).map(({ e: x, why }) => {
        const li = document.createElement('li');
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.setProperty('--pigment', pigment(x));
        const body = document.createElement('span');
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = `Op. ${x.op} · No. ${x.no}${x.en ? `, ${x.en}` : ''}`;
        b.addEventListener('click', () => select(x.id, { play: player.playing }));
        const w = document.createElement('span');
        w.className = 'why';
        w.textContent = ` ${why}`;
        body.append(b, w);
        li.append(dot, body);
        return li;
      }),
    );
    history.replaceState(null, '', `#${id}`);
    if (prev && prev !== id) drawTrail(prev, id);
    if (!player.id || player.id === id) showNow(e);
    analysis(id);
    if (opts.play) play(id);
  }

  async function play(id: string) {
    const next = order[order.indexOf(id) + 1];
    await player.play(id, next).catch(() => {});
    if (next) player.preload(next);
    const e = byId.get(id)!;
    showNow(e);
    analysis(id).then((a) => {
      if (player.id === id) current = { id, a };
    });
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `Étude Op. ${e.op} No. ${e.no}${e.en ? ` “${e.en}”` : ''}`,
        artist: 'Frédéric Chopin · Edward Neeman',
        album: 'The Étude Sky',
        artwork: [{ src: new URL(url.thumb(id), location.href).href, sizes: '520x520', type: 'image/jpeg' }],
      });
    }
  }

  function step(d: number) {
    const from = selected ?? player.id ?? order[0];
    const i = Math.max(0, Math.min(order.length - 1, order.indexOf(from) + d));
    select(order[i], { play: player.playing });
  }

  async function toggle() {
    if (player.playing) await player.pause();
    else if (player.id && (!selected || player.id === selected)) await player.resume();
    else select(selected ?? order[0], { play: true });
  }

  // Wiring.
  for (const [id, g] of stars) {
    g.addEventListener('click', () => select(id, { play: player.playing }));
    g.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        select(id, { play: player.playing });
      }
    });
    g.addEventListener('mouseenter', () => {
      const e = byId.get(id)!;
      const r = g.querySelector('.body')!.getBoundingClientRect();
      const f = chart.getBoundingClientRect();
      tip.innerHTML = '';
      const b = document.createElement('b');
      b.textContent = `${e.op}·${e.no}`;
      tip.append(b, document.createTextNode(e.en || e.key));
      tip.style.left = `${r.left + r.width / 2 - f.left}px`;
      tip.style.top = `${r.top - f.top}px`;
      tip.classList.add('on');
    });
    g.addEventListener('mouseleave', () => tip.classList.remove('on'));
  }
  for (const [id, b] of seq) b.addEventListener('click', () => select(id, { play: player.playing }));
  document.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) => b.addEventListener('click', () => step(Number(b.dataset.step))));
  $('[data-begin]').addEventListener('click', () => select(order[0], { play: true }));
  playBtn.addEventListener('click', toggle);
  bar.addEventListener('click', (ev) => {
    const r = bar.getBoundingClientRect();
    if (player.id) player.seek((ev.clientX - r.left) / r.width);
  });
  bar.addEventListener('keydown', (ev) => {
    if (!player.id || !player.duration) return;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      ev.preventDefault();
      ev.stopPropagation();
      player.seek((player.time + (ev.key === 'ArrowRight' ? 5 : -5)) / player.duration);
    }
  });
  addEventListener('keydown', (ev) => {
    const t = ev.target as HTMLElement;
    if (t.closest('input, textarea, dialog[open]')) return;
    if (ev.key === 'ArrowRight') step(1);
    else if (ev.key === 'ArrowLeft') step(-1);
    else if (ev.key === ' ' && !t.closest('button, summary, [role="button"], [role="slider"]')) {
      ev.preventDefault();
      toggle();
    }
  });
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => player.resume());
    navigator.mediaSession.setActionHandler('pause', () => player.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
  }

  document.querySelectorAll('[data-about]').forEach((b) => b.addEventListener('click', () => about.showModal()));
  $('#plate-open').addEventListener('click', () => {
    if (!selected) return;
    lightboxImg.src = url.plate(selected);
    lightboxImg.alt = img.alt;
    lightbox.showModal();
  });
  for (const d of [about, lightbox]) {
    d.querySelector('[data-close]')!.addEventListener('click', () => d.close());
    d.addEventListener('click', (ev) => {
      if (ev.target === d) d.close();
    });
  }

  // The plate plays along: a ring of gold at the present moment, and each note
  // glowing where it was drawn, for a moment after it sounds.
  const g = live.getContext('2d')!;
  function drawLive(t: number, a: Analysis) {
    const w = live.clientWidth;
    const dpr = Math.min(devicePixelRatio, 2);
    if (live.width !== Math.round(w * dpr)) {
      live.width = Math.round(w * dpr);
      live.height = Math.round(w * dpr);
    }
    const W = live.width;
    g.clearRect(0, 0, W, W);
    const f = Math.min(1, t / a.duration);
    const r = (PLATE.R0 + (PLATE.R1 - PLATE.R0) * f) * W;
    g.strokeStyle = 'rgba(184, 134, 43, 0.55)';
    g.lineWidth = 1.4 * dpr;
    g.beginPath();
    g.arc(W / 2, W / 2, r, 0, TAU);
    g.stroke();
    const last = lastBefore(a.times, t);
    for (let k = last; k >= 0 && t - a.times[k] < 0.9; k--) {
      const age = (t - a.times[k]) / 0.9;
      const s = a.onsets[k * 3 + 1] / 99;
      const mask = a.onsets[k * 3 + 2];
      const rr = PLATE.R0 + (PLATE.R1 - PLATE.R0) * (a.times[k] / a.duration);
      for (let pc = 0; pc < 12; pc++) {
        if (!(mask & (1 << pc))) continue;
        const ang = ((fifths(pc) + (hash(k * 3, pc, 5) - 0.5) * 0.5) / 12) * TAU;
        const x = (Math.sin(ang) * rr + 0.5) * W;
        const y = (0.5 - Math.cos(ang) * rr) * W;
        const rad = (0.012 + 0.02 * s) * W;
        const grad = g.createRadialGradient(x, y, 0, x, y, rad);
        grad.addColorStop(0, `rgba(232, 178, 70, ${(0.85 * (1 - age) * (0.4 + 0.6 * s)).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(232, 178, 70, 0)');
        g.fillStyle = grad;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }
  }

  let pulse = 0;
  let last = performance.now();
  function frame(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const id = player.id;
    playerEl.classList.toggle('playing', player.playing);
    playBtn.setAttribute('aria-label', player.playing ? 'Pause' : 'Play');
    for (const [k, s] of stars) s.classList.toggle('playing', k === id && player.playing);

    if (id) {
      const t = player.time;
      const dur = player.duration || byId.get(id)!.duration;
      const frac = Math.min(1, t / dur);
      barFill.style.width = `${frac * 100}%`;
      bar.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
      timeEl.textContent = `${clock(t)} / ${clock(dur)}`;

      if (cycle.checked && player.playing && !advancing && dur - t < 1.5) {
        const next = order[order.indexOf(id) + 1];
        if (next) {
          advancing = true;
          select(next, { play: true });
          window.setTimeout(() => (advancing = false), 2500);
        }
      }

      pulse *= Math.exp(-dt * 5);
      if (current?.id === id && player.playing) {
        const k = lastBefore(current.a.times, t);
        if (k >= 0 && t - current.a.times[k] < 0.06) pulse = Math.max(pulse, current.a.onsets[k * 3 + 1] / 99);
      }
      stars.get(id)!.style.setProperty('--pulse', reduce ? '0' : pulse.toFixed(3));

      if (current?.id === id && selected === id && !reduce) drawLive(t, current.a);
      else if (live.width) g.clearRect(0, 0, live.width, live.height);
    } else if (selected) {
      timeEl.textContent = `0:00 / ${clock(byId.get(selected)!.duration)}`;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // A link to one étude opens on that star.
  const fromHash = () => {
    const id = location.hash.slice(1);
    if (byId.has(id) && id !== selected) select(id, { play: player.playing });
  };
  addEventListener('hashchange', fromHash);
  fromHash();
}
