// Renders every work in art/works and every record cover into media/, using
// one worker per work, then writes src/data/catalog.json.
//   node art/render.mjs            render everything
//   node art/render.mjs 07 r02     render only the matching works
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import sharp from 'sharp';
import { render } from './lib.mjs';
import { coverWork } from './cover.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const worksDir = path.join(here, 'works');
const mediaDir = path.join(root, 'media');
const compositionsFile = path.join(root, 'src', 'data', 'compositions.json');
const catalogFile = path.join(root, 'src', 'data', 'catalog.json');

async function loadWork(job) {
  if (job.kind === 'image') return (await import(pathToFileURL(path.join(worksDir, job.file)).href)).default;
  const { records } = JSON.parse(await fs.readFile(compositionsFile, 'utf8'));
  return coverWork(records.find((r) => r.id === job.id));
}

if (!isMainThread) {
  const job = workerData;
  const work = await loadWork(job);
  const [w, h] = work.size;
  const t0 = Date.now();
  const pixels = render(work, w, h);
  await sharp(pixels, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 93, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toFile(path.join(mediaDir, `${job.id}.jpg`));
  parentPort.postMessage({ id: job.id, ms: Date.now() - t0 });
} else {
  const filter = process.argv.slice(2);
  const files = (await fs.readdir(worksDir)).filter((f) => /^\d\d-.+\.mjs$/.test(f)).sort();
  const { records } = JSON.parse(await fs.readFile(compositionsFile, 'utf8'));

  const jobs = [
    ...files.map((file) => ({ kind: 'image', id: `i${file.slice(0, 2)}`, file })),
    ...records.map((r) => ({ kind: 'record', id: r.id })),
  ];
  const todo = filter.length ? jobs.filter((j) => filter.some((f) => j.id.endsWith(f) || j.id === f)) : jobs;

  await fs.mkdir(mediaDir, { recursive: true });
  const queue = [...todo];
  const workers = Math.max(1, Math.min(os.cpus().length - 1, queue.length));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (queue.length) {
        const job = queue.shift();
        await new Promise((resolve, reject) => {
          const w = new Worker(fileURLToPath(import.meta.url), { workerData: job });
          w.once('message', ({ id, ms }) => console.log(`${id}  ${(ms / 1000).toFixed(1)}s`));
          w.once('error', reject);
          w.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${job.id} exited ${code}`))));
        });
      }
    }),
  );

  const items = [];
  for (const job of jobs) {
    const work = await loadWork(job);
    const [w, h] = work.size;
    const base = { id: job.id, kind: job.kind, no: Number(job.id.slice(1)), title: work.title, sentence: work.sentence, file: `${job.id}.jpg`, w, h };
    if (job.kind === 'image') {
      const source = (await fs.readFile(path.join(worksDir, job.file), 'utf8')).trim();
      items.push({ ...base, source, lines: source.split('\n').length });
    } else {
      items.push({ ...base, composition: job.id });
    }
  }
  await fs.writeFile(catalogFile, JSON.stringify({ items }, null, 2) + '\n');
  console.log(`catalog: ${items.length} works`);
}
