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
  zh: string;
  duration: number;
}

export const etudes: Etude[] = catalogue.etudes.map((e) => ({
  ...(e as Omit<Etude, 'duration'>),
  duration: (recordings as Record<string, { duration: number }>)[e.id].duration,
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

// How two keys sit relative to each other, in words.
export function relation(a: Etude, b: Etude) {
  if (a.tonic === b.tonic) return a.mode === b.mode ? 'in the same key' : 'in the parallel key';
  if (keyIndex(a) === keyIndex(b)) return 'in its relative key';
  const d = Math.abs(fifths(a.tonic) - fifths(b.tonic));
  const steps = Math.min(d, 12 - d);
  if (steps === 1) return 'a fifth away';
  const semis = Math.min((a.tonic - b.tonic + 12) % 12, (b.tonic - a.tonic + 12) % 12);
  if (semis === 3 || semis === 4) return 'a third away';
  return `${steps} fifths away`;
}

// The étude Chopin published beside this one: Nos. 1 and 2, 3 and 4, and so on.
export const partnerOf = (e: Etude) => etudes.find((x) => x.op === e.op && x.no === (e.no % 2 ? e.no + 1 : e.no - 1))!;

// Plate geometry, matching art/plate.mjs.
export const PLATE = { R0: 0.06, R1: 0.395 };
export function hash(x: number, y = 0, z = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440670441);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
