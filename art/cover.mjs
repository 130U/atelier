// A record's cover is its own score drawn in a circle: one ring per note of
// the scale, one arc per chord tone, one dot per possible bell.
import { TAU, hex, mix3, add3, mul3, smoothstep, rng, len, fbm } from './lib.mjs';

export function coverWork(rec) {
  const [ground, guide, chord, bell] = rec.palette.map(hex);
  const steps = rec.scale.length;
  const radius = (semi) => 0.1 + (semi / 31) * 0.32;
  const tone = (degree, k) => {
    const d = degree + 2 * k;
    return rec.scale[d % steps] + 12 * Math.floor(d / steps);
  };
  const P = rec.progression.length;
  const arcs = rec.progression.map((deg, i) => ({
    a0: (i / P) * TAU + 0.05,
    a1: ((i + 1) / P) * TAU - 0.05,
    radii: [0, 1, 2].map((k) => radius(tone(deg, k))),
  }));
  const rings = [];
  for (let o = 0; o < 3; o++) for (const s of rec.scale) if (s + 12 * o <= 31) rings.push(radius(s + 12 * o));
  const r = rng(rec.root * 7 + rec.bpm);
  const dots = Array.from({ length: Math.round(rec.bells.density * 90) }, () => {
    const semi = rec.scale[Math.floor(r() * steps)] + 12 * (1 + Math.floor(r() * 2));
    const a = r() * TAU;
    const rr = radius(Math.min(31, semi));
    return { x: Math.cos(a) * rr, y: Math.sin(a) * rr, s: 0.004 + r() * 0.006 };
  });

  return {
    title: rec.title,
    sentence: rec.sentence,
    size: [1000, 1000],
    look: { exposure: 1, grain: 0.03, vignette: 0.35 },
    shade(x, y, u, v, px) {
      const d = len(x, y);
      let c = mix3(mul3(guide, 0.35), ground, smoothstep(0, 0.62, d));
      c = mul3(c, 0.9 + 0.1 * fbm(x * 3, y * 3, 3));
      let a = Math.atan2(-y, x) + Math.PI / 2;
      if (a < 0) a += TAU;

      for (const rr of rings) c = add3(c, guide, 0.5 * smoothstep(px * 1.2, 0, Math.abs(d - rr)));
      for (const arc of arcs) {
        if (a < arc.a0 || a > arc.a1) continue;
        const fade = smoothstep(arc.a0, arc.a0 + 0.12, a) * smoothstep(arc.a1, arc.a1 - 0.12, a);
        for (const rr of arc.radii) c = add3(c, chord, 1.6 * fade * smoothstep(0.004 + px, 0.004 - px, Math.abs(d - rr)));
      }
      for (const dot of dots) {
        const e = len(x - dot.x, y - dot.y);
        c = add3(c, bell, 2 * smoothstep(dot.s + px, dot.s - px, e) + 0.12 * Math.exp(-e * 90));
      }

      const label = smoothstep(0.062 + px, 0.062 - px, d);
      c = mix3(c, mix3(chord, ground, 0.55), label);
      c = mix3(c, mul3(ground, 0.4), smoothstep(0.009 + px, 0.009 - px, d));
      return c;
    },
  };
}
