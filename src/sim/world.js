/* Monde de simulation : balles, entités, collisions, dégâts, fin de combat.
 * Entièrement déterministe : World({seed, roster}) donne toujours le même combat. */
import { CONFIG, STEP } from './config.js';
import * as M from './dmath.js';
import { Rng } from './rng.js';
import { POWER } from './balance.js';
import { getFighter } from '../fighters/registry.js';

export class World {
  /**
   * @param {object} o
   * @param {number} o.seed
   * @param {{fighter: string, team: number, name?: string, bot?: boolean}[]} o.roster
   * @param {boolean} [o.headless] pas d'événements visuels (tests / équilibrage)
   * @param {object} [o.power] multiplicateurs d'équilibrage (remplace POWER)
   */
  constructor({ seed, roster, headless = false, power = null }) {
    this.seed = seed >>> 0;
    this.rng = new Rng(this.seed);
    this.size = CONFIG.arena.size;
    this.headless = headless;
    this.powerTable = power || POWER;
    this.time = 0;
    this.tick = 0;
    this.nextId = 1;
    this.balls = [];
    this.entities = [];
    this.events = [];
    this.cds = new Map();
    this.over = false;
    this.winnerTeam = null;
    this.endTime = 0;
    this.decision = false;  // victoire aux points
    // statistiques du combat (succès) : n'influencent pas la simulation
    this.stats = { hits: 0, maxHit: 0, kills: [] };

    const perTeam = {};
    for (const r of roster) perTeam[r.team] = (perTeam[r.team] || 0) + 1;
    const n = M.max(...Object.values(perTeam));
    this.teamSize = n;
    const scale = CONFIG.teamScale[n] ?? 0.7;
    this.mainBalls = roster.map(r => {
      const Cls = getFighter(r.fighter);
      return new Cls(this, { team: r.team, name: r.name, bot: r.bot, scale });
    });
    this.balls = [...this.mainBalls];
    this.place();
    for (const b of this.mainBalls) b.init();
  }

  powerOf(id) { return this.powerTable[id] ?? 1; }

  /** Positions et directions de départ aléatoires (sans chevauchement). */
  place() {
    const S = this.size;
    const placed = [];
    for (const b of this.mainBalls) {
      for (let tries = 0; tries < 300; tries++) {
        // chaque équipe démarre plutôt de son côté
        const side = b.team === 0 ? 0 : 1;
        b.x = this.rng.range(b.r + 10, S - b.r - 10);
        if (this.teamSize > 1) b.x = side ? this.rng.range(S * 0.55, S - b.r - 10) : this.rng.range(b.r + 10, S * 0.45);
        b.y = this.rng.range(b.r + 10, S - b.r - 10);
        if (placed.every(o => M.hypot(o.x - b.x, o.y - b.y) > o.r + b.r + 120)) break;
      }
      placed.push(b);
      const q = this.rng.int(4);
      b.launch(q * (M.PI / 2) + this.rng.range(0.3, M.PI / 2 - 0.3));
    }
  }

  // ------------------------------------------------------------ requêtes
  enemiesOf(ball) { return this.balls.filter(b => !b.dead && b.team !== ball.team); }
  alliesOf(ball, includeSelf = false) {
    return this.balls.filter(b => !b.dead && b.team === ball.team && !b.summon && (includeSelf || b !== ball));
  }

  nearestEnemyOfTeam(team, x, y, { mainOnly = false, exclude = null } = {}) {
    let best = null, bd = Infinity;
    for (const b of this.balls) {
      if (b.team === team || !b.targetable || b === exclude) continue;
      if (mainOnly && b.summon) continue;
      const dx = b.x - x, dy = b.y - y;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  nearestEnemy(ball, opts) { return this.nearestEnemyOfTeam(ball.team, ball.x, ball.y, opts); }

  /** Vrai une fois toutes les `dur` s pour la clé donnée (cooldowns par paire). */
  cdReady(key, dur) {
    const t = this.cds.get(key);
    if (t !== undefined && this.time < t) return false;
    this.cds.set(key, this.time + dur);
    return true;
  }

  // ------------------------------------------------------------ actions
  spawn(e) { this.entities.push(e); return e; }

  summon(Cls, owner, opts = {}) {
    const b = new Cls(this, { team: owner.team, summon: true, owner, scale: owner.scale, ...opts });
    b.x = opts.x ?? owner.x; b.y = opts.y ?? owner.y;
    b.launch(opts.angle ?? this.rng.angle());
    this.balls.push(b);
    b.init();
    return b;
  }

  emit(type, data) {
    if (!this.headless) this.events.push({ type, t: this.time, ...data });
  }

  /**
   * Inflige des dégâts. o : { kind: 'contact'|'ability'|'dot'|'reflect', x, y, color, big, pure }
   * Renvoie les dégâts réellement infligés.
   */
  damage(target, amount, src, o = {}) {
    if (!target || target.dead || this.over || amount <= 0) return 0;
    if (target.st.invuln > 0 || target.st.intangible > 0) {
      this.emit('block', { x: o.x ?? target.x, y: o.y ?? target.y });
      return 0;
    }
    let a = amount * CONFIG.damageScale;
    if (src && !o.pure) {
      a *= src.power;
      if (src.st.weaken > 0) a *= src.st.weakenF;
      a = src.modifyOutgoing(a, target, o);
    }
    a = target.modifyIncoming(a, src, o);
    if (target.st.bubble > 0 && o.kind !== 'dot') {
      a *= 2;
      target.st.bubble = 0;
      this.emit('pop', { x: target.x, y: target.y, r: target.r });
    }
    if (a <= 0) return 0;
    target.hp -= a;
    target.hitTime = this.time;
    target.dmgTaken = (target.dmgTaken || 0) + a;
    if (o.kind !== 'dot') this.stats.hits++;
    if (a > this.stats.maxHit) this.stats.maxHit = a;
    this.emit('hit', {
      id: target.id, x: o.x ?? target.x, y: o.y ?? target.y, amount: a,
      color: o.color || '#ffffff', big: !!o.big || a >= 10, kind: o.kind || 'ability',
      tx: target.x, ty: target.y - target.r,
    });
    if (src && !src.dead) src.onDealtDamage(target, a, o);
    target.onDamaged(a, src, o);
    if (target.hp <= 0 && !target.dead) this.kill(target, src, o);
    return a;
  }

  heal(target, amount, src) {
    if (!target || target.dead || amount <= 0) return 0;
    const a = M.min(amount, target.maxHp - target.hp);
    if (a <= 0) return 0;
    target.hp += a;
    this.emit('heal', { id: target.id, x: target.x, y: target.y - target.r, amount: a });
    return a;
  }

  kill(target, src, o = {}) {
    if (target.preventDeath()) return;
    target.hp = 0;
    target.dead = true;
    this.stats.kills.push({ victim: target, src, kind: o.kind || 'ability', reflected: !!o.reflected, time: this.time });
    target.onDeath();
    this.emit('death', { id: target.id, x: target.x, y: target.y, r: target.r, color: target.color, summon: target.summon });
    // les invocations meurent avec leur maître
    if (!target.summon) for (const b of this.balls) if (b.owner === target && !b.dead) { b.dead = true; this.emit('death', { id: b.id, x: b.x, y: b.y, r: b.r, color: b.color, summon: true }); }
    for (const e of this.entities) if (e.owner === target && e.diesWithOwner) e.kill();
  }

  /** Explosion : dégâts + recul aux ennemis de `src` dans le rayon. */
  explode(x, y, radius, dmg, src, { knock = 300, color = '#ffb040', selfDamage = 0, falloff = false } = {}) {
    this.emit('explode', { x, y, r: radius, color });
    for (const b of this.balls) {
      if (b.dead || b.team === src.team) continue;
      const d = M.hypot(b.x - x, b.y - y);
      if (d > radius + b.r) continue;
      const k = falloff ? M.clamp(1 - d / (radius + b.r), 0.4, 1) : 1;
      this.damage(b, dmg * k, src, { x: b.x, y: b.y, color, big: dmg >= 10 });
      const n = M.normalize(b.x - x, b.y - y);
      b.vx += n.x * knock; b.vy += n.y * knock;
    }
    if (selfDamage && M.hypot(src.x - x, src.y - y) < radius + src.r) this.damage(src, selfDamage, src, { pure: true });
  }

  /**
   * Rayon depuis (x,y) dans la direction `angle` jusqu'au mur.
   * Renvoie { x2, y2, hits: [balles ennemies traversées, de la plus proche à la plus loin] }.
   */
  ray(x, y, angle, team, width = 0) {
    const dx = M.cos(angle), dy = M.sin(angle);
    const S = this.size;
    let t = Infinity;
    if (dx > 1e-9) t = M.min(t, (S - x) / dx); else if (dx < -1e-9) t = M.min(t, -x / dx);
    if (dy > 1e-9) t = M.min(t, (S - y) / dy); else if (dy < -1e-9) t = M.min(t, -y / dy);
    const x2 = x + dx * t, y2 = y + dy * t;
    const hits = [];
    for (const b of this.balls) {
      if (b.team === team || !b.targetable) continue;
      if (M.distToSegment(b.x, b.y, x, y, x2, y2) < b.r + width) {
        hits.push({ b, d: (b.x - x) * dx + (b.y - y) * dy });
      }
    }
    hits.sort((a, c) => a.d - c.d);
    return { x2, y2, hits: hits.map(h => h.b) };
  }

  wallHit(ball, nx, ny, impact) {
    ball.lastWall = this.time;
    if (impact > 120 && !ball.summon) this.emit('wall', { x: ball.x - nx * ball.r, y: ball.y - ny * ball.r, speed: impact });
    if (ball.st.slam > 0) {
      const src = ball.st.slamSrc;
      ball.st.slam = 0;
      this.damage(ball, impact * ball.st.slamF, src, { kind: 'slam', x: ball.x - nx * ball.r, y: ball.y - ny * ball.r, color: '#c9a0ff', big: true });
      this.emit('shake', { amount: 8 });
    }
    ball.onWall(nx, ny, impact);
  }

  // ------------------------------------------------------------ boucle
  collide(a, b) {
    if (a.st.intangible > 0 || b.st.intangible > 0) return;
    if (a.tags.attachedTo === b || b.tags.attachedTo === a) return;
    let dx = b.x - a.x, dy = b.y - a.y;
    let dist = M.hypot(dx, dy);
    const minD = a.r + b.r;
    if (dist >= minD) return;
    if (dist < 1e-6) { dx = 1e-3; dy = 0; dist = 1e-3; }
    const nx = dx / dist, ny = dy / dist;
    const ia = a.immovable ? 0 : 1 / a.mass;
    const ib = b.immovable ? 0 : 1 / b.mass;
    const sum = ia + ib || 1;
    const overlap = minD - dist;
    a.x -= nx * overlap * ia / sum; a.y -= ny * overlap * ia / sum;
    b.x += nx * overlap * ib / sum; b.y += ny * overlap * ib / sum;

    const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    const approaching = rel < 0;
    if (approaching) {
      const j = (-2 * rel) / sum;
      a.vx -= j * ia * nx; a.vy -= j * ia * ny;
      b.vx += j * ib * nx; b.vy += j * ib * ny;
    }
    if (a.team === b.team) return;

    a.onContact(b, nx, ny, approaching);
    b.onContact(a, -nx, -ny, approaching);
    if (approaching && !a.summon && !b.summon && !a.dead && !b.dead) {
      const key = a.id < b.id ? `c${a.id}-${b.id}` : `c${b.id}-${a.id}`;
      if (this.cdReady(key, CONFIG.contact.cooldown)) {
        const cx = a.x + nx * a.r, cy = a.y + ny * a.r;
        const da = CONFIG.contact.damage + b.contactBonus(a);
        const db = CONFIG.contact.damage + a.contactBonus(b);
        this.damage(a, da, b, { kind: 'contact', x: cx, y: cy, big: da >= 10 });
        this.damage(b, db, a, { kind: 'contact', x: cx, y: cy, big: db >= 10 });
        this.emit('bump', { x: cx, y: cy, speed: -rel });
      }
    }
  }

  step(dt = STEP) {
    this.time += dt;
    this.tick++;

    if (this.over) {
      for (const b of this.balls) if (!b.dead) b.physics(dt);
      for (const e of this.entities) if (e.alive) e.update(dt);
      this.entities = this.entities.filter(e => e.alive);
      return;
    }

    let live = this.balls.filter(b => !b.dead);
    for (const b of live) b.physics(dt);
    live = live.filter(b => !b.dead);
    for (let i = 0; i < live.length; i++)
      for (let j = i + 1; j < live.length; j++) this.collide(live[i], live[j]);
    for (const b of live) if (!b.dead) b.update(dt);

    const ents = this.entities;
    for (let i = 0; i < ents.length; i++) if (ents[i].alive) ents[i].update(dt);
    this.entities = this.entities.filter(e => e.alive);
    this.balls = this.balls.filter(b => !(b.dead && b.summon));

    this.checkEnd();
  }

  checkEnd() {
    const alive = new Set();
    for (const b of this.mainBalls) if (!b.dead) alive.add(b.team);
    if (alive.size <= 1) {
      this.finish(alive.size ? [...alive][0] : null);
    } else if (this.time >= CONFIG.maxTime) {
      // garde-fou : victoire aux points
      const score = {};
      for (const b of this.mainBalls) score[b.team] = (score[b.team] || 0) + M.max(0, b.hp) / b.maxHp;
      const teams = Object.keys(score).map(Number).sort((a, b) => score[b] - score[a]);
      this.decision = true;
      this.finish(score[teams[0]] === score[teams[1]] ? null : teams[0]);
    }
  }

  finish(team) {
    this.over = true;
    this.winnerTeam = team;
    this.endTime = this.time;
    this.emit('end', { team });
  }

  /** Empreinte de l'état (détection de désynchronisation en ligne). */
  hash() {
    const f = new Float64Array(1);
    const u = new Uint32Array(f.buffer);
    let h = 2166136261 >>> 0;
    const mix = v => {
      f[0] = v;
      h = Math.imul(h ^ u[0], 16777619) >>> 0;
      h = Math.imul(h ^ u[1], 16777619) >>> 0;
    };
    mix(this.time);
    mix(this.rng.state);
    mix(this.entities.length);
    for (const b of this.balls) { mix(b.x); mix(b.y); mix(b.vx); mix(b.vy); mix(b.hp); }
    return h >>> 0;
  }
}
