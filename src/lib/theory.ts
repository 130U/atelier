import catalogue from '../data/etudes.json';
import recordings from '../data/recordings.json';
import palette from '../data/palette.json';

export interface Etude {
  id: string;
  op: number;
  no: number;
  tonic: number;
  mode: 'major' | 'minor';
  key: string;
  tempo: string;
  en: string;
  duration: number;
  onsets: number;
  magnitude: number;
}

type Recording = { duration: number; onsets: number; loudnessDb: number };
const recs = recordings as Record<string, Recording>;

// Apparent magnitude from the recording's loudness, on Pogson's scale: five
// magnitudes are a hundredfold in power, so one magnitude is 4 dB. The mean of
// the twenty-four sits at 3, about the faintest star a city sky shows.
const meanDb = Object.values(recs).reduce((s, r) => s + r.loudnessDb, 0) / Object.keys(recs).length;
const magnitudeOf = (id: string) => Math.round((3 + (meanDb - recs[id].loudnessDb) / 4) * 10) / 10;

export const etudes: Etude[] = catalogue.etudes.map((e) => ({
  ...(e as Omit<Etude, 'duration' | 'onsets' | 'magnitude'>),
  duration: recs[e.id].duration,
  onsets: recs[e.id].onsets,
  magnitude: magnitudeOf(e.id),
}));
export const byId = new Map(etudes.map((e) => [e.id, e]));

export const LETTERS = palette.letters;
export const MINOR_LETTERS = palette.minorLetters;
export const PIGMENTS = palette.pigments;

export const fifths = (pc: number) => (pc * 7) % 12;
// A minor key sits at the same angle as its relative major.
export const keyIndex = (e: Etude) => fifths(e.mode === 'major' ? e.tonic : (e.tonic + 3) % 12);
export const pigment = (e: Etude) => PIGMENTS[keyIndex(e)];
export const label = (e: Etude) => `Op. ${e.op} · No. ${e.no}`;
export const short = (e: Etude) => `${e.op}·${e.no}`;
export const nameOf = (e: Etude) => e.en || `No. ${e.no}`;

export function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// How b's key stands to a's, in the terms of harmony.
export function relation(a: Etude, b: Etude) {
  const enharmonic = a.key[0] !== b.key[0] ? ', spelled enharmonically' : '';
  if (a.tonic === b.tonic) return a.mode === b.mode ? 'in the same key' : `in the parallel ${b.mode}${enharmonic}`;
  if (keyIndex(a) === keyIndex(b)) return `in its relative ${b.mode}`;
  const up = (b.tonic - a.tonic + 12) % 12;
  if (up === 7) return 'in the dominant';
  if (up === 5) return 'in the subdominant';
  if (up === 3 || up === 4) return `a ${up === 4 ? 'major' : 'minor'} third above, a mediant relation`;
  if (up === 8 || up === 9) return `a ${up === 8 ? 'major' : 'minor'} third below, a mediant relation`;
  const d = Math.abs(fifths(a.tonic) - fifths(b.tonic));
  return `${Math.min(d, 12 - d)} fifths away on the circle`;
}

// Études sharing a key are drawn as one multiple star.
export const companions = (e: Etude) => etudes.filter((x) => x.id !== e.id && x.tonic === e.tonic && x.mode === e.mode);
export const positionAngle = (e: Etude) => keyIndex(e) * 30;

// The étude Chopin published beside this one: Nos. 1 and 2, 3 and 4, and so on.
export const partnerOf = (e: Etude) => etudes.find((x) => x.op === e.op && x.no === (e.no % 2 ? e.no + 1 : e.no - 1))!;

// Plate geometry, matching art/plate.mjs.
export const PLATE = { R0: 0.05, R1: 0.335 };
export function hash(x: number, y = 0, z = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440670441);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
