/* Un combat en cours : fait avancer la simulation à pas fixe au rythme de l'affichage. */
import { World } from './sim/world.js';
import { STEP } from './sim/config.js';

const HASH_EVERY = 600; // pas de simulation entre deux empreintes (5 s)

export class Match {
  /**
   * @param {object} o
   * @param {number} o.seed
   * @param {object[]} o.roster [{ fighter, team, name, bot }]
   * @param {string[]} o.names noms affichés dans le HUD
   * @param {import('./render/renderer.js').Renderer} o.renderer
   * @param {boolean} [o.online] vitesse fixe, pas de pause
   * @param {number} [o.startAt] (en ligne) instant de départ, pour rattraper un onglet en retard
   * @param {(world: World) => void} [o.onEnd] appelé ~2 s après la fin du combat
   * @param {(tick: number, hash: number) => void} [o.onHash]
   * @param {boolean} [o.demo] combat de démonstration derrière les menus
   */
  constructor(o) {
    this.o = o;
    this.world = new World({ seed: o.seed, roster: o.roster });
    this.renderer = o.renderer;
    this.renderer.silent = !!o.demo;
    this.renderer.attach(this.world, { names: o.names || [] });
    this.renderer.resize();
    this.acc = 0;
    this.speed = 1;
    this.paused = false;
    this.endTimer = 0;
    this.ended = false;
  }

  tick(dt) {
    const w = this.world;
    if (!this.paused) {
      this.acc += dt * this.speed * this.renderer.timeScale();
      // en ligne : si l'onglet a pris du retard (mis en arrière-plan), on rattrape
      if (this.o.online && this.o.startAt && !w.over) {
        const behind = (Date.now() - this.o.startAt) / 1000 - w.time;
        if (behind > 1.5) this.acc += Math.min(behind - 0.5, 20);
      }
      const max = this.o.online ? 2400 : 60;
      let n = 0;
      while (this.acc >= STEP && n < max) {
        w.step(STEP);
        this.acc -= STEP;
        n++;
        if (this.o.onHash && w.tick % HASH_EVERY === 0 && !w.over) this.o.onHash(w.tick, w.hash());
      }
      if (n === max) this.acc = 0;
    }
    this.renderer.consume();
    if (w.over && !this.ended) {
      this.endTimer += dt;
      if (this.endTimer > 2.4) {
        this.ended = true;
        this.o.onEnd?.(w);
      }
    }
  }
}
