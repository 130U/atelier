// The social preview: the title beside a field of plates.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { text, GOLD } from '../art/plate.mjs';
import { etudes } from '../src/lib/theory.ts';

const root = path.resolve(import.meta.dirname, '..');
const W = 1200;
const H = 630;
const S = 150;
const pick = etudes.filter((_, i) => i % 2 === 0);
const tiles = await Promise.all(
  pick.map(async (e, i) => ({
    input: await sharp(path.join(root, 'public', 'plates', 'thumb', `${e.id}.jpg`)).resize(S, S).toBuffer(),
    left: 616 + (i % 4) * (S - 6),
    top: 66 + Math.floor(i / 4) * (S + 18),
  })),
);
const words = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  ${text('The Étude Sky', 62, 280, 96, { face: 'hand' })}
  ${text('Chopin’s twenty-four études,', 66, 336, 30, { face: 'italic', opacity: 0.8 })}
  ${text('charted as stars', 66, 372, 30, { face: 'italic', opacity: 0.8 })}
  ${text('CURATED BY THEODORE OUYANG', 66, 540, 16, { face: 'mono', spacing: 2, fill: GOLD })}
</svg>`;
await sharp({ create: { width: W, height: H, channels: 3, background: '#f7f0e3' } })
  .composite([...tiles, { input: Buffer.from(words) }])
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(path.join(root, 'public', 'og.jpg'));
console.log('wrote public/og.jpg');
