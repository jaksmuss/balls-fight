/* Générateur pseudo-aléatoire déterministe (mulberry32) : même graine = même combat. */
import { TAU } from './dmath.js';

export class Rng {
  constructor(seed) {
    this.state = seed >>> 0;
  }

  /** Nombre dans [0, 1). */
  next() {
    let a = (this.state = (this.state + 0x6d2b79f5) | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a, b) { return a + this.next() * (b - a); }
  int(n) { return Math.floor(this.next() * n); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[this.int(arr.length)]; }
  angle() { return this.next() * TAU; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
}

/** Graine aléatoire (non déterministe) pour lancer un nouveau combat. */
export function randomSeed() {
  return (Math.random() * 4294967296) >>> 0;
}
