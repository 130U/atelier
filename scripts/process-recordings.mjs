// Turns each recording in .cache/recordings into what the site uses:
//   public/audio/<id>.mp3     trimmed, loudness-matched, 128 kbit/s
//   public/data/<id>.json     onsets with their pitch classes, and loudness
//   src/data/recordings.json  duration, onset count and loudness for the chart
// Pitch classes come from a chromagram; onsets from spectral flux.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, '.cache', 'recordings');
const audioDir = path.join(root, 'public', 'audio');
const dataDir = path.join(root, 'public', 'data');
const TARGET_DB = -20;
const CEILING_DB = -1;

// In-place radix-2 FFT on (re, im).
function fftFactory(n) {
  const levels = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < levels; b++) r |= ((i >> b) & 1) << (levels - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = Math.sin((2 * Math.PI * i) / n);
  }
  return (re, im) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2;
      const step = n / size;
      for (let i = 0; i < n; i += size)
        for (let j = 0; j < half; j++) {
          const k = j * step;
          const tr = re[i + j + half] * cos[k] + im[i + j + half] * sin[k];
          const ti = -re[i + j + half] * sin[k] + im[i + j + half] * cos[k];
          re[i + j + half] = re[i + j] - tr;
          im[i + j + half] = im[i + j] - ti;
          re[i + j] += tr;
          im[i + j] += ti;
        }
    }
  };
}

function spectra(x, n, hop, each) {
  const fft = fftFactory(n);
  const win = Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const mag = new Float64Array(n / 2);
  for (let f = 0, start = 0; start + n <= x.length; f++, start += hop) {
    for (let i = 0; i < n; i++) {
      re[i] = x[start + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < n / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
    each(f, mag);
  }
}

async function processOne(id) {
  const { FLACDecoder } = await import('@wasm-audio-decoders/flac');
  const { createMp3Encoder } = await import('wasm-media-encoders');
  const decoder = new FLACDecoder();
  await decoder.ready;
  const decoded = await decoder.decodeFile(new Uint8Array(await fs.readFile(path.join(srcDir, `${id}.flac`))));
  await decoder.free();
  const sr = decoded.sampleRate;
  let [L, R] = decoded.channelData;
  if (!R) R = L;

  // Trim the silence before the first note and after the last decay.
  const mono = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) / 2;
  const block = Math.round(sr * 0.02);
  const loudAt = (i) => {
    let s = 0;
    for (let k = i; k < Math.min(mono.length, i + block); k++) s += mono[k] * mono[k];
    return 10 * Math.log10(s / block + 1e-12);
  };
  let first = 0;
  while (first < mono.length && loudAt(first) < -55) first += block;
  let last = mono.length - block;
  while (last > first && loudAt(last) < -60) last -= block;
  const start = Math.max(0, first - Math.round(sr * 0.12));
  const end = Math.min(mono.length, last + Math.round(sr * 0.8));

  // Integrated loudness from gated 400 ms blocks, matched to one target.
  const powers = [];
  const win = Math.round(sr * 0.4);
  for (let i = start; i + win <= end; i += Math.round(win / 4)) {
    let s = 0;
    for (let k = i; k < i + win; k++) s += mono[k] * mono[k];
    powers.push(s / win);
  }
  const loudDb = (p) => 10 * Math.log10(p + 1e-12);
  const abs = powers.filter((p) => loudDb(p) > -60);
  const meanDb = loudDb(abs.reduce((a, b) => a + b, 0) / abs.length);
  const gated = abs.filter((p) => loudDb(p) > meanDb - 10);
  const integrated = loudDb(gated.reduce((a, b) => a + b, 0) / gated.length);
  let peak = 0;
  for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const gainDb = Math.min(TARGET_DB - integrated, CEILING_DB - 20 * Math.log10(peak));
  const gain = 10 ** (gainDb / 20);

  const len = end - start;
  const outL = new Float32Array(len);
  const outR = new Float32Array(len);
  const fadeIn = Math.round(sr * 0.03);
  const fadeOut = Math.round(sr * 0.6);
  for (let i = 0; i < len; i++) {
    const f = Math.min(1, i / fadeIn, (len - 1 - i) / fadeOut);
    outL[i] = L[start + i] * gain * f;
    outR[i] = R[start + i] * gain * f;
  }

  const enc = await createMp3Encoder();
  enc.configure({ sampleRate: sr, channels: 2, bitrate: 128 });
  const parts = [];
  const chunk = sr;
  for (let i = 0; i < len; i += chunk) parts.push(Uint8Array.from(enc.encode([outL.subarray(i, i + chunk), outR.subarray(i, i + chunk)])));
  parts.push(Uint8Array.from(enc.finalize()));
  const mp3 = Buffer.concat(parts);
  await fs.writeFile(path.join(audioDir, `${id}.mp3`), mp3);

  // Analysis at half rate on the trimmed, matched signal.
  const asr = sr / 2;
  const x = new Float32Array(Math.floor(len / 2));
  for (let i = 0; i < x.length; i++) x[i] = ((outL[2 * i] + outR[2 * i] + outL[2 * i + 1] + outR[2 * i + 1]) / 4);

  // Spectral flux for onsets.
  const N1 = 1024;
  const H1 = 256;
  const flux = [];
  let prev = null;
  spectra(x, N1, H1, (f, mag) => {
    const cur = Float64Array.from(mag, (m) => Math.log1p(100 * m));
    let s = 0;
    if (prev) for (let k = 2; k < N1 / 2; k++) s += Math.max(0, cur[k] - prev[k]);
    flux.push(s);
    prev = cur;
  });
  const sorted = [...flux].sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length * 0.99)] || 1;
  const onsetFrames = [];
  const minGap = Math.round((0.035 * asr) / H1);
  for (let f = 3; f < flux.length - 3; f++) {
    let local = 0;
    for (let k = f - 12; k <= f + 12; k++) local += flux[Math.max(0, Math.min(flux.length - 1, k))];
    local /= 25;
    const isPeak = flux[f] >= Math.max(flux[f - 1], flux[f + 1], flux[f - 2], flux[f + 2]);
    if (isPeak && flux[f] > local * 1.25 + ref * 0.06 && (!onsetFrames.length || f - onsetFrames.at(-1) >= minGap)) onsetFrames.push(f);
  }

  // Chromagram: energy folded onto twelve pitch classes.
  const N2 = 4096;
  const H2 = 512;
  const binPc = new Int8Array(N2 / 2).fill(-1);
  const binW = new Float64Array(N2 / 2);
  for (let k = 1; k < N2 / 2; k++) {
    const hz = (k * asr) / N2;
    if (hz < 60 || hz > 2600) continue;
    const midi = 69 + 12 * Math.log2(hz / 440);
    const near = Math.round(midi);
    binPc[k] = ((near % 12) + 12) % 12;
    binW[k] = Math.cos(Math.PI * (midi - near)) ** 2;
  }
  const chroma = [];
  spectra(x, N2, H2, (f, mag) => {
    const c = new Float64Array(12);
    // Only spectral peaks count, so partials between notes do not smear the classes.
    let top = 0;
    for (let k = 1; k < N2 / 2; k++) if (mag[k] > top) top = mag[k];
    for (let k = 2; k < N2 / 2 - 2; k++) {
      if (binPc[k] < 0 || mag[k] < top * 0.02) continue;
      if (mag[k] < mag[k - 1] || mag[k] < mag[k + 1] || mag[k] < mag[k - 2] || mag[k] < mag[k + 2]) continue;
      c[binPc[k]] += mag[k] * binW[k];
    }
    chroma.push(c);
  });

  const onsets = [];
  for (const f of onsetFrames) {
    const t = (f * H1 + N1 / 2) / asr;
    const ci = Math.max(0, Math.min(chroma.length - 1, Math.round((t * asr - N2 / 2) / H2) + 1));
    const c = new Float64Array(12);
    for (let k = ci; k < Math.min(chroma.length, ci + 3); k++) for (let i = 0; i < 12; i++) c[i] = Math.max(c[i], chroma[k][i]);
    const top = Math.max(...c);
    const pcs = [...c.keys()].filter((i) => c[i] >= top * 0.78).sort((a, b) => c[b] - c[a]).slice(0, 3);
    const mask = pcs.reduce((m, p) => m | (1 << p), 0);
    onsets.push(Math.round(t * 100), Math.min(99, Math.round((flux[f] / ref) * 60)), mask);
  }

  // Loudness every quarter second, 0 to 99.
  const q = Math.round(asr / 4);
  const loud = [];
  for (let i = 0; i + q <= x.length; i += q) {
    let s = 0;
    for (let k = i; k < i + q; k++) s += x[k] * x[k];
    loud.push(Math.max(0, Math.min(99, Math.round(((loudDb(s / q) + 50) / 44) * 99))));
  }

  const data = {
    id,
    duration: Math.round((len / sr) * 100) / 100,
    loudnessDb: Math.round(integrated * 10) / 10,
    onsets,
    loud,
  };
  await fs.writeFile(path.join(dataDir, `${id}.json`), JSON.stringify(data));
  return { id, duration: data.duration, gainDb: Math.round(gainDb * 10) / 10, onsets: onsets.length / 3, mp3: mp3.length };
}

if (!isMainThread) {
  parentPort.postMessage(await processOne(workerData));
} else {
  await fs.mkdir(audioDir, { recursive: true });
  await fs.mkdir(dataDir, { recursive: true });
  const only = process.argv.slice(2);
  const ids = (await fs.readdir(srcDir)).filter((f) => f.endsWith('.flac')).map((f) => f.slice(0, -5)).filter((id) => !only.length || only.includes(id)).sort();
  const queue = [...ids];
  const results = [];
  await Promise.all(
    Array.from({ length: Math.min(os.cpus().length - 2, queue.length) }, async () => {
      while (queue.length) {
        const id = queue.shift();
        results.push(
          await new Promise((ok, fail) => {
            const w = new Worker(fileURLToPath(import.meta.url), { workerData: id });
            w.once('message', ok);
            w.once('error', fail);
          }),
        );
      }
    }),
  );
  results.sort((a, b) => a.id.localeCompare(b.id));

  // A small summary the star chart reads at build time.
  const summaryFile = path.join(root, 'src', 'data', 'recordings.json');
  const summary = {};
  for (const f of (await fs.readdir(dataDir)).filter((n) => n.endsWith('.json')).sort()) {
    const d = JSON.parse(await fs.readFile(path.join(dataDir, f), 'utf8'));
    summary[d.id] = { duration: d.duration, onsets: d.onsets.length / 3, loudnessDb: d.loudnessDb };
  }
  await fs.writeFile(summaryFile, `${JSON.stringify(summary, null, 2)}\n`);
  for (const r of results) console.log(`${r.id}  ${r.duration.toFixed(1)}s  gain ${r.gainDb} dB  ${r.onsets} onsets  ${(r.mp3 / 1e6).toFixed(1)} MB`);
  console.log(`total ${(results.reduce((a, r) => a + r.duration, 0) / 60).toFixed(1)} min, ${(results.reduce((a, r) => a + r.mp3, 0) / 1e6).toFixed(1)} MB`);
}
