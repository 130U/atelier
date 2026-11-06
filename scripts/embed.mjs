// Places every work in one space and asks a second model how close each
// image came to its sentence. Resizes media/ into public/media/, embeds
// images and sentences with CLIP, projects to 3-d with UMAP, and writes
// src/data/latent.json.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { UMAP } from 'umap-js';
import {
  env,
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  RawImage,
} from '@huggingface/transformers';

const root = path.resolve(import.meta.dirname, '..');
const mediaDir = path.join(root, 'media');
const publicDir = path.join(root, 'public', 'media');
const catalogFile = path.join(root, 'src', 'data', 'catalog.json');
const latentFile = path.join(root, 'src', 'data', 'latent.json');

const MODEL = 'Xenova/clip-vit-base-patch32';
const MOODS = [
  { label: 'dusk', prompt: 'a photo of the sky at dusk' },
  { label: 'night', prompt: 'a photo of one small light in the darkness at night' },
  { label: 'water', prompt: 'a photo of sunlight or moonlight on water' },
  { label: 'warmth', prompt: 'a photo of warm golden sunlight indoors' },
  { label: 'cold', prompt: 'a photo of cold blue ice and snow' },
  { label: 'fog', prompt: 'a photo of fog' },
  { label: 'stars', prompt: 'a photo of stars in the night sky' },
];
const TOP_K = 6;
const NEAR_K = 3;

env.cacheDir = path.join(root, '.cache', 'models');

const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;
const normalize = (v) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const { items } = JSON.parse(await fs.readFile(catalogFile, 'utf8'));
await fs.rm(publicDir, { recursive: true, force: true });
await fs.mkdir(path.join(publicDir, 'thumb'), { recursive: true });

console.log(`resizing ${items.length} works`);
for (const item of items) {
  const src = path.join(mediaDir, item.file);
  await sharp(src).resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(publicDir, item.file));
  await sharp(src).resize(360, 360, { fit: 'inside' }).jpeg({ quality: 80, mozjpeg: true }).toFile(path.join(publicDir, 'thumb', item.file));
}

console.log(`loading ${MODEL}`);
const processor = await AutoProcessor.from_pretrained(MODEL);
const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
const vision = await CLIPVisionModelWithProjection.from_pretrained(MODEL, { dtype: 'q8' });
const text = await CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: 'q8' });

async function embedTexts(texts) {
  const { text_embeds } = await text(tokenizer(texts, { padding: true, truncation: true }));
  const d = text_embeds.dims[1];
  return texts.map((_, i) => normalize(Array.from(text_embeds.data.slice(i * d, (i + 1) * d))));
}

console.log('embedding images');
const embeds = [];
for (const item of items) {
  const { image_embeds } = await vision(await processor(await RawImage.read(path.join(mediaDir, item.file))));
  embeds.push(normalize(Array.from(image_embeds.data)));
}
const dims = embeds[0].length;

console.log('embedding sentences and moods');
const sentences = await embedTexts(items.map((it) => it.sentence));
const moodEmbeds = await embedTexts(MOODS.map((m) => m.prompt));

// How close each work came to its own sentence, and which sentence CLIP
// would have chosen for it among the works of the same kind.
const reading = items.map((item, i) => {
  const peers = items.map((o, j) => ({ o, j })).filter(({ o }) => o.kind === item.kind);
  const ranked = peers.map(({ o, j }) => ({ id: o.id, s: dot(embeds[i], sentences[j]) })).sort((a, b) => b.s - a.s);
  return { score: round(dot(embeds[i], sentences[i]), 3), rank: ranked.findIndex((r) => r.id === item.id) + 1, of: peers.length, readAs: ranked[0].id };
});

// CLIP separates renderings from cover art by medium before mood.
// Subtracting each kind's mean embedding lets the two mix by content.
const kinds = [...new Set(items.map((it) => it.kind))];
const kindMean = Object.fromEntries(
  kinds.map((k) => {
    const group = embeds.filter((_, i) => items[i].kind === k);
    return [k, group[0].map((_, d) => group.reduce((s, e) => s + e[d], 0) / group.length)];
  }),
);
const shared = embeds.map((e, i) => normalize(e.map((x, d) => x - kindMean[items[i].kind][d])));

console.log('projecting to 3-d');
const umap = new UMAP({ nComponents: 3, nNeighbors: 8, minDist: 0.5, spread: 1.3, random: seeded(7) });
const raw = umap.fit(shared);
const mean = [0, 1, 2].map((k) => raw.reduce((s, p) => s + p[k], 0) / raw.length);
const centered = raw.map((p) => p.map((v, k) => v - mean[k]));
const radius = Math.max(...centered.map((p) => Math.hypot(...p)));
const pos = centered.map((p) => p.map((v) => round((v / radius) * 1.2)));

const out = items.map((item, i) => {
  const other = item.kind === 'image' ? 'record' : 'image';
  const near = items
    .map((o, j) => ({ id: o.id, kind: o.kind, s: dot(shared[i], shared[j]) }))
    .filter((o) => o.kind === other)
    .sort((a, b) => b.s - a.s)
    .slice(0, NEAR_K)
    .map(({ id, s }) => ({ id, s: round(s, 3) }));
  const { file, ...rest } = item;
  return { ...rest, src: file, pos: pos[i], near, ...reading[i] };
});

const moods = MOODS.map((m, mi) => {
  const scored = items.map((o, j) => ({ id: o.id, j, s: dot(moodEmbeds[mi], embeds[j]) })).sort((a, b) => b.s - a.s);
  const top = scored.slice(0, TOP_K);
  const anchor = top.slice(0, 4);
  const w = anchor.map((t) => Math.exp(100 * (t.s - anchor[0].s)));
  const wsum = w.reduce((a, b) => a + b, 0);
  const qpos = [0, 1, 2].map((k) => round(anchor.reduce((s, t, n) => s + pos[t.j][k] * w[n], 0) / wsum));
  return { ...m, pos: qpos, top: top.map(({ id, s }) => ({ id, s: round(s, 3) })) };
});

await fs.writeFile(latentFile, JSON.stringify({ model: MODEL, dims, projection: 'UMAP', items: out, moods }, null, 1) + '\n');
for (const it of out) console.log(`${it.id}  cos ${it.score.toFixed(3)}  rank ${it.rank}/${it.of}${it.rank > 1 ? `  read as ${it.readAs}` : ''}`);
console.log(`wrote ${out.length} works and ${moods.length} moods to src/data/latent.json`);
