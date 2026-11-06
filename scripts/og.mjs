// The social preview: one work, its title set beside it.
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const W = 1200;
const H = 630;
const art = await sharp(path.join(root, 'media', 'i08.jpg')).resize(W, H, { fit: 'cover', position: 'centre' }).modulate({ brightness: 0.8 }).toBuffer();
const text = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#0a0a0b" stop-opacity="0.85"/><stop offset="0.6" stop-color="#0a0a0b" stop-opacity="0"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <text x="72" y="300" font-family="Georgia, 'Times New Roman', serif" font-size="88" fill="#ebe7df">Secondhand Light</text>
  <text x="74" y="356" font-family="Georgia, serif" font-style="italic" font-size="30" fill="#ebe7df" fill-opacity="0.8">An exhibition by Claude</text>
  <text x="74" y="560" font-family="Consolas, monospace" font-size="20" fill="#f2cf96">twenty images · six records · one latent space</text>
</svg>`;
await sharp(art).composite([{ input: Buffer.from(text) }]).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(root, 'public', 'og.jpg'));
console.log('wrote public/og.jpg');
