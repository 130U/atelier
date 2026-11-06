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
import { render } from './lib.mjs';
import { plateWork, plateSvg, SIZE } from './plate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'public', 'data');
const outDir = path.join(root, 'public', 'plates');
const { etudes } = JSON.parse(await fs.readFile(path.join(root, 'src', 'data', 'etudes.json'), 'utf8'));
const recordings = JSON.parse(await fs.readFile(path.join(root, 'src', 'data', 'recordings.json'), 'utf8'));

// Apparent magnitude from loudness, on Pogson's scale: five magnitudes are a
// hundredfold in power, so one magnitude is 4 dB. The mean sits at 3.
const mean = Object.values(recordings).reduce((s, r) => s + r.loudnessDb, 0) / etudes.length;
const magnitude = (id) => 3 + (mean - recordings[id].loudnessDb) / 4;

if (!isMainThread) {
  const e = etudes.find((x) => x.id === workerData);
  const data = JSON.parse(await fs.readFile(path.join(dataDir, `${e.id}.json`), 'utf8'));
  const pixels = render(plateWork(e, data), SIZE, SIZE);
  const ink = Buffer.from(plateSvg(e, data, { magnitude: magnitude(e.id) }));
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
  await Promise.all(
    Array.from({ length: Math.min(os.cpus().length - 2, queue.length) }, async () => {
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
