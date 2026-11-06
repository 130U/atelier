import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import latent from '../data/latent.json';
import { Orchestra, records, recordForNow, type Rec } from './music';

interface Item {
  id: string;
  kind: 'image' | 'record';
  no: number;
  title: string;
  sentence: string;
  src: string;
  w: number;
  h: number;
  pos: number[];
  near: { id: string; s: number }[];
  score: number;
  rank: number;
  of: number;
  readAs: string;
  source?: string;
  lines?: number;
  composition?: string;
}

const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');
const media = (src: string, thumb = false) => `${BASE}media/${thumb ? 'thumb/' : ''}${src}`;

const BG = 0x0a0a0b;
const BASE_COLOR = new THREE.Color('#ebe7df');
const ACCENT = new THREE.Color('#f2cf96');
const HOME = new THREE.Vector3(0, 0, 0);
const HOME_DISTANCE = 3.6;
const QUERY_DISTANCE = 2.3;
const ITEM_DISTANCE = 1.05;
const INTRO_MS = 3200;
const IDLE_MS = 5000;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.6;
const pad = (n: number) => String(n).padStart(2, '0');

const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];

// Chord symbols for a progression in the record's own mode.
function progression(rec: Rec) {
  const sc = rec.scale;
  return rec.progression
    .map((d) => {
      const third = (sc[(d + 2) % 7] - sc[d] + 12) % 12;
      const fifth = (sc[(d + 4) % 7] - sc[d] + 12) % 12;
      const r = ROMAN[d];
      return fifth === 6 ? `${r}°` : third === 4 ? r.toUpperCase() : r;
    })
    .join(' – ');
}

function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}

// Comments recede, numbers glow; nothing else is coloured.
function highlight(source: string) {
  return source
    .split('\n')
    .map((line) => {
      const at = line.indexOf('//');
      const code = at >= 0 ? line.slice(0, at) : line;
      const note = at >= 0 ? line.slice(at) : '';
      const body = escapeHtml(code).replace(/(?<![\w#])(\d+\.?\d*(e-?\d+)?)/g, '<span class="n">$1</span>');
      return body + (note ? `<span class="c">${escapeHtml(note)}</span>` : '');
    })
    .join('\n');
}

const vertexShader = /* glsl */ `
  attribute float aKind;
  attribute float aHi;
  attribute float aDim;
  attribute float aImg;
  uniform float uPixel;
  varying float vKind;
  varying float vHi;
  varying float vAlpha;
  void main() {
    vKind = aKind;
    vHi = clamp(aHi, 0.0, 1.0);
    vAlpha = mix(0.9, 0.2, aDim) * (1.0 - aImg);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(32.0 * (1.0 + aHi * 0.9) / -mv.z, 3.0, 26.0) * uPixel;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uAccent;
  varying float vKind;
  varying float vHi;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float a = vKind < 0.5
      ? 1.0 - smoothstep(0.7, 1.0, length(p))
      : 1.0 - smoothstep(0.62, 0.78, max(abs(p.x), abs(p.y)));
    float alpha = a * vAlpha;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(mix(uBase, uAccent, vHi), alpha);
  }
`;

function crosshairTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#f2cf96';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(32, 32, 11, 0, Math.PI * 2);
  for (const [x0, y0, x1, y1] of [
    [32, 3, 32, 16],
    [32, 48, 32, 61],
    [3, 32, 16, 32],
    [48, 32, 61, 32],
  ]) {
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
  }
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function start() {
  const canvas = document.getElementById('space') as HTMLCanvasElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const items = latent.items as Item[];
  const byId = new Map(items.map((it, i) => [it.id, i]));
  const recById = new Map(records.map((r) => [r.id, r]));
  const N = items.length;
  const orchestra = new Orchestra();

  // Entrance, statement and sound controls work even without WebGL.
  const gate = document.getElementById('gate')!;
  const stateEl = document.getElementById('state')!;
  const soundBtn = document.getElementById('sound') as HTMLButtonElement;
  const soundLabel = soundBtn.querySelector('.sound-label')!;
  const statement = document.getElementById('statement')!;
  const statementClose = statement.querySelector<HTMLButtonElement>('.statement-close')!;
  let entered = false;
  let onEnter: () => void = () => {};
  let refreshPlay: () => void = () => {};
  let onMusicChange: () => void = () => {};

  function setSound(rec: Rec | null) {
    if (rec) orchestra.play(rec);
    else orchestra.stop();
    soundBtn.setAttribute('aria-pressed', String(!!rec));
    soundLabel.textContent = rec ? rec.title : 'sound off';
    soundBtn.title = rec ? 'Stop the music' : 'Play a record';
    refreshPlay();
    onMusicChange();
  }
  soundBtn.addEventListener('click', () => setSound(orchestra.playing ? null : recordForNow()));

  gate.querySelectorAll<HTMLButtonElement>('[data-enter]').forEach((b) =>
    b.addEventListener('click', () => {
      entered = true;
      gate.classList.add('gone');
      gate.setAttribute('aria-hidden', 'true');
      document.body.classList.add('entered');
      if (b.dataset.enter === 'sound') setSound(recordForNow());
      onEnter();
    }),
  );

  let lastFocus: HTMLElement | null = null;
  function openStatement() {
    lastFocus = document.activeElement as HTMLElement;
    statement.classList.add('on');
    statement.setAttribute('aria-hidden', 'false');
    statementClose.focus({ preventScroll: true });
  }
  function closeStatement() {
    if (!statement.classList.contains('on')) return false;
    statement.classList.remove('on');
    statement.setAttribute('aria-hidden', 'true');
    lastFocus?.focus({ preventScroll: true });
    return true;
  }
  document.querySelectorAll('[data-statement]').forEach((b) => b.addEventListener('click', openStatement));
  statementClose.addEventListener('click', closeStatement);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch {
    canvas.remove();
    document.querySelectorAll('.query, .legend, .hud').forEach((el) => el.remove());
    document.getElementById('index')!.classList.add('fallback');
    document.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((b) =>
      b.addEventListener('click', () => window.open(media(items[byId.get(b.dataset.open!)!].src), '_blank', 'noopener')),
    );
    return;
  }
  renderer.setClearColor(BG);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);
  camera.position.set(1.0, 0.6, 3.5);
  const homeDistance = () => HOME_DISTANCE * clamp(0.7 / camera.aspect, 1, 1.45);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.8;
  controls.minDistance = 0.45;
  controls.maxDistance = 8;
  controls.autoRotateSpeed = 0.3;

  // Before entering, the works drift as noise; entering lets them settle.
  const finalPos = new Float32Array(N * 3);
  const startPos = new Float32Array(N * 3);
  const seeds = new Float32Array(N * 3);
  items.forEach((it, i) => {
    for (let k = 0; k < 3; k++) {
      finalPos[i * 3 + k] = it.pos[k];
      startPos[i * 3 + k] = reduceMotion ? it.pos[k] : gauss();
      seeds[i * 3 + k] = Math.random() * Math.PI * 2;
    }
  });
  const live = new Float32Array(startPos);

  const geometry = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(live, 3).setUsage(THREE.DynamicDrawUsage);
  const hiAttr = new THREE.BufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage);
  const dimAttr = new THREE.BufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage);
  const imgAttr = new THREE.BufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', posAttr);
  geometry.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(items.map((it) => (it.kind === 'image' ? 0 : 1))), 1));
  geometry.setAttribute('aHi', hiAttr);
  geometry.setAttribute('aDim', dimAttr);
  geometry.setAttribute('aImg', imgAttr);
  const uniforms = { uPixel: { value: 1 }, uBase: { value: BASE_COLOR }, uAccent: { value: ACCENT } };
  const points = new THREE.Points(geometry, new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false }));
  points.renderOrder = 2;
  scene.add(points);

  // Every image is tied to the record nearest it in the shared space.
  const pairs: [number, number][] = [];
  items.forEach((it, i) => {
    if (it.kind === 'image' && it.near.length) pairs.push([i, byId.get(it.near[0].id)!]);
  });
  const pairBuf = new Float32Array(pairs.length * 6);
  const pairGeo = new THREE.BufferGeometry();
  pairGeo.setAttribute('position', new THREE.BufferAttribute(pairBuf, 3).setUsage(THREE.DynamicDrawUsage));
  const pairMat = new THREE.LineBasicMaterial({ color: BASE_COLOR, transparent: true, opacity: 0, depthWrite: false });
  scene.add(new THREE.LineSegments(pairGeo, pairMat));

  const maxTop = Math.max(...latent.moods.map((m) => m.top.length));
  const makeLines = (color: THREE.Color) => {
    const buf = new Float32Array(maxTop * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(buf, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
    scene.add(new THREE.LineSegments(geo, mat));
    return { buf, geo, mat };
  };
  const rays = makeLines(ACCENT);
  const leads = makeLines(BASE_COLOR);

  const marker = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: crosshairTexture(), transparent: true, opacity: 0, depthWrite: false, depthTest: false, sizeAttenuation: false }),
  );
  marker.scale.setScalar(0.045);
  marker.renderOrder = 3;
  scene.add(marker);
  const labelLayer = document.getElementById('labels')!;
  const labels = Array.from({ length: maxTop }, () => labelLayer.appendChild(document.createElement('span')));

  // The works themselves, resolving out of their points as you approach.
  const loader = new THREE.TextureLoader();
  const sprites = items.map((it) => {
    const mat = new THREE.SpriteMaterial({ transparent: true, opacity: 0, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    const size = it.kind === 'image' ? 0.2 : 0.16;
    const long = Math.max(it.w, it.h);
    sprite.scale.set((it.w / long) * size, (it.h / long) * size, 1);
    sprite.position.fromArray(it.pos);
    sprite.visible = false;
    sprite.renderOrder = 1;
    loader.load(media(it.src, true), (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      mat.map = tex;
      mat.needsUpdate = true;
    });
    scene.add(sprite);
    return sprite;
  });
  const baseScale = new Float32Array(sprites.flatMap((s) => [s.scale.x, s.scale.y]));
  const fullLoaded = new Set<number>();
  function loadFull(i: number) {
    if (fullLoaded.has(i)) return;
    fullLoaded.add(i);
    loader.load(media(items[i].src), (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = sprites[i].material;
      mat.map?.dispose();
      mat.map = tex;
      mat.needsUpdate = true;
    });
  }

  // State.
  let activeMood = -1;
  let topSet = new Map<number, number>();
  let topRank = new Map<number, number>();
  let hovered = -1;
  let selected = -1;
  let lastInteraction = -Infinity;
  const hi = new Float32Array(N);
  const dim = new Float32Array(N);
  const img = new Float32Array(N);
  const fan = new Float32Array(N);
  const flash = new Float32Array(N);
  const camRight = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const fanPos = new THREE.Vector3();
  const v = new THREE.Vector3();

  const hoverEl = document.getElementById('hover')!;
  const hoverImg = hoverEl.querySelector('img')!;
  const hoverTitle = hoverEl.querySelector('.hover-title')!;
  const hoverMeta = hoverEl.querySelector('.hover-meta')!;
  const chips = [...document.querySelectorAll<HTMLButtonElement>('[data-mood]')];

  // The music lights the space: each bell touches an image near the record playing.
  orchestra.onNote = (e) => {
    const rec = orchestra.playing;
    if (!rec) return;
    const ri = byId.get(rec.id)!;
    if (e.kind === 'chord') flash[ri] = 1;
    else {
      const near = items[ri].near.map((n) => byId.get(n.id)!);
      const pool = Math.random() < 0.7 ? near : items.map((_, i) => i).filter((i) => items[i].kind === 'image');
      const i = pool[Math.floor(Math.random() * pool.length)];
      flash[i] = Math.max(flash[i], 0.55 + 0.45 * e.velocity);
    }
  };

  let flight: { t0: number; dur: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromC: THREE.Vector3; toC: THREE.Vector3 } | null = null;
  function flyTo(target: THREE.Vector3, distance: number) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    const toC = target.clone().add(dir.multiplyScalar(distance));
    if (reduceMotion) {
      controls.target.copy(target);
      camera.position.copy(toC);
      return;
    }
    flight = { t0: performance.now(), dur: 1400, fromT: controls.target.clone(), toT: target.clone(), fromC: camera.position.clone(), toC };
  }
  const itemPos = (i: number) => new THREE.Vector3().fromArray(finalPos, i * 3);

  function describeState() {
    if (!entered) stateEl.textContent = 'waiting';
    else if (selected >= 0) stateEl.textContent = `open · no. ${pad(items[selected].no)}`;
    else if (activeMood >= 0) {
      const m = latent.moods[activeMood];
      stateEl.textContent = `“${m.label}” · top ${m.top.length}`;
    } else stateEl.textContent = orchestra.playing ? `listening · ${orchestra.playing.title}` : 'orbiting';
  }
  onMusicChange = describeState;

  function setMood(i: number) {
    activeMood = activeMood === i ? -1 : i;
    chips.forEach((c, k) => c.setAttribute('aria-pressed', String(k === activeMood)));
    topSet = new Map();
    topRank = new Map();
    if (activeMood >= 0) {
      const m = latent.moods[activeMood];
      m.top.forEach((t, r) => {
        topSet.set(byId.get(t.id)!, t.s);
        topRank.set(byId.get(t.id)!, r);
      });
      marker.position.fromArray(m.pos);
      if (selected < 0) flyTo(new THREE.Vector3().fromArray(m.pos), QUERY_DISTANCE);
    } else if (selected < 0) flyTo(HOME, homeDistance());
    describeState();
  }
  chips.forEach((c, i) => c.addEventListener('click', () => setMood(i)));

  // The detail panel.
  const panel = document.getElementById('panel')!;
  const panelImg = document.getElementById('panel-img') as HTMLImageElement;
  const noise = document.getElementById('panel-noise') as HTMLCanvasElement;
  const panelKind = document.getElementById('panel-kind')!;
  const panelTitle = document.getElementById('panel-title')!;
  const panelSentence = document.getElementById('panel-sentence')!;
  const panelPlay = document.getElementById('panel-play')!;
  const playBtn = document.getElementById('play') as HTMLButtonElement;
  const facts = document.getElementById('panel-facts')!;
  const program = document.getElementById('panel-program') as HTMLDetailsElement;
  const code = document.getElementById('panel-code')!;
  const nearLabel = document.getElementById('panel-near-label')!;
  const nearList = document.getElementById('panel-near')!;
  const closeBtn = panel.querySelector<HTMLButtonElement>('.panel-close')!;

  refreshPlay = () => {
    if (selected < 0 || items[selected].kind !== 'record') return;
    const on = orchestra.playing?.id === items[selected].id;
    playBtn.setAttribute('aria-pressed', String(on));
    playBtn.querySelector('.play-label')!.textContent = on ? 'stop' : 'play';
  };
  playBtn.addEventListener('click', () => {
    const rec = recById.get(items[selected].id)!;
    setSound(orchestra.playing?.id === rec.id ? null : rec);
  });

  // Each image develops out of noise when it opens, the way it was made.
  let developRaf = 0;
  function develop() {
    cancelAnimationFrame(developRaf);
    const g = noise.getContext('2d')!;
    const w = (noise.width = 96);
    const h = (noise.height = Math.max(24, Math.round((96 * panelImg.naturalHeight) / Math.max(1, panelImg.naturalWidth)) || 64));
    const frame = g.createImageData(w, h);
    const t0 = performance.now();
    const dur = reduceMotion ? 0 : 1500;
    const tick = (now: number) => {
      const t = dur ? clamp((now - t0) / dur, 0, 1) : 1;
      const a = (1 - easeOut(t)) * 255;
      for (let p = 0; p < frame.data.length; p += 4) {
        const n = Math.random() * 255;
        frame.data[p] = n;
        frame.data[p + 1] = n;
        frame.data[p + 2] = n;
        frame.data[p + 3] = a;
      }
      g.putImageData(frame, 0, 0);
      if (t < 1) developRaf = requestAnimationFrame(tick);
    };
    developRaf = requestAnimationFrame(tick);
  }

  function fact(label: string, value: string | Node) {
    const div = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = label;
    if (typeof value === 'string') dd.innerHTML = value;
    else dd.append(value);
    div.append(dt, dd);
    return div;
  }

  function open(i: number) {
    selected = i;
    const it = items[i];
    loadFull(i);
    flyTo(itemPos(i), innerWidth <= 720 ? ITEM_DISTANCE * 1.9 : ITEM_DISTANCE);
    const g = noise.getContext('2d')!;
    noise.width = 2;
    noise.height = 2;
    g.fillStyle = '#121214';
    g.fillRect(0, 0, 2, 2);
    panelImg.onload = develop;
    panelImg.src = media(it.src);
    panelImg.width = it.w;
    panelImg.height = it.h;
    panelImg.alt = it.sentence;
    panelKind.textContent = `${it.kind} · no. ${pad(it.no)}`;
    panelTitle.textContent = it.title;
    panelSentence.textContent = `“${it.sentence}”`;
    facts.replaceChildren();
    program.open = false;

    if (it.kind === 'image') {
      panelPlay.classList.remove('on');
      facts.append(fact('cos(image, sentence)', `<strong>${it.score.toFixed(3)}</strong>`));
      if (it.rank === 1) {
        facts.append(fact('CLIP reads it as', `its own sentence, first of ${it.of}`));
      } else {
        const j = byId.get(it.readAs)!;
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = `no. ${pad(items[j].no)}, ${items[j].title}`;
        b.addEventListener('click', () => open(j));
        const wrap = document.createElement('span');
        wrap.append(b, document.createTextNode(` · its own sentence ranks ${it.rank} of ${it.of}`));
        facts.append(fact('CLIP reads it as', wrap));
      }
      facts.append(fact('made of', `${it.lines} lines of JavaScript · ${it.w} × ${it.h}`));
      program.hidden = false;
      code.innerHTML = highlight(it.source ?? '');
      nearLabel.textContent = 'records nearest in the space';
    } else {
      const rec = recById.get(it.id)!;
      panelPlay.classList.add('on');
      refreshPlay();
      facts.append(fact('key', `${NOTE_NAMES[rec.root % 12]} ${rec.mode}`));
      facts.append(fact('tempo', `${rec.bpm} beats a minute`));
      facts.append(fact('progression', progression(rec)));
      facts.append(fact('texture', rec.texture.type === 'room' ? 'room tone' : rec.texture.type));
      program.hidden = true;
      nearLabel.textContent = 'images nearest in the space';
    }

    nearList.replaceChildren(
      ...it.near.map((n) => {
        const j = byId.get(n.id)!;
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        const im = document.createElement('img');
        im.src = media(items[j].src, true);
        im.alt = '';
        im.loading = 'lazy';
        const t = document.createElement('span');
        t.textContent = items[j].title;
        const s = document.createElement('span');
        s.className = 'cos';
        s.textContent = `cos ${n.s.toFixed(3)}`;
        b.append(im, t, s);
        b.addEventListener('click', () => open(j));
        li.append(b);
        return li;
      }),
    );
    panel.scrollTop = 0;
    panel.classList.add('on');
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('panel-open');
    closeBtn.focus({ preventScroll: true });
    describeState();
  }

  function close() {
    if (selected < 0) return;
    selected = -1;
    panel.classList.remove('on');
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('panel-open');
    if (activeMood >= 0) flyTo(new THREE.Vector3().fromArray(latent.moods[activeMood].pos), QUERY_DISTANCE);
    else flyTo(HOME, homeDistance());
    describeState();
  }
  closeBtn.addEventListener('click', close);
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!closeStatement()) close();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((b) =>
    b.addEventListener('click', () => {
      if (!entered) gate.querySelector<HTMLButtonElement>('[data-enter="silence"]')!.click();
      open(byId.get(b.dataset.open!)!);
    }),
  );

  // Picking in screen space, against both points and visible images.
  function pick(x: number, y: number) {
    const pxPerUnit = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    let best = -1;
    let bestD = Infinity;
    const p = new THREE.Vector3();
    const test = (i: number, q: THREE.Vector3, half: number) => {
      const dist = q.distanceTo(camera.position);
      v.copy(q).project(camera);
      if (v.z > 1) return;
      const sx = (v.x * 0.5 + 0.5) * innerWidth;
      const sy = (-v.y * 0.5 + 0.5) * innerHeight;
      const r = Math.max(14, (half * pxPerUnit) / dist);
      if (Math.abs(sx - x) < r && Math.abs(sy - y) < r && dist < bestD) {
        best = i;
        bestD = dist;
      }
    };
    for (let i = 0; i < N; i++) {
      test(i, p.fromArray(live, i * 3), 0);
      if (img[i] > 0.5) test(i, sprites[i].position, Math.max(sprites[i].scale.x, sprites[i].scale.y) / 2);
    }
    return best;
  }

  function showHover(i: number, x: number, y: number) {
    if (i < 0) {
      hoverEl.classList.remove('on');
      return;
    }
    const it = items[i];
    const src = media(it.src, true);
    if (!hoverImg.src.endsWith(src)) hoverImg.src = src;
    hoverTitle.textContent = it.title;
    const score = topSet.get(i);
    hoverMeta.textContent = `${it.kind} · no. ${pad(it.no)}${score !== undefined ? ` · cos ${score.toFixed(3)}` : ''}`;
    const flip = x > innerWidth - 380;
    hoverEl.style.left = `${x}px`;
    hoverEl.style.top = `${y}px`;
    hoverEl.style.transform = flip ? 'translate(calc(-100% - 18px), -50%)' : 'translate(18px, -50%)';
    hoverEl.classList.add('on');
  }

  let down: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
    lastInteraction = performance.now();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !entered) return;
    if (e.buttons) {
      lastInteraction = performance.now();
      hovered = -1;
      showHover(-1, 0, 0);
      return;
    }
    hovered = pick(e.clientX, e.clientY);
    canvas.classList.toggle('pointing', hovered >= 0);
    showHover(hovered, e.clientX, e.clientY);
  });
  canvas.addEventListener('pointerleave', () => {
    hovered = -1;
    showHover(-1, 0, 0);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!entered || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    const i = pick(e.clientX, e.clientY);
    if (i >= 0) open(i);
    else if (selected >= 0) close();
  });
  canvas.addEventListener('wheel', () => (lastInteraction = performance.now()), { passive: true });

  function resize() {
    const pr = Math.min(devicePixelRatio, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    uniforms.uPixel.value = pr;
  }
  addEventListener('resize', resize);
  resize();
  camera.position.setLength(homeDistance() * 1.25);

  let t0 = Infinity;
  let last = performance.now();
  let settled = false;
  const viewShift = [0, 0];
  onEnter = () => {
    t0 = performance.now();
    flyTo(HOME, homeDistance());
    describeState();
  };

  function frame(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 7.7);
    const intro = reduceMotion ? (entered ? 1 : 0) : easeOut(clamp((now - t0) / INTRO_MS, 0, 1));
    if (!settled && intro >= 1) {
      settled = true;
      describeState();
    }
    const time = now / 1000;
    const breathe = reduceMotion ? 0 : 0.008;
    const restless = reduceMotion ? 0 : 0.05 * (1 - intro);
    for (let i = 0; i < N * 3; i++) {
      live[i] = startPos[i] + (finalPos[i] - startPos[i]) * intro + Math.sin(time * 0.6 + seeds[i]) * (breathe + restless);
    }
    posAttr.needsUpdate = true;

    if (flight) {
      const t = clamp((now - flight.t0) / flight.dur, 0, 1);
      const e = easeInOut(t);
      controls.target.lerpVectors(flight.fromT, flight.toT, e);
      camera.position.lerpVectors(flight.fromC, flight.toC, e);
      if (t >= 1) flight = null;
    }
    controls.autoRotate = !reduceMotion && selected < 0 && !flight && now - lastInteraction > IDLE_MS;
    controls.enabled = entered;
    controls.update();

    // Keep the open work centred in the area the panel leaves visible.
    const narrow = innerWidth <= 720;
    const shiftT = selected < 0 ? [0, 0] : narrow ? [0, panel.offsetHeight / 2] : [panel.offsetWidth / 2, 0];
    viewShift[0] += (shiftT[0] - viewShift[0]) * k;
    viewShift[1] += (shiftT[1] - viewShift[1]) * k;
    if (Math.abs(viewShift[0]) + Math.abs(viewShift[1]) > 0.5) {
      camera.setViewOffset(innerWidth, innerHeight, viewShift[0], viewShift[1], innerWidth, innerHeight);
    } else if (camera.view?.enabled) camera.clearViewOffset();

    camera.updateMatrixWorld();
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    camUp.setFromMatrixColumn(camera.matrixWorld, 1);
    const fanOn = activeMood >= 0 && selected < 0;
    const qd = marker.position.distanceTo(camera.position);
    const halfH = qd * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const halfW = halfH * camera.aspect;
    const rx = Math.min(halfH * 0.52, halfW * 0.6);
    const ry = Math.min(halfH * 0.46, halfW * 0.95);
    const fanScale = (qd / QUERY_DISTANCE) * (camera.aspect < 1 ? 0.85 : 1.2);
    const playingIdx = orchestra.playing ? byId.get(orchestra.playing.id)! : -1;

    for (let i = 0; i < N; i++) {
      flash[i] *= Math.exp(-dt * 1.6);
      const inTop = topSet.has(i);
      const hiT = Math.max((inTop && selected < 0) || i === selected ? 1 : 0, i === playingIdx ? 0.6 : 0, flash[i]);
      const dimT = i !== selected && ((activeMood >= 0 && !inTop) || selected >= 0) ? 1 : 0;
      v.fromArray(live, i * 3);
      const near = smooth(1.8, 0.95, v.distanceTo(camera.position));
      let imgT = Math.max(near, inTop ? 1 : 0, i === hovered || i === selected ? 1 : 0);
      if (dimT && i !== hovered) imgT = 0;
      hi[i] += (hiT - hi[i]) * Math.max(k, flash[i] > hi[i] ? 0.5 : 0);
      dim[i] += (dimT - dim[i]) * k;
      img[i] += (imgT * intro - img[i]) * k;
      fan[i] += ((fanOn && inTop ? 1 : 0) - fan[i]) * k;
      (hiAttr.array as Float32Array)[i] = hi[i];
      (dimAttr.array as Float32Array)[i] = dim[i];
      (imgAttr.array as Float32Array)[i] = img[i];
      const s = sprites[i];
      if (fan[i] > 0.001) {
        const theta = Math.PI / 2 - ((topRank.get(i) ?? 0) / Math.max(1, topSet.size)) * Math.PI * 2;
        fanPos.copy(marker.position).addScaledVector(camRight, Math.cos(theta) * rx).addScaledVector(camUp, Math.sin(theta) * ry);
        s.position.lerpVectors(v, fanPos, fan[i]);
      } else s.position.copy(v);
      const sc = 1 + (fanScale - 1) * fan[i];
      s.scale.set(baseScale[i * 2] * sc, baseScale[i * 2 + 1] * sc, 1);
      s.material.opacity = img[i];
      s.visible = img[i] > 0.01 && !!s.material.map;
    }
    hiAttr.needsUpdate = dimAttr.needsUpdate = imgAttr.needsUpdate = true;

    pairs.forEach(([a, b], n) => {
      pairBuf.set(live.subarray(a * 3, a * 3 + 3), n * 6);
      pairBuf.set(live.subarray(b * 3, b * 3 + 3), n * 6 + 3);
    });
    pairGeo.attributes.position.needsUpdate = true;
    const pairT = (activeMood >= 0 || selected >= 0 ? 0.03 : 0.09) * intro;
    pairMat.opacity += (pairT - pairMat.opacity) * k;

    // Spokes from the query to each match; leaders back to where each one lives.
    let r = 0;
    for (const [i, score] of topSet) {
      const sp = sprites[i].position;
      rays.buf.set(marker.position.toArray(), r * 6);
      rays.buf.set(sp.toArray(), r * 6 + 3);
      leads.buf.set(sp.toArray(), r * 6);
      leads.buf.set(live.subarray(i * 3, i * 3 + 3), r * 6 + 3);
      const label = labels[r];
      fanPos.copy(sp).addScaledVector(camUp, -sprites[i].scale.y / 2 - 0.02 * fanScale).project(camera);
      label.textContent = `${(topRank.get(i) ?? 0) + 1} · ${score.toFixed(3)}`;
      label.style.transform = `translate(${((fanPos.x + 1) / 2) * innerWidth}px, ${((1 - fanPos.y) / 2) * innerHeight}px) translateX(-50%)`;
      label.style.opacity = String(fan[i] * img[i]);
      r++;
    }
    for (let n = r; n < labels.length; n++) labels[n].style.opacity = '0';
    for (const l of [rays, leads]) {
      l.geo.setDrawRange(0, r * 2);
      l.geo.attributes.position.needsUpdate = true;
    }
    rays.mat.opacity += ((activeMood >= 0 ? (selected >= 0 ? 0.12 : 0.45) : 0) - rays.mat.opacity) * k;
    leads.mat.opacity += ((fanOn ? 0.16 : 0) - leads.mat.opacity) * k;
    marker.material.opacity += ((activeMood >= 0 ? (selected >= 0 ? 0.3 : 1) : 0) - marker.material.opacity) * k;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  describeState();
  requestAnimationFrame(frame);
}
