import { etudes, byId, ident, short, nameOf, clock, relation, partnerOf, companions, positionAngle, keyIndex, fifths, pigment, PIGMENTS, PLATE, type Etude } from '../lib/theory';
import { hash, seeded } from '../lib/random';
import { Player } from './player';
import { Sheet, paint, across, when, trueSolarTime } from './scroll';

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const url = {
  audio: (id: string) => `${BASE}audio/${id}.mp3`,
  data: (id: string) => `${BASE}data/${id}.json`,
  plate: (id: string) => `${BASE}plates/${id}.jpg`,
  thumb: (id: string) => `${BASE}plates/thumb/${id}.jpg`,
};
const TAU = Math.PI * 2;
const pad = (n: number) => String(n).padStart(2, '0');

interface Analysis {
  duration: number;
  onsets: number[];
  loud: number[];
  times: Float64Array;
}
const cache = new Map<string, Promise<Analysis>>();
function analysis(id: string) {
  if (!cache.has(id))
    cache.set(
      id,
      fetch(url.data(id))
        .then((r) => r.json())
        .then((d) => ({
          duration: d.duration,
          onsets: d.onsets,
          loud: d.loud,
          times: Float64Array.from({ length: d.onsets.length / 3 }, (_, i) => d.onsets[i * 3] / 100),
        })),
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
  const stars = new Map([...document.querySelectorAll<SVGGElement>('#chart .star')].map((g) => [g.dataset.id!, g]));
  const index = new Map([...document.querySelectorAll<HTMLButtonElement>('[data-goto]')].map((b) => [b.dataset.goto!, b]));

  const svg = $<SVGSVGElement>('#chart');
  const chart = $('.chart');
  const tip = $('#tip');
  const trail = $<SVGPathElement>('#trail');
  const intro = $('#intro');
  const card = $('#card');
  const playerEl = $('#player');
  const playBtn = $<HTMLButtonElement>('#play');
  const nowIdent = $('#now-ident');
  const nowName = $('#now-name');
  const timeEl = $('#time');
  const bar = $('#bar');
  const barFill = $('#bar-fill');
  const cycle = $<HTMLInputElement>('#cycle');
  const viewer = $<HTMLDialogElement>('#viewer');

  let selected: string | null = null;
  let viewing: string | null = null;
  let advancing = false;
  let current: { id: string; a: Analysis } | null = null;

  // The handscroll. Two sheets: the étude on the scroll now, and the one before
  // it fading out. The paper and brush are seeded by the minute of arrival and
  // the true solar time, so no two visits are painted quite alike.
  const arrival = new Date();
  const solar = trueSolarTime(arrival);
  const seed = Math.floor(arrival.getTime() / 60000) ^ Math.round(solar * 3600);
  const sheets = [new Sheet($<HTMLCanvasElement>('#scroll-a')), new Sheet($<HTMLCanvasElement>('#scroll-b'))];
  let sheet = 0;
  const sheetEl = $('.scroll-sheet');
  const playhead = $('#playhead');
  const scrollTitle = $('#scroll-title');
  const scrollNote = $('#scroll-note');
  const solarText = `${pad(Math.floor(solar))}:${pad(Math.floor((solar % 1) * 60))}`;

  function render(s: Sheet, id: string) {
    analysis(id).then((a) => {
      if (s.id !== id) return;
      const [w, h] = s.size();
      s.set(paint(a, PIGMENTS, w, h, seeded(seed + order.indexOf(id) * 7919)), a.duration);
    });
  }

  function unroll(id: string) {
    if (sheets[sheet].id === id) return;
    const e = byId.get(id)!;
    sheets[sheet].canvas.classList.remove('on');
    sheet = 1 - sheet;
    const s = sheets[sheet];
    s.begin(id);
    s.canvas.classList.add('on');
    render(s, id);
    scrollTitle.textContent = `Handscroll · ${ident(e)}${e.nickname ? ` · ${e.nickname}` : ''}`;
    scrollNote.textContent = `${e.key} · ${clock(e.duration)} · ${solarText} true solar time`;
  }

  const centre = (id: string) => {
    const g = stars.get(id)!;
    return { x: Number(g.dataset.x), y: Number(g.dataset.y) };
  };

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

  function entry(label: string, value: string, wide = false) {
    const div = document.createElement('div');
    if (wide) div.className = 'wide';
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    dd.textContent = value;
    div.append(dt, dd);
    return div;
  }

  // The études nearest in key, closest first: the one published beside it,
  // companions in the same key, those in the relative key, then the dominant
  // and subdominant. Four at most.
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
    return out.slice(0, 4);
  }

  function multiplicity(e: Etude) {
    const c = companions(e);
    if (!c.length) return 'Single';
    return `${c.length === 1 ? 'Double' : 'Triple'}, with ${c.map(ident).join(' and ')}`;
  }

  function showNow(e: Etude) {
    nowIdent.textContent = ident(e);
    nowName.textContent = nameOf(e);
  }

  function select(id: string, opts: { play?: boolean } = {}) {
    const e = byId.get(id);
    if (!e) return;
    const prev = selected;
    selected = id;
    for (const [k, g] of stars) g.classList.toggle('selected', k === id);
    for (const [k, b] of index) b.setAttribute('aria-current', String(k === id));
    intro.hidden = true;
    card.hidden = false;
    $('#card-ident').textContent = ident(e);
    $('#card-name').textContent = nameOf(e);
    $('#card-key').textContent = `${e.key} · ${e.tempo}`;
    $('#card-entry').replaceChildren(
      entry('Position angle', `${positionAngle(e)}°, ${e.mode === 'major' ? 'outer' : 'inner'} ring`),
      entry('Magnitude', e.magnitude.toFixed(1)),
      entry('Duration', clock(e.duration)),
      entry('Onsets', String(e.onsets)),
      entry('Multiplicity', multiplicity(e), true),
    );
    $('#card-neighbours').replaceChildren(
      ...neighbours(e).map(({ e: x, why }) => {
        const li = document.createElement('li');
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.setProperty('--pigment', pigment(x));
        const body = document.createElement('span');
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = `${ident(x)}${x.nickname ? `, ${x.nickname}` : ''}`;
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
    unroll(id);
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
        title: `Étude ${ident(e)}${e.nickname ? `, ${e.nickname}` : ''}`,
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

  // One label for a star, on the chart or in the index: its number and name.
  function showTip(id: string, anchor: Element) {
    const e = byId.get(id)!;
    const r = anchor.getBoundingClientRect();
    const b = document.createElement('b');
    b.textContent = short(e);
    tip.replaceChildren(b, document.createTextNode(nameOf(e)));
    tip.style.left = `${r.left + r.width / 2}px`;
    tip.style.top = `${r.top}px`;
    tip.classList.add('on');
  }
  const hideTip = () => tip.classList.remove('on');

  // The plate viewer.
  const vImg = $<HTMLImageElement>('#viewer-img');
  const vLive = $<HTMLCanvasElement>('#viewer-live');
  function view(id: string) {
    const e = byId.get(id)!;
    viewing = id;
    vImg.src = url.plate(id);
    vImg.alt = `Plate for ${ident(e)}, ${e.key}`;
    $('#viewer-ident').textContent = ident(e);
    $('#viewer-name').textContent = nameOf(e);
    $('#viewer-key').textContent = `${e.key} · ${e.tempo} · mag ${e.magnitude.toFixed(1)} · ${clock(e.duration)}`;
    $('#viewer-play').textContent = player.id === id && player.playing ? 'Playing' : 'Listen';
    if (!viewer.open) viewer.showModal();
    analysis(id);
  }
  $('#viewer-play').addEventListener('click', () => {
    if (!viewing) return;
    if (player.id === viewing && player.playing) return;
    select(viewing, { play: true });
    $('#viewer-play').textContent = 'Playing';
  });
  document.querySelectorAll<HTMLButtonElement>('[data-view-step]').forEach((b) =>
    b.addEventListener('click', () => {
      const i = (order.indexOf(viewing!) + Number(b.dataset.viewStep) + order.length) % order.length;
      view(order[i]);
    }),
  );
  viewer.querySelector('[data-close]')!.addEventListener('click', () => viewer.close());
  viewer.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      ev.preventDefault();
      const i = (order.indexOf(viewing!) + (ev.key === 'ArrowRight' ? 1 : -1) + order.length) % order.length;
      view(order[i]);
    }
  });
  viewer.addEventListener('close', () => (viewing = null));
  document.querySelectorAll<HTMLButtonElement>('[data-plate]').forEach((b) => b.addEventListener('click', () => view(b.dataset.plate!)));
  $('#card-plate').addEventListener('click', () => selected && view(selected));

  // Wiring.
  for (const [id, g] of stars) {
    g.addEventListener('click', () => select(id, { play: player.playing }));
    g.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        select(id, { play: player.playing });
      }
    });
    g.addEventListener('mouseenter', () => showTip(id, g.querySelector('.body')!));
    g.addEventListener('mouseleave', hideTip);
  }
  for (const [id, b] of index) {
    b.addEventListener('click', () => select(id, { play: player.playing }));
    b.addEventListener('mouseenter', () => showTip(id, b));
    b.addEventListener('focus', () => showTip(id, b));
    b.addEventListener('mouseleave', hideTip);
    b.addEventListener('blur', hideTip);
  }
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
    if (viewer.open || t.closest('input, textarea')) return;
    if (ev.key === 'ArrowRight') step(1);
    else if (ev.key === 'ArrowLeft') step(-1);
    else if (ev.key === ' ' && !t.closest('button, summary, a, [role="button"], [role="slider"]')) {
      ev.preventDefault();
      toggle();
    }
  });
  // The chart is drawn in a 1000-unit square; its lettering is sized in
  // screen pixels through --z, the units to a pixel at the current size.
  new ResizeObserver(([entry]) => {
    if (entry.contentRect.width) chart.style.setProperty('--z', (1000 / entry.contentRect.width).toFixed(3));
  }).observe(svg);

  let resizing = 0;
  addEventListener('resize', () => {
    clearTimeout(resizing);
    resizing = window.setTimeout(() => sheets.forEach((s) => s.id && render(s, s.id)), 200);
  });
  // Touching the scroll moves the music to that moment.
  sheetEl.addEventListener('click', (ev) => {
    const id = sheets[sheet].id;
    if (!id) return;
    const r = sheetEl.getBoundingClientRect();
    const f = when((ev.clientX - r.left) / r.width);
    if (player.id === id) player.seek(f);
    else {
      select(id);
      play(id).then(() => player.id === id && player.seek(f));
    }
  });
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => player.resume());
    navigator.mediaSession.setActionHandler('pause', () => player.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
  }

  // The plate in the viewer plays along: a gold ring at the present moment,
  // and each note glowing where it was drawn.
  const vg = vLive.getContext('2d')!;
  function drawLive(t: number, a: Analysis) {
    const w = vLive.clientWidth;
    const dpr = Math.min(devicePixelRatio, 2);
    if (vLive.width !== Math.round(w * dpr)) {
      vLive.width = Math.round(w * dpr);
      vLive.height = Math.round(w * dpr);
    }
    const W = vLive.width;
    vg.clearRect(0, 0, W, W);
    const f = Math.min(1, t / a.duration);
    vg.strokeStyle = 'rgba(176, 56, 44, 0.55)';
    vg.lineWidth = 1.2 * dpr;
    vg.beginPath();
    vg.arc(W / 2, W / 2, (PLATE.R0 + (PLATE.R1 - PLATE.R0) * f) * W, 0, TAU);
    vg.stroke();
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
        const grad = vg.createRadialGradient(x, y, 0, x, y, rad);
        grad.addColorStop(0, `rgba(232, 178, 70, ${(0.85 * (1 - age) * (0.4 + 0.6 * s)).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(232, 178, 70, 0)');
        vg.fillStyle = grad;
        vg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }
  }

  let pulse = 0;
  let last = performance.now();
  function frame(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const id = player.id;
    const playing = player.playing;
    playerEl.classList.toggle('playing', playing);
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    for (const [k, s] of stars) s.classList.toggle('playing', k === id && playing);

    if (id) {
      const t = player.time;
      const dur = player.duration || byId.get(id)!.duration;
      const frac = Math.min(1, t / dur);
      barFill.style.width = `${frac * 100}%`;
      bar.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
      timeEl.textContent = `${clock(t)} / ${clock(dur)}`;

      if (cycle.checked && playing && !advancing && dur - t < 1.5) {
        const next = order[order.indexOf(id) + 1];
        if (next) {
          advancing = true;
          select(next, { play: true });
          window.setTimeout(() => (advancing = false), 2500);
        }
      }

      pulse *= Math.exp(-dt * 5);
      if (current?.id === id && playing) {
        const k = lastBefore(current.a.times, t);
        if (k >= 0 && t - current.a.times[k] < 0.06) pulse = Math.max(pulse, current.a.onsets[k * 3 + 1] / 99);
      }
      stars.get(id)!.style.setProperty('--pulse', reduce ? '0' : pulse.toFixed(3));

      if (viewer.open && viewing === id && current?.id === id && !reduce) drawLive(t, current.a);
      else if (vLive.width) vg.clearRect(0, 0, vLive.width, vLive.height);
    } else if (selected) {
      timeEl.textContent = `0:00 / ${clock(byId.get(selected)!.duration)}`;
    }
    const s = sheets[sheet];
    const live = !!id && s.id === id;
    const t = live ? player.time : 0;
    s.draw(t, live && playing, dt);
    playhead.classList.toggle('on', live && t > 0);
    if (live) playhead.style.transform = `translateX(${across(t, s.duration) * sheetEl.clientWidth}px)`;
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
  if (!selected) unroll(order[0]);
}
