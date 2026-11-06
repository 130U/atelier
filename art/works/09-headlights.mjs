import { hex, mix3, add3, mul3, smoothstep, fbm, fract } from '../lib.mjs';

const ceiling = hex('#0d0e12');
const sodium = hex('#ffc98a');
const cool = hex('#9eb8ff');

// A window's shape thrown across the ceiling by a passing car.
function band(x, y, angle, offset, spread, bars) {
  const a = x * Math.cos(angle) + y * Math.sin(angle);
  const b = -x * Math.sin(angle) + y * Math.cos(angle) - offset;
  const width = 0.11 + spread * (a + 0.9);
  const soft = 0.012 + 0.03 * (a + 0.9);
  let m = smoothstep(width + soft, width - soft, Math.abs(b)) * smoothstep(-0.95, -0.55, a) * smoothstep(0.95, 0.45, a);
  if (bars) {
    const mullion = smoothstep(0.012 + soft * 0.3, 0.004, Math.abs(b - width * 0.08));
    const rail = smoothstep(0.022 + soft * 0.3, 0.008, Math.abs(fract(a / 0.42 + 0.3) - 0.5) * 0.42);
    m *= 1 - 0.8 * Math.min(1, mullion + rail);
  }
  return m;
}

export default {
  title: 'Passing',
  sentence: 'Headlights from the street crossing the ceiling of a dark room.',
  size: [1500, 1000],
  look: { exposure: 1, grain: 0.04, vignette: 0.5, bloom: 0.4, threshold: 0.5, spread: 0.03 },
  shade(x, y) {
    let c = mul3(ceiling, 0.9 + 0.1 * fbm(x * 5, y * 5, 3));
    const warm = band(x, y, -0.32, 0.02, 0.09, true);
    const blue = band(x + 0.1, y - 0.05, 0.42, -0.12, 0.16, false);
    c = add3(c, sodium, 0.75 * warm);
    c = add3(c, cool, 0.05 * blue);
    if (y < -0.3) {
      const wall = mix3(hex('#08080b'), add3(hex('#08080b'), sodium, 0.05 * warm), 0.5);
      c = mix3(c, wall, smoothstep(-0.3, -0.305, y));
    }
    return c;
  },
};
