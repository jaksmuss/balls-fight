/* Équilibrage automatique (npm run balance).
 * Fait s'affronter tous les combattants en 1V1 sur de nombreuses graines, puis ajuste
 * le multiplicateur de puissance POWER de chacun pour viser ~50 % de victoires.
 * Écrit le résultat dans src/sim/balance.js.
 * Options : --iter N (itérations, défaut 6), --games N (combats par combattant et par itération, défaut 40),
 *           --k X (force de la correction, défaut 0.45) */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};

if (!isMainThread) {
  const { World } = await import('../src/sim/world.js');
  const { STEP } = await import('../src/sim/config.js');
  const { jobs, power } = workerData;
  const out = [];
  for (const [a, b, seed] of jobs) {
    const w = new World({ seed, roster: [{ fighter: a, team: 0 }, { fighter: b, team: 1 }], headless: true, power });
    while (!w.over) w.step(STEP);
    out.push([a, b, w.winnerTeam, w.endTime, w.decision ? 1 : 0]);
  }
  parentPort.postMessage(out);
} else {
  const { FIGHTER_IDS } = await import('../src/fighters/registry.js');
  const { POWER } = await import('../src/sim/balance.js');
  const ids = FIGHTER_IDS;
  const iters = arg('iter', 6), games = arg('games', 40);
  const power = {};
  for (const id of ids) power[id] = POWER[id] ?? 1;
  const nWorkers = Math.max(1, cpus().length);
  let seedBase = 1;

  const runJobs = async (jobs) => {
    const chunks = Array.from({ length: nWorkers }, () => []);
    jobs.forEach((j, i) => chunks[i % nWorkers].push(j));
    const res = await Promise.all(chunks.filter(c => c.length).map(c => new Promise((ok, ko) => {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs: c, power } });
      w.once('message', ok); w.once('error', ko);
    })));
    return res.flat();
  };

  for (let it = 0; it <= iters; it++) {
    const jobs = [];
    // chaque combattant affronte `games` adversaires tirés en rotation
    for (let i = 0; i < ids.length; i++) {
      for (let g = 0; g < games / 2; g++) {
        const j = (i + 1 + ((g * 17 + it * 5) % (ids.length - 1))) % ids.length;
        jobs.push([ids[i], ids[j], seedBase++]);
      }
    }
    const t0 = Date.now();
    const res = await runJobs(jobs);
    const stat = {};
    for (const id of ids) stat[id] = { w: 0, n: 0, t: 0, dec: 0 };
    let totalT = 0, decisions = 0;
    for (const [a, b, win, t, dec] of res) {
      stat[a].n++; stat[b].n++;
      stat[a].t += t; stat[b].t += t;
      stat[a].dec += dec; stat[b].dec += dec;
      totalT += t; decisions += dec;
      if (win === 0) stat[a].w++; else if (win === 1) stat[b].w++;
      else { stat[a].w += 0.5; stat[b].w += 0.5; }
    }
    const rates = ids.map(id => [id, stat[id].w / stat[id].n, stat[id].t / stat[id].n, stat[id].dec]);
    rates.sort((x, y) => y[1] - x[1]);
    const spread = rates.map(r => Math.abs(r[1] - 0.5));
    console.log(`\nItération ${it} (${res.length} combats, ${((Date.now() - t0) / 1000).toFixed(0)} s) — durée moy ${(totalT / res.length).toFixed(1)} s, décisions aux points ${decisions}, écart moyen ${(spread.reduce((s, x) => s + x, 0) / spread.length * 100).toFixed(1)} pts`);
    console.log(rates.map(([id, r, t, d]) => `${id.padEnd(10)} ${(r * 100).toFixed(0).padStart(3)}%  ${t.toFixed(0).padStart(3)}s${d ? ` (${d} déc.)` : ''}  P=${power[id].toFixed(2)}`).join('\n'));
    if (it === iters) break;
    // ajustement : P *= (0.5 / taux)^k, amorti
    for (const [id, r] of rates) {
      const rr = Math.min(0.92, Math.max(0.08, r));
      power[id] = Math.min(2.5, Math.max(0.35, power[id] * Math.pow(0.5 / rr, arg('k', 0.45))));
    }
  }

  const body = ids.map(id => `  ${id}: ${power[id].toFixed(3)},`).join('\n');
  writeFileSync(new URL('../src/sim/balance.js', import.meta.url),
    `/* Multiplicateurs d'équilibrage par combattant (dégâts et soins infligés).\n * Généré par \`npm run balance\` — ne pas modifier à la main sauf pour un ajustement ponctuel. */\nexport const POWER = {\n${body}\n};\n`);
  console.log('\nsrc/sim/balance.js mis à jour.');
}
