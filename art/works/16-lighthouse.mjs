import { hex, mix3, add3, mul3, ramp, smoothstep, noise, fbm, len } from '../lib.mjs';

const sea = -0.3;
const air = [
  [sea, hex('#1f2a33')],
  [0.1, hex('#141b23')],
  [0.5, hex('#0a0e14')],
];
const beam = hex('#fff0c8');
const lx = -0.22;
const ly = -0.178;
const heading = 0.36;

function rocks(x) {
  return sea + 0.012 + 0.028 * Math.exp(-((x - lx) ** 2) * 60) + 0.008 * fbm(x * 20, 3, 3);
}

export default {
  title: 'Lighthouse',
  sentence: 'A lighthouse beam turning slowly through the fog.',
  size: [1000, 1250],
  look: { exposure: 1.05, grain: 0.045, vignette: 0.45, bloom: 0.7, threshold: 0.45, spread: 0.03 },
  shade(x, y, u, v, px) {
    const density = smoothstep(-0.4, 0.7, fbm(x * 2.2 + 0.6 * fbm(x * 1.1, y, 3), y * 3.2, 5));
    let c = mul3(ramp(air, y), 0.85 + 0.35 * density);

    const vx = x - lx;
    const vy = y - ly;
    const dist = len(vx, vy);
    let a = Math.atan2(vy, vx) - heading;
    a = Math.atan2(Math.sin(a), Math.cos(a));
    const main = Math.exp(-((a / (0.05 + 0.02 * dist)) ** 2)) * Math.exp(-dist * 1.1);
    const back = Math.exp(-(((Math.abs(a) - Math.PI) / 0.07) ** 2)) * Math.exp(-dist * 2.4) * 0.25;
    c = add3(c, beam, (main + back) * (0.25 + 1.2 * density));
    c = add3(c, beam, 0.12 * Math.exp(-dist * 7) * (0.5 + density));

    if (y < sea) {
      c = mix3(hex('#06090d'), c, 0.15);
      const col = Math.exp(-(((x - lx) / (0.006 + (sea - y) * 0.08)) ** 2));
      c = add3(c, beam, col * 0.4 * smoothstep(0.3, 0.75, noise(x * 120, (sea - y) * 300)) * Math.exp(-(sea - y) * 8));
    }
    if (y < rocks(x)) c = mix3(c, hex('#030406'), smoothstep(rocks(x) + px, rocks(x) - px, y));

    const tw = 0.011 - (y - ly) * 0.04;
    if (y < ly - 0.008 && y > rocks(x) - 0.01 && Math.abs(x - lx) < tw) c = mix3(c, hex('#0b0d10'), 0.96);
    if (Math.abs(x - lx) < 0.012 && y > ly - 0.008 && y < ly + 0.012) c = mix3(c, hex('#050608'), 0.8);
    c = add3(c, beam, 0.00005 / ((x - lx) ** 2 + (y - ly - 0.002) ** 2 + 0.000012));
    return c;
  },
};
