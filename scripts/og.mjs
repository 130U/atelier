// The social preview: the title beside a field of plates.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const { etudes } = JSON.parse(await fs.readFile(path.join(root, 'src', 'data', 'etudes.json'), 'utf8'));
const W = 1200;
const H = 630;
const S = 150;
const pick = etudes.filter((_, i) => i % 2 === 0);
const tiles = await Promise.all(
  pick.map(async (e, i) => ({
    input: await sharp(path.join(root, 'public', 'plates', 'thumb', `${e.id}.jpg`)).resize(S, S).toBuffer(),
    left: 560 + (i % 4) * (S - 6),
    top: 60 + Math.floor(i / 4) * (S + 18),
  })),
);
const text = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <text x="70" y="250" font-family="Georgia, serif" font-style="italic" font-size="82" fill="#1f2747">The Étude Sky</text>
  <text x="72" y="310" font-family="Georgia, serif" font-size="28" fill="#4b5170">Chopin's twenty-four études, placed by key</text>
  <text x="72" y="530" font-family="Consolas, monospace" font-size="18" fill="#b8862b">Op. 10 · Op. 25 · curated by Theodore Ouyang</text>
</svg>`;
await sharp({ create: { width: W, height: H, channels: 3, background: '#f7f0e3' } })
  .composite([...tiles, { input: Buffer.from(text) }])
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(path.join(root, 'public', 'og.jpg'));
console.log('wrote public/og.jpg');
