/* Classe de base de tous les combattants.
 *
 * ➜ CRÉER UN COMBATTANT : voir src/fighters/README.md (et n'importe quel fichier
 *   de src/fighters/ comme modèle). En résumé :
 *     export class MaBalle extends Ball {
 *       static meta = { id, name: {fr, en}, desc: {fr, en}, color };
 *       update(dt) { if (this.timer('tir', 2, dt)) { ... } }   // capacité
 *       drawIcon(ctx, r) { ... }                                // motif sur la balle
 *     }
 *   puis l'ajouter dans src/fighters/registry.js.
 *
 * RÈGLE D'OR : tout ce qui influence la simulation (update, hooks) doit utiliser
 * src/sim/dmath.js et this.world.rng — jamais Math.sin/cos/atan2/random.
 * Les méthodes draw* ne servent qu'à l'affichage et peuvent utiliser Math.
 */
import { CONFIG } from './config.js';
import * as M from './dmath.js';

const D = CONFIG.defaults;

export class Ball {
  static meta = { id: 'base', name: { fr: 'Balle', en: 'Ball' }, desc: { fr: '', en: '' }, color: '#888888' };

  constructor(world, opts = {}) {
    const meta = this.constructor.meta;
    this.world = world;
    this.meta = meta;
    this.fighterId = meta.id;
    this.id = world.nextId++;
    this.team = opts.team ?? 0;
    this.playerName = opts.name || '';
    this.isBot = !!opts.bot;
    this.summon = !!opts.summon;     // invocation (ne compte pas pour la victoire)
    this.owner = opts.owner || null;
    this.scale = opts.scale ?? 1;
    this.baseR = (opts.radius ?? meta.radius ?? D.radius) * this.scale;
    this.r = this.baseR;
    this.maxHp = opts.hp ?? meta.hp ?? D.hp;
    this.hp = this.maxHp;
    this.baseSpeed = opts.speed ?? meta.speed ?? D.speed;
    this.speedMult = 1;               // modifiable par les capacités (vol de vitesse...)
    this.massMult = meta.mass ?? 1;
    this.color = meta.color;
    this.power = opts.power ?? (this.owner ? this.owner.power : world.powerOf(meta.id));
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.z = 0;                       // hauteur (affichage des sauts)
    this.alpha = 1;                   // transparence (affichage)
    this.immovable = false;           // masse infinie dans les collisions
    this.noRelax = false;             // la vitesse n'est pas ramenée à la vitesse de croisière
    this.reflectsProjectiles = false;
    this.st = {
      slow: 0, slowMove: 1, slowAbility: 1,
      stun: 0, root: 0, silence: 0, bubble: 0,
      intangible: 0, invuln: 0,
      weaken: 0, weakenF: 1,
      haste: 0, hasteF: 1,
      slam: 0, slamF: 0, slamSrc: null,
    };
    this.dots = [];
    this.tags = {};                   // états propres aux capacités (piles, marques...)
    this.timers = {};
    this.hitTime = -10;
    this.dead = false;
  }

  // ---------------------------------------------------------------- état
  get mass() { return this.immovable ? 1e9 : this.r * this.r * this.massMult; }
  get frozen() { const s = this.st; return s.stun > 0 || s.root > 0 || s.bubble > 0; }
  /** Multiplicateur des timers de capacité (0 = capacité bloquée). */
  get abilityRate() {
    const s = this.st;
    if (s.stun > 0 || s.silence > 0 || s.bubble > 0) return 0;
    return s.slow > 0 ? s.slowAbility : 1;
  }
  get targetable() { return !this.dead && this.st.intangible <= 0; }
  get hpFrac() { return this.hp / this.maxHp; }

  cruiseSpeed() {
    const s = this.st;
    let v = this.baseSpeed * this.speedMult * this.speedFactor();
    if (s.slow > 0) v *= s.slowMove;
    if (s.haste > 0) v *= s.hasteF;
    return v;
  }

  launch(angle, speed = this.cruiseSpeed()) {
    this.vx = M.cos(angle) * speed;
    this.vy = M.sin(angle) * speed;
  }

  get speed() { return M.hypot(this.vx, this.vy); }
  setSpeed(s) {
    const n = M.normalize(this.vx, this.vy);
    this.vx = n.x * s; this.vy = n.y * s;
  }
  moveToward(x, y, speed) {
    const n = M.normalize(x - this.x, y - this.y);
    this.vx = n.x * speed; this.vy = n.y * speed;
  }
  dist(o) { return M.hypot(o.x - this.x, o.y - this.y); }
  angleTo(o) { return M.atan2(o.y - this.y, o.x - this.x); }
  isEnemy(o) { return o.team !== this.team; }

  // ------------------------------------------------------------- statuts
  applySlow(dur, move, ability = 1) {
    if (this.st.invuln > 0) return;
    this.st.slow = M.max(this.st.slow, dur);
    this.st.slowMove = move;
    this.st.slowAbility = ability;
    const s = this.speed, t = this.cruiseSpeed();
    if (s > t) this.setSpeed(t);
  }
  stun(d) { if (this.st.invuln <= 0) this.st.stun = M.max(this.st.stun, d); }
  root(d) { if (this.st.invuln <= 0) this.st.root = M.max(this.st.root, d); }
  silence(d) { if (this.st.invuln <= 0) this.st.silence = M.max(this.st.silence, d); }
  weaken(d, f) { this.st.weaken = M.max(this.st.weaken, d); this.st.weakenF = f; }
  haste(d, f) { this.st.haste = M.max(this.st.haste, d); this.st.hasteF = f; }
  /** Prochain choc contre un mur dans `d` s inflige vitesse*f dégâts (envoyé par src). */
  slam(d, f, src) { this.st.slam = d; this.st.slamF = f; this.st.slamSrc = src; }

  /** Dégâts sur la durée. id : une seule instance par (id, source), rafraîchie. */
  addDot(id, dps, dur, src, color = '#7cff6b') {
    if (this.st.invuln > 0) return;
    const d = this.dots.find(o => o.id === id && o.src === src);
    if (d) { d.t = M.max(d.t, dur); d.dps = M.max(d.dps, dps); return; }
    this.dots.push({ id, dps, t: dur, tick: 0.5, src, color });
  }
  hasDot(id) { return this.dots.some(d => d.id === id); }

  /** Timer de capacité : renvoie true toutes les `period` secondes (ralenti/bloqué par les statuts). */
  timer(name, period, dt, first = period) {
    if (this.timers[name] === undefined) this.timers[name] = first;
    this.timers[name] -= dt * this.abilityRate;
    if (this.timers[name] <= 0) { this.timers[name] += period; return true; }
    return false;
  }

  /** Ennemi le plus proche (peut être une invocation ou un leurre). */
  target(opts) { return this.world.nearestEnemy(this, opts); }

  // ------------------------------------------------------------- physique
  tickStatuses(dt) {
    const s = this.st;
    for (const k of ['slow', 'stun', 'root', 'silence', 'bubble', 'intangible', 'invuln', 'weaken', 'haste', 'slam']) {
      if (s[k] > 0) s[k] -= dt;
    }
    if (this.dots.length) {
      for (const d of this.dots) {
        d.t -= dt; d.tick -= dt;
        if (d.tick <= 0) {
          d.tick += 0.5;
          this.world.damage(this, d.dps * 0.5, d.src, { kind: 'dot', color: d.color });
          if (this.dead) return;
        }
      }
      this.dots = this.dots.filter(d => d.t > 0);
    }
  }

  physics(dt) {
    const P = CONFIG.physics;
    const S = this.world.size;
    this.tickStatuses(dt);
    if (this.dead) return;

    if (!this.noRelax) {
      let s = this.speed;
      if (s < 1) {
        const a = this.world.rng.angle();
        this.vx = M.cos(a); this.vy = M.sin(a); s = 1;
      }
      const target = this.cruiseSpeed();
      let ns = s + (target - s) * M.min(1, P.speedRelax * dt);
      ns = M.min(ns, P.maxSpeed);
      this.vx *= ns / s; this.vy *= ns / s;
    }

    if (!this.frozen) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }

    const r = this.r;
    let nx = 0, ny = 0, impact = 0;
    if (this.x - r < 0) { this.x = r; if (this.vx < 0) { impact = -this.vx; this.vx = -this.vx; } nx = 1; }
    else if (this.x + r > S) { this.x = S - r; if (this.vx > 0) { impact = this.vx; this.vx = -this.vx; } nx = -1; }
    if (this.y - r < 0) { this.y = r; if (this.vy < 0) { impact = M.max(impact, -this.vy); this.vy = -this.vy; } ny = 1; }
    else if (this.y + r > S) { this.y = S - r; if (this.vy > 0) { impact = M.max(impact, this.vy); this.vy = -this.vy; } ny = -1; }
    if (impact > 0) {
      if (P.wallJitter) this.rotateVelocity(this.world.rng.range(-P.wallJitter, P.wallJitter));
      this.world.wallHit(this, nx, ny, impact);
    }
  }

  rotateVelocity(a) {
    const c = M.cos(a), s = M.sin(a);
    const vx = this.vx * c - this.vy * s;
    this.vy = this.vx * s + this.vy * c;
    this.vx = vx;
  }

  // ------------------------------------------------------- crochets (sim)
  /** Appelé après le placement initial. */
  init() {}
  /** Capacité, appelée à chaque pas fixe. */
  update(dt) {}
  /** Rebond sur un mur (normale nx, ny ; vitesse d'impact). */
  onWall(nx, ny, impact) {}
  /** Contact physique avec un ennemi (appelé à chaque pas tant qu'ils se touchent). */
  onContact(other, nx, ny, approaching) {}
  /** Bonus de dégâts de contact contre `other`. */
  contactBonus(other) { return 0; }
  /** Modifie les dégâts reçus (bouclier, armure...). */
  modifyIncoming(amount, src, o) { return amount; }
  /** Modifie les dégâts infligés. */
  modifyOutgoing(amount, target, o) { return amount; }
  onDamaged(amount, src, o) {}
  onDealtDamage(target, amount, o) {}
  /** Renvoie true pour annuler la mort (résurrection...). */
  preventDeath() { return false; }
  onDeath() {}
  /** Multiplicateur de vitesse de croisière propre au combattant. */
  speedFactor() { return 1; }

  // --------------------------------------------------- crochets (affichage)
  /** Motif dessiné sur la balle, centré en (0,0), rayon r, déjà découpé en cercle.
   *  Sert aussi pour les vignettes de l'écran de sélection. */
  drawIcon(ctx, r) {}
  /** Dessiné sous toutes les balles (traînées, fils...). */
  drawUnder(ctx) {}
  /** Dessiné au-dessus de la balle (armes, jauges...). */
  drawOver(ctx) {}
}
