// Paints the 24 plates from the analysed recordings in public/data/.
//   node art/render.mjs              every étude
//   node art/render.mjs op10-05      only the named ones
// Writes public/plates/<id>.jpg and public/plates/thumb/<id>.jpg.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import sharp from 'sharp';
import { etudes, byId } from '../src/lib/theory.ts';
import { render } from './lib.mjs';
import { plateWork, plateSvg, SIZE } from './plate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'public', 'data');
const outDir = path.join(root, 'public', 'plates');

if (!isMainThread) {
  const e = byId.get(workerData);
  const data = JSON.parse(await fs.readFile(path.join(dataDir, `${e.id}.json`), 'utf8'));
  const pixels = render(plateWork(e, data), SIZE, SIZE);
  const ink = Buffer.from(plateSvg(e, data));
  const plate = await sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .composite([{ input: ink }])
    .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();
  await fs.writeFile(path.join(outDir, `${e.id}.jpg`), plate);
  await sharp(plate).resize(520, 520).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(outDir, 'thumb', `${e.id}.jpg`));
  parentPort.postMessage(e.id);
} else {
  await fs.mkdir(path.join(outDir, 'thumb'), { recursive: true });
  const only = process.argv.slice(2);
  const queue = etudes.map((e) => e.id).filter((id) => !only.length || only.includes(id));
  const workers = Math.min(Math.max(1, os.availableParallelism() - 2), queue.length);
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (queue.length) {
        const id = queue.shift();
        await new Promise((ok, fail) => {
          const w = new Worker(fileURLToPath(import.meta.url), { workerData: id });
          w.once('message', (m) => {
            console.log(m);
            ok();
          });
          w.once('error', fail);
        });
      }
    }),
  );
}
