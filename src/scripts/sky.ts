import { etudes, byId, nameOf, clock, relation, partnerOf, companions, positionAngle, keyIndex, fifths, hash, pigment, PLATE, type Etude } from '../lib/theory';
import { Player } from './player';
import { Ink, Hand, seeded, trueSolarTime } from './ink';

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

  const hero = $('#sky');
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

  // The ink: seeded by the minute of arrival and placed by true solar time.
  const arrival = new Date();
  const solar = trueSolarTime(arrival);
  const sunAngle = ((solar - 12) / 24) * TAU;
  const rand = seeded(Math.floor(arrival.getTime() / 60000) ^ Math.round(solar * 3600));
  const ink = new Ink($<HTMLCanvasElement>('#ink'), rand);
  const hand = new Hand(rand, sunAngle);
  const h = Math.floor(solar);
  const m = Math.floor((solar - h) * 60);
  $('#solar').textContent = `The ink began at ${pad(h)}:${pad(m)}, true solar time`;

  // Chart geometry in the ink canvas's coordinates.
  const frameOf = () => {
    const r = svg.getBoundingClientRect();
    const o = hero.getBoundingClientRect();
    return { cx: r.left - o.left + r.width / 2, cy: r.top - o.top + r.height / 2, R: r.width * 0.33, scale: r.width / 1000, left: r.left - o.left, top: r.top - o.top };
  };
  const toCanvas = (x: number, y: number) => {
    const f = frameOf();
    return { x: f.cx + x * f.R, y: f.cy + y * f.R, R: f.R };
  };

  // The day's light, set down before anything plays: a pale disc where the
  // sun stands at this hour, the centre otherwise left blank.
  requestAnimationFrame(() => {
    ink.resize();
    const p = toCanvas(Math.sin(sunAngle) * 0.78, -Math.cos(sunAngle) * 0.78);
    ink.wash(p.x, p.y, p.R * 0.2, 0.22, solar > 6 && solar < 18 ? '#e9b24a' : '#8e9bc4');
    ink.drop(p.x, p.y, p.R * 0.05, 0.25);
  });

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
    if (!c.length) return 'Single';
    return `${c.length === 1 ? 'Double' : 'Triple'}, with ${c.map((x) => `Op. ${x.op} No. ${x.no}`).join(' and ')}`;
  }

  function showNow(e: Etude) {
    nowIdent.textContent = `Op. ${e.op} · No. ${pad(e.no)}`;
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
    $('#card-ident').textContent = `Op. ${e.op} · No. ${pad(e.no)}`;
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
        b.textContent = `Op. ${x.op} No. ${x.no}${x.en ? `, ${x.en}` : ''}`;
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
    // A touch of ink where the star is chosen.
    if (!opts.play && !player.playing) {
      const c = centre(id);
      const f = frameOf();
      const x = f.left + c.x * f.scale;
      const y = f.top + c.y * f.scale;
      ink.wash(x, y, f.R * 0.09, 0.3, pigment(e));
    }
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

  // The plate viewer.
  const vImg = $<HTMLImageElement>('#viewer-img');
  const vLive = $<HTMLCanvasElement>('#viewer-live');
  function view(id: string) {
    const e = byId.get(id)!;
    viewing = id;
    vImg.src = url.plate(id);
    vImg.alt = `Plate for Op. ${e.op}, No. ${e.no} in ${e.key}`;
    $('#viewer-ident').textContent = `Op. ${e.op} · No. ${pad(e.no)}`;
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
    g.addEventListener('mouseenter', () => {
      const e = byId.get(id)!;
      const r = g.querySelector('.body')!.getBoundingClientRect();
      const f = chart.getBoundingClientRect();
      tip.replaceChildren();
      const b = document.createElement('b');
      b.textContent = `${e.op}·${e.no}`;
      tip.append(b, document.createTextNode(e.en || e.key));
      tip.style.left = `${r.left + r.width / 2 - f.left}px`;
      tip.style.top = `${r.top - f.top}px`;
      tip.classList.add('on');
    });
    g.addEventListener('mouseleave', () => tip.classList.remove('on'));
  }
  for (const [id, b] of index) b.addEventListener('click', () => select(id, { play: player.playing }));
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
  addEventListener('resize', () => ink.resize());
  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => player.resume());
    navigator.mediaSession.setActionHandler('pause', () => player.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => step(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => step(1));
  }

  // The ink follows the music. Three brushes wander through the open centre.
  // While notes sound, the first draws a continuous line whose weight follows
  // the playing, and breaks into dry brush where the music thins; the second
  // traces a finer line; hard accents press a blot of ink; loud passages
  // leave a pale wash in the colour of the key.
  let inkedTo = -1;
  let inkedId: string | null = null;
  let lastWash = 0;
  let lastBlot = -9;
  let load = 0;
  let prev: { x: number; y: number; w: number }[] = [];
  function paint(t: number, id: string, a: Analysis, dt: number) {
    if (inkedId !== id || t < inkedTo || t - inkedTo > 1.5) {
      inkedId = id;
      inkedTo = t;
      prev = [];
      return;
    }
    const e = byId.get(id)!;
    let energy = 0;
    let pull = 0;
    let k = lastBefore(a.times, inkedTo) + 1;
    for (; k < a.times.length && a.times[k] <= t; k++) {
      const s = a.onsets[k * 3 + 1] / 99;
      const mask = a.onsets[k * 3 + 2];
      energy += s;
      const pcs = [...Array(12).keys()].filter((pc) => mask & (1 << pc));
      if (pcs.length) pull = (fifths(pcs[0]) / 12) * TAU;
      if (a.times[k] < lastBlot) lastBlot = -9;
      if (s > 0.88 && a.times[k] - lastBlot > 1.6) {
        lastBlot = a.times[k];
        const u = hand.place(pull, 0);
        const p = toCanvas(u.x, u.y);
        ink.blot(p.x, p.y, p.R * (0.07 + 0.08 * s), 0.85);
        for (let j = 0; j < 4; j++) ink.drop(p.x + (rand() - 0.5) * p.R * 0.22, p.y + (rand() - 0.5) * p.R * 0.22, p.R * (0.004 + rand() * 0.007), 0.75);
      } else if (s > 0.66 && rand() < 0.08) {
        const u = hand.place(pull, 2);
        const p = toCanvas(u.x, u.y);
        ink.blot(p.x, p.y, p.R * (0.03 + 0.03 * s), 0.55);
      }
    }
    // The brush's load of ink rises with the playing and falls in the rests.
    const target = Math.min(1, (energy / Math.max(dt, 0.016)) * 0.09);
    load += (target - load) * (target > load ? 0.35 : 0.06);
    const pts = hand.agents.slice(0, 2).map((g, i) => {
      const p = toCanvas(g.x, g.y);
      return { x: p.x, y: p.y, w: p.R * (i === 0 ? 0.012 + 0.07 * load : 0.005 + 0.02 * load) };
    });
    if (load > 0.08 && prev.length) {
      pts.forEach((p, i) => ink.line(prev[i].x, prev[i].y, p.x, p.y, prev[i].w, p.w, (i === 0 ? 0.35 : 0.25) + 0.6 * load));
    }
    prev = pts;
    const loud = (a.loud[Math.min(a.loud.length - 1, Math.floor(t * 4))] ?? 0) / 99;
    if (t < lastWash) lastWash = t;
    if (loud > 0.72 && t - lastWash > 7) {
      lastWash = t;
      const w = hand.agents[2];
      const p = toCanvas(w.x, w.y);
      ink.wash(p.x, p.y, p.R * (0.22 + 0.14 * rand()), 0.16, pigment(e));
    }
    inkedTo = t;
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
    if (playing) hand.move(dt);

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
        if (!reduce) paint(t, id, current.a, dt);
      }
      stars.get(id)!.style.setProperty('--pulse', reduce ? '0' : pulse.toFixed(3));

      if (viewer.open && viewing === id && current?.id === id && !reduce) drawLive(t, current.a);
      else if (vLive.width) vg.clearRect(0, 0, vLive.width, vLive.height);
    } else if (selected) {
      timeEl.textContent = `0:00 / ${clock(byId.get(selected)!.duration)}`;
    }
    if (!reduce) ink.frame(now);
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
