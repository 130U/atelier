// Downloads Edward Neeman's recordings of the 24 études from Wikimedia
// Commons (public domain, Musopen's "Set Chopin Free", 2014) into
// .cache/recordings/. Run with NODE_USE_ENV_PROXY=1 behind a local proxy.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dir = path.join(root, '.cache', 'recordings');
const UA = 'atelier-build/1.0 (https://www.theodoreoy.com/atelier/)';
const api =
  'https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=50' +
  '&gsrsearch=' + encodeURIComponent('Neeman "12 Études"') +
  '&prop=imageinfo&iiprop=url|size|sha1|extmetadata&iiextmetadatafilter=LicenseShortName';

await fs.mkdir(dir, { recursive: true });
const res = await fetch(api, { headers: { 'User-Agent': UA } });
const pages = Object.values((await res.json()).query.pages);
const files = pages
  .map((p) => {
    const m = p.title.match(/Op\. (10|25) - No\. (\d+)/);
    const info = p.imageinfo[0];
    return m && { id: `op${m[1]}-${m[2].padStart(2, '0')}`, title: p.title, url: info.url.split('?')[0], size: info.size, sha1: info.sha1, license: info.extmetadata.LicenseShortName?.value };
  })
  .filter(Boolean)
  .sort((a, b) => a.id.localeCompare(b.id));

if (files.length !== 24) throw new Error(`expected 24 recordings, found ${files.length}`);
for (const f of files) if (f.license !== 'Public domain') throw new Error(`${f.title} is not marked public domain`);

for (const f of files) {
  const out = path.join(dir, `${f.id}.flac`);
  const have = await fs.stat(out).catch(() => null);
  if (have?.size === f.size) {
    console.log(`${f.id}  cached`);
    continue;
  }
  let buf;
  for (let attempt = 1; !buf; attempt++) {
    try {
      const r = await fetch(f.url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      buf = Buffer.from(await r.arrayBuffer());
    } catch (err) {
      if (attempt >= 4) throw new Error(`${f.id}: ${err.message}`);
      await new Promise((ok) => setTimeout(ok, 3000 * attempt));
    }
  }
  if (createHash('sha1').update(buf).digest('hex') !== f.sha1) throw new Error(`${f.id}: checksum mismatch`);
  await fs.writeFile(out, buf);
  console.log(`${f.id}  ${(buf.length / 1e6).toFixed(1)} MB`);
}
await fs.writeFile(path.join(dir, 'sources.json'), JSON.stringify(files, null, 2) + '\n');
console.log('done');
