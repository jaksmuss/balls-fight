/* Maths déterministes.
 *
 * La simulation doit donner EXACTEMENT le même résultat dans tous les navigateurs
 * (le mode en ligne ne s'échange que la graine et les choix des joueurs).
 * Math.sin/cos/atan2/hypot/pow/exp... ne sont pas garantis identiques d'un moteur
 * JS à l'autre ; +, -, *, /, sqrt, floor, round, abs, min, max le sont.
 * Toute la logique de simulation doit donc passer par ce module.
 * (Le code de RENDU peut utiliser Math librement.)
 */

export const PI = Math.PI;
export const TAU = PI * 2;
const HALF_PI = PI / 2;

export const sqrt = Math.sqrt;
export const abs = Math.abs;
export const min = Math.min;
export const max = Math.max;
export const floor = Math.floor;
export const round = Math.round;

export function hypot(x, y) {
  return Math.sqrt(x * x + y * y);
}

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

/** Ramène un angle dans [-PI, PI]. */
export function wrapAngle(a) {
  return a - TAU * Math.round(a / TAU);
}

/** sin par série de Taylor sur [-PI/2, PI/2] (erreur < 1e-13). */
export function sin(x) {
  x = wrapAngle(x);
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  const x2 = x * x;
  // x - x^3/3! + x^5/5! - ... jusqu'à x^19
  let term = x;
  let sum = x;
  for (let n = 1; n <= 9; n++) {
    term *= -x2 / ((2 * n) * (2 * n + 1));
    sum += term;
  }
  return sum;
}

export function cos(x) {
  return sin(x + HALF_PI);
}

const TAN_PI_12 = 0.2679491924311227; // tan(15°)
const SQRT3 = 1.7320508075688772;

function atanSmall(x) {
  // |x| <= tan(15°) : série x - x^3/3 + x^5/5 ...
  const x2 = x * x;
  let term = x;
  let sum = x;
  for (let n = 1; n <= 12; n++) {
    term *= -x2;
    sum += term / (2 * n + 1);
  }
  return sum;
}

export function atan(x) {
  let sign = 1;
  if (x < 0) { x = -x; sign = -1; }
  let offset = 0;
  if (x > 1) { x = 1 / x; offset = HALF_PI; }
  let r;
  if (x > TAN_PI_12) r = PI / 6 + atanSmall((x * SQRT3 - 1) / (SQRT3 + x));
  else r = atanSmall(x);
  if (offset) r = HALF_PI - r;
  return sign * r;
}

export function atan2(y, x) {
  if (x > 0) return atan(y / x);
  if (x < 0) return y >= 0 ? atan(y / x) + PI : atan(y / x) - PI;
  if (y > 0) return HALF_PI;
  if (y < 0) return -HALF_PI;
  return 0;
}

/** Différence d'angle signée la plus courte (b - a). */
export function angleDiff(a, b) {
  return wrapAngle(b - a);
}

/** Distance d'un point au segment [a, b]. */
export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
  const qx = ax + dx * t - px, qy = ay + dy * t - py;
  return Math.sqrt(qx * qx + qy * qy);
}

/** Point du segment [a, b] le plus proche de p. */
export function closestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
  return { x: ax + dx * t, y: ay + dy * t, t };
}

export function normalize(x, y) {
  const d = Math.sqrt(x * x + y * y);
  return d > 1e-9 ? { x: x / d, y: y / d, d } : { x: 1, y: 0, d: 0 };
}
