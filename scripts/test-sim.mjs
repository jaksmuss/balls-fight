/* Tests de la simulation (node scripts/test-sim.mjs) :
 *  1. chaque combattant affronte plusieurs adversaires (1V1 et 2V2) sans erreur ;
 *  2. aucune fonction Math non déterministe n'est appelée pendant la simulation ;
 *  3. même graine => même combat (empreinte identique) ;
 *  4. les combats se terminent dans un temps raisonnable. */
import { World } from '../src/sim/world.js';
import { STEP } from '../src/sim/config.js';
import { FIGHTER_IDS } from '../src/fighters/registry.js';

const FORBIDDEN = ['sin', 'cos', 'tan', 'atan', 'atan2', 'asin', 'acos', 'hypot', 'pow', 'exp', 'log', 'random', 'cbrt', 'sinh', 'cosh', 'tanh', 'expm1', 'log1p', 'log2', 'log10'];
const saved = {};
function poisonMath() {
  for (const k of FORBIDDEN) {
    saved[k] = Math[k];
    Math[k] = () => { throw new Error(`Math.${k} appelé pendant la simulation (non déterministe)`); };
  }
}
function restoreMath() { for (const k of FORBIDDEN) Math[k] = saved[k]; }

function run(seed, roster, maxTime = 400) {
  const w = new World({ seed, roster, headless: true });
  while (!w.over && w.time < maxTime) w.step(STEP);
  return w;
}

let failures = 0;
const times = [];
const ids = FIGHTER_IDS;
console.log(`${ids.length} combattants`);

poisonMath();
try {
  // 1V1 : chaque combattant contre 4 adversaires
  for (let i = 0; i < ids.length; i++) {
    for (let k = 1; k <= 4; k++) {
      const a = ids[i], b = ids[(i + k * 7) % ids.length];
      const seed = i * 1000 + k;
      try {
        const w = run(seed, [{ fighter: a, team: 0 }, { fighter: b, team: 1 }]);
        times.push(w.endTime);
      } catch (e) {
        failures++;
        console.error(`ÉCHEC 1V1 ${a} vs ${b} (graine ${seed}) :`, e.stack.split('\n').slice(0, 4).join('\n'));
      }
    }
  }
  // 2V2
  for (let i = 0; i < ids.length; i++) {
    const r = [ids[i], ids[(i + 13) % ids.length], ids[(i + 29) % ids.length], ids[(i + 41) % ids.length]];
    try {
      run(5000 + i, [{ fighter: r[0], team: 0 }, { fighter: r[1], team: 0 }, { fighter: r[2], team: 1 }, { fighter: r[3], team: 1 }]);
    } catch (e) {
      failures++;
      console.error(`ÉCHEC 2V2 ${r.join(',')} :`, e.stack.split('\n').slice(0, 4).join('\n'));
    }
  }
  // Déterminisme
  for (let i = 0; i < 10; i++) {
    const roster = [{ fighter: ids[i * 5 % ids.length], team: 0 }, { fighter: ids[(i * 11 + 3) % ids.length], team: 1 }];
    const h1 = run(777 + i, roster).hash();
    const h2 = run(777 + i, roster).hash();
    if (h1 !== h2) { failures++; console.error(`ÉCHEC déterminisme ${roster.map(r => r.fighter)} : ${h1} != ${h2}`); }
  }
} finally {
  restoreMath();
}

times.sort((a, b) => a - b);
const avg = times.reduce((s, t) => s + t, 0) / times.length;
console.log(`Durée 1V1 : moy ${avg.toFixed(1)} s, médiane ${times[times.length >> 1].toFixed(1)} s, min ${times[0].toFixed(1)} s, max ${times[times.length - 1].toFixed(1)} s`);
console.log(failures ? `${failures} échec(s)` : 'Tous les tests passent.');
process.exit(failures ? 1 : 0);
