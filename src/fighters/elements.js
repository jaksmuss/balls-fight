/* Combattants élémentaires : Pyro, Foudre, Trou noir, Volcan, Nuage, Tornade, Raz-de-marée, Ronce. */
import { Ball } from '../sim/ball.js';
import { Entity, Zone, Delayed, drawTelegraph } from '../sim/entities.js';
import * as M from '../sim/dmath.js';
import { circle, line, clampInArena } from './helpers.js';

// ========================================================================= PYRO
class FireZone extends Zone {
  onTick(b) { b.addDot('burn', 6, 1.5, this.owner, '#ff7a1a'); }
  draw(ctx) {
    const k = Math.min(1, this.life / 0.6);
    ctx.save();
    ctx.globalAlpha = 0.55 * k;
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r);
    g.addColorStop(0, '#fff3a0');
    g.addColorStop(0.4, '#ff8a1a');
    g.addColorStop(1, 'rgba(255,40,0,0)');
    ctx.fillStyle = g;
    circle(ctx, this.x, this.y, this.r * (0.85 + 0.15 * Math.sin(this.age * 20 + this.x)));
    ctx.fill();
    ctx.restore();
  }
}
export class PyroBall extends Ball {
  static meta = {
    id: 'pyro', color: '#ff6a00',
    name: { fr: 'Pyro', en: 'Pyro' },
    desc: {
      fr: 'Laisse une traînée de flammes qui brûle les ennemis qui la traversent.',
      en: 'Leaves a trail of fire that burns enemies crossing it.',
    },
  };
  update(dt) {
    if (this.timer('trail', 0.09, dt)) {
      this.world.spawn(new FireZone(this.world, this, { x: this.x, y: this.y, r: 17 * this.scale, life: 2.4, tick: 0.25 }));
    }
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#ffd23a';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.7);
    ctx.quadraticCurveTo(r * 0.55, -r * 0.1, r * 0.35, r * 0.35);
    ctx.quadraticCurveTo(0, r * 0.75, -r * 0.35, r * 0.35);
    ctx.quadraticCurveTo(-r * 0.5, -r * 0.05, -r * 0.1, -r * 0.25);
    ctx.quadraticCurveTo(-r * 0.05, -r * 0.45, 0, -r * 0.7);
    ctx.fill();
    ctx.fillStyle = '#fff6c8';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.25, r * 0.16, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ======================================================================= FOUDRE
export class ThunderBall extends Ball {
  static meta = {
    id: 'thunder', color: '#e8c200',
    name: { fr: 'Foudre', en: 'Thunder' },
    desc: {
      fr: 'Chaque rebond sur un mur le charge. À 4 charges, la foudre frappe l\'ennemi.',
      en: 'Each wall bounce charges it. At 4 charges, lightning strikes the enemy.',
    },
  };
  init() { this.tags.charge = 0; }
  onWall() {
    if (this.abilityRate === 0) return;
    this.tags.charge++;
    if (this.tags.charge >= 4) {
      const t = this.target();
      if (!t) return;
      this.tags.charge = 0;
      this.world.emit('zap', { x1: t.x, y1: t.y - 400, x2: t.x, y2: t.y, color: '#fff27a', big: true });
      t.stun(0.35);
      this.world.damage(t, 13, this, { color: '#fff27a', big: true });
      this.world.emit('shake', { amount: 8 });
    }
  }
  drawOver(ctx) {
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + (i - 1.5) * 0.45;
      ctx.fillStyle = i < this.tags.charge ? '#fff27a' : 'rgba(0,0,0,0.4)';
      circle(ctx, this.x + Math.cos(a) * (this.r + 9), this.y + Math.sin(a) * (this.r + 9), 4);
      ctx.fill();
    }
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#fffbe0';
    ctx.strokeStyle = '#6b5600';
    ctx.lineWidth = r * 0.05;
    ctx.beginPath();
    ctx.moveTo(r * 0.15, -r * 0.75); ctx.lineTo(-r * 0.35, r * 0.1); ctx.lineTo(-r * 0.02, r * 0.1);
    ctx.lineTo(-r * 0.15, r * 0.75); ctx.lineTo(r * 0.38, -r * 0.12); ctx.lineTo(r * 0.04, -r * 0.12);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
}

// ==================================================================== TROU NOIR
class Singularity extends Entity {
  constructor(world, owner, x, y) {
    super(world, owner);
    this.layer = 'floor';
    this.x = x; this.y = y;
    this.life = 2.6;
    this.diesWithOwner = true;
  }
  update(dt) {
    this.age += dt;
    if (this.age >= this.life) { this.kill(); return; }
    const R = 230;
    for (const b of this.world.balls) {
      if (b.team === this.team || !b.targetable) continue;
      const n = M.normalize(this.x - b.x, this.y - b.y);
      if (n.d > R) continue;
      const f = 1350 * (1 - n.d / R) * dt;
      b.vx += n.x * f; b.vy += n.y * f;
      if (n.d < 30 + b.r * 0.5 && this.world.cdReady(`sing${this.owner.id}-${b.id}`, 0.4)) {
        this.world.damage(b, 4, this.owner, { color: '#b070ff' });
      }
    }
  }
  draw(ctx) {
    const k = Math.min(1, this.age / 0.25, (this.life - this.age) / 0.3);
    ctx.save();
    ctx.globalAlpha = k;
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 70);
    g.addColorStop(0, '#000000');
    g.addColorStop(0.35, '#1a0033');
    g.addColorStop(0.6, 'rgba(150,80,255,0.55)');
    g.addColorStop(1, 'rgba(150,80,255,0)');
    ctx.fillStyle = g;
    circle(ctx, this.x, this.y, 70); ctx.fill();
    ctx.strokeStyle = 'rgba(200,160,255,0.6)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, 30 + i * 14, this.age * 4 + i * 2, this.age * 4 + i * 2 + 2.2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
export class BlackHoleBall extends Ball {
  static meta = {
    id: 'blackhole', color: '#2a1050',
    name: { fr: 'Trou noir', en: 'Black Hole' },
    desc: {
      fr: 'Crée une singularité qui aspire les ennemis et les broie en son cœur.',
      en: 'Creates a singularity that sucks enemies in and grinds them at its core.',
    },
  };
  update(dt) {
    if (this.timer('sing', 4.4, dt, 2)) {
      const t = this.target();
      if (!t) return;
      const p = clampInArena(this.world, (this.x + t.x * 2) / 3, (this.y + t.y * 2) / 3, 60);
      this.world.spawn(new Singularity(this.world, this, p.x, p.y));
    }
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#000';
    circle(ctx, 0, 0, r * 0.38); ctx.fill();
    ctx.strokeStyle = '#c79bff';
    ctx.lineWidth = r * 0.07;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.5 + i * 0.15), i * 2, i * 2 + 2.4);
      ctx.stroke();
    }
  }
}

// ======================================================================= VOLCAN
class LavaPool extends Zone {
  onTick(b) { b.addDot('lava', 4, 1, this.owner, '#ff4a1a'); }
}
export class VolcanoBall extends Ball {
  static meta = {
    id: 'volcano', color: '#7a2a12',
    name: { fr: 'Volcan', en: 'Volcano' },
    desc: {
      fr: 'Entre en éruption : des rochers de lave pleuvent autour des ennemis.',
      en: 'Erupts: lava rocks rain down around enemies.',
    },
  };
  update(dt) {
    if (this.timer('erupt', 2.6, dt, 1.5)) {
      const w = this.world;
      this.world.emit('burst', { x: this.x, y: this.y, color: '#ff6a1a', n: 16 });
      for (let i = 0; i < 3; i++) {
        const t = this.target();
        if (!t) return;
        const p = clampInArena(w, t.x + t.vx * 0.6 + w.rng.range(-90, 90), t.y + t.vy * 0.6 + w.rng.range(-90, 90), 20);
        w.spawn(new Delayed(w, this, 0.95 + i * 0.12, () => {
          if (this.dead) return;
          w.explode(p.x, p.y, 48, 7, this, { color: '#ff6a1a', knock: 200 });
          w.spawn(new LavaPool(w, this, { x: p.x, y: p.y, r: 30, life: 1.6, tick: 0.5, color: '#ff4a1a' }));
        }, (ctx, prog) => drawTelegraph(ctx, p.x, p.y, 48, prog, '#ff6a1a')));
      }
    }
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#3b1508';
    ctx.beginPath();
    ctx.moveTo(-r * 0.75, r * 0.6); ctx.lineTo(-r * 0.2, -r * 0.3); ctx.lineTo(r * 0.2, -r * 0.3); ctx.lineTo(r * 0.75, r * 0.6);
    ctx.fill();
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, -r * 0.3); ctx.lineTo(r * 0.2, -r * 0.3); ctx.lineTo(r * 0.05, r * 0.1); ctx.lineTo(-r * 0.1, r * 0.25);
    ctx.fill();
    ctx.fillStyle = '#ffb040';
    circle(ctx, -r * 0.15, -r * 0.6, r * 0.12); ctx.fill();
    circle(ctx, r * 0.2, -r * 0.7, r * 0.09); ctx.fill();
  }
}

// ======================================================================== NUAGE
class RainCloud extends Entity {
  constructor(world, owner, target) {
    super(world, owner);
    this.target = target;
    this.x = target.x; this.y = target.y - 120;
    this.life = 4.5;
    this.diesWithOwner = true;
  }
  update(dt) {
    this.age += dt;
    const t = this.target;
    if (t.dead || this.age >= this.life) {
      if (!t.dead && M.hypot(t.x - this.x, t.y - this.y) < 60 + t.r) {
        this.world.emit('zap', { x1: this.x, y1: this.y, x2: t.x, y2: t.y, color: '#d8f0ff', big: true });
        this.world.damage(t, 6, this.owner, { color: '#d8f0ff' });
      }
      this.kill();
      return;
    }
    const n = M.normalize(t.x - this.x, t.y - this.y);
    const sp = M.min(150, n.d * 4);
    this.x += n.x * sp * dt; this.y += n.y * sp * dt;
    if (n.d < 55 + t.r * 0.5 && this.world.cdReady(`rain${this.owner.id}-${t.id}`, 0.5)) {
      this.world.damage(t, 3, this.owner, { kind: 'dot', color: '#7cc8ff' });
    }
  }
  draw(ctx) {
    const k = Math.min(1, this.age / 0.3, (this.life - this.age) / 0.3);
    ctx.save();
    ctx.globalAlpha = 0.85 * k;
    ctx.strokeStyle = 'rgba(140,200,255,0.7)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const px = this.x - 40 + ((i * 11 + this.age * 37) % 80);
      const py = this.y + 10 + ((this.age * 400 + i * 23) % 50);
      line(ctx, px, py, px - 3, py + 10);
    }
    ctx.fillStyle = '#9aa8bd';
    for (const [dx, dy, rr] of [[-26, 4, 20], [0, -6, 26], [26, 4, 20], [0, 8, 22]]) {
      circle(ctx, this.x + dx, this.y + dy, rr); ctx.fill();
    }
    ctx.restore();
  }
}
export class CloudBall extends Ball {
  static meta = {
    id: 'cloud', color: '#6c7f9c',
    name: { fr: 'Nuage', en: 'Storm Cloud' },
    desc: {
      fr: 'Envoie un nuage de pluie qui suit l\'ennemi, puis le foudroie s\'il est encore dessous.',
      en: 'Sends a rain cloud that follows the enemy, then zaps it if it\'s still underneath.',
    },
  };
  update(dt) {
    if (this.timer('cloud', 4.5, dt, 1.5)) {
      const t = this.target({ mainOnly: true });
      if (t) this.world.spawn(new RainCloud(this.world, this, t));
    }
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#eef4ff';
    for (const [dx, dy, rr] of [[-0.3, 0.05, 0.28], [0.05, -0.15, 0.36], [0.35, 0.05, 0.26], [0, 0.15, 0.3]]) {
      circle(ctx, dx * r, dy * r, rr * r); ctx.fill();
    }
    ctx.strokeStyle = '#7cc8ff';
    ctx.lineWidth = r * 0.07;
    for (let i = -1; i <= 1; i++) line(ctx, i * r * 0.25, r * 0.5, i * r * 0.25 - r * 0.06, r * 0.72);
  }
}

// ====================================================================== TORNADE
export class TornadoBall extends Ball {
  static meta = {
    id: 'tornado', color: '#8fb3a8',
    name: { fr: 'Tornade', en: 'Tornado' },
    desc: {
      fr: 'Un vent tourbillonnant dévie les ennemis ; par moments il tourbillonne et lacère tout autour.',
      en: 'Swirling winds deflect enemies; at times it spins up and shreds everything around.',
    },
  };
  init() { this.tags.spinDir = this.world.rng.sign(); this.tags.whirl = 0; }
  update(dt) {
    const rate = this.abilityRate;
    if (rate === 0) return;
    if (this.tags.whirl > 0) this.tags.whirl -= dt;
    if (this.timer('whirl', 3, dt, 2)) this.tags.whirl = 1.2;
    const R = 160;
    for (const t of this.world.balls) {
      if (t.team === this.team || !t.targetable) continue;
      const dx = t.x - this.x, dy = t.y - this.y;
      const d = M.hypot(dx, dy);
      if (d > R || d < 1) continue;
      const k = (1 - d / R) * dt * (this.tags.whirl > 0 ? 2.2 : 1);
      const s = this.tags.spinDir;
      // vent normal : repousse en tournant ; tourbillon : aspire vers les lames
      const radial = this.tags.whirl > 0 ? -260 : 180;
      t.vx += (-dy / d * s * 520 + dx / d * radial) * k;
      t.vy += (dx / d * s * 520 + dy / d * radial) * k;
      if (this.tags.whirl > 0 && d < this.r + t.r + 55 && this.world.cdReady(`whirl${this.id}-${t.id}`, 0.25)) {
        this.world.damage(t, 4, this, { color: '#d8fff4' });
      }
    }
  }
  drawUnder(ctx) {
    const w = this.tags.whirl > 0;
    ctx.save();
    ctx.strokeStyle = w ? 'rgba(220,255,245,0.7)' : 'rgba(180,230,220,0.25)';
    ctx.lineWidth = w ? 3 : 2;
    const t = this.world.time * (w ? 14 : 5) * this.tags.spinDir;
    for (let i = 0; i < 5; i++) {
      const rr = this.r + 12 + i * (w ? 9 : 22);
      ctx.beginPath();
      ctx.arc(this.x, this.y, rr, t + i, t + i + 1.6);
      ctx.stroke();
    }
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineCap = 'round';
    ctx.lineWidth = r * 0.09;
    for (let i = 0; i < 5; i++) {
      const y = -r * 0.55 + i * r * 0.27;
      const w = r * (0.7 - i * 0.12);
      line(ctx, -w + i * r * 0.04, y, w + i * r * 0.04, y);
    }
  }
}

// ================================================================ RAZ-DE-MARÉE
class Wave extends Entity {
  constructor(world, owner, dir) {
    super(world, owner);
    this.layer = 'floor';
    this.dir = dir;           // 0: →, 1: ←, 2: ↓, 3: ↑
    this.pos = dir === 1 || dir === 3 ? world.size : 0;
    this.speed = 330;
    this.hitSet = new Set();
  }
  update(dt) {
    this.age += dt;
    const S = this.world.size;
    const sgn = this.dir === 1 || this.dir === 3 ? -1 : 1;
    this.pos += this.speed * dt * sgn;
    if (this.pos < -40 || this.pos > S + 40) { this.kill(); return; }
    const horizontal = this.dir < 2;
    for (const b of this.world.balls) {
      if (b.team === this.team || !b.targetable || this.hitSet.has(b.id)) continue;
      const c = horizontal ? b.x : b.y;
      if (M.abs(c - this.pos) < b.r + 18) {
        this.hitSet.add(b.id);
        this.world.damage(b, 7, this.owner, { color: '#8fdcff' });
        if (horizontal) b.vx = sgn * 560; else b.vy = sgn * 560;
      }
    }
  }
  draw(ctx) {
    const S = this.world.size, horizontal = this.dir < 2;
    const sgn = this.dir === 1 || this.dir === 3 ? -1 : 1;
    ctx.save();
    const g = horizontal
      ? ctx.createLinearGradient(this.pos - sgn * 70, 0, this.pos, 0)
      : ctx.createLinearGradient(0, this.pos - sgn * 70, 0, this.pos);
    g.addColorStop(0, 'rgba(40,120,255,0)');
    g.addColorStop(0.8, 'rgba(60,160,255,0.55)');
    g.addColorStop(1, 'rgba(220,245,255,0.9)');
    ctx.fillStyle = g;
    if (horizontal) ctx.fillRect(Math.min(this.pos, this.pos - sgn * 70), 0, 70, S);
    else ctx.fillRect(0, Math.min(this.pos, this.pos - sgn * 70), S, 70);
    ctx.restore();
  }
}
export class WaveBall extends Ball {
  static meta = {
    id: 'wave', color: '#1f6fd1',
    name: { fr: 'Raz-de-marée', en: 'Tidal Wave' },
    desc: {
      fr: 'Déclenche une vague qui balaie toute l\'arène et emporte les ennemis contre le mur.',
      en: 'Unleashes a wave that sweeps the whole arena and carries enemies into the wall.',
    },
  };
  update(dt) {
    if (this.timer('wave', 4.2, dt, 2.5)) {
      const t = this.target({ mainOnly: true });
      if (!t) return;
      // la vague part du côté opposé au mur le plus proche de la cible (elle l'y écrase)
      const S = this.world.size;
      const opts = [[t.x, 1], [S - t.x, 0], [t.y, 3], [S - t.y, 2]];
      opts.sort((a, b) => a[0] - b[0]);
      this.world.spawn(new Wave(this.world, this, opts[0][1]));
    }
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#e8f6ff';
    ctx.beginPath();
    ctx.moveTo(-r, r * 0.3);
    ctx.quadraticCurveTo(-r * 0.5, -r * 0.6, r * 0.1, -r * 0.45);
    ctx.quadraticCurveTo(-r * 0.2, -r * 0.2, r * 0.05, r * 0.05);
    ctx.quadraticCurveTo(r * 0.5, r * 0.1, r, -r * 0.05);
    ctx.lineTo(r, r); ctx.lineTo(-r, r);
    ctx.fill();
  }
}

// ======================================================================== RONCE
class Bramble extends Entity {
  constructor(world, owner, x, y) {
    super(world, owner);
    this.layer = 'floor';
    this.x = x; this.y = y;
    this.r = 22 * owner.scale;
    this.life = 6;
    this.grow = 0.7;
    this.diesWithOwner = true;
  }
  update(dt) {
    this.age += dt;
    if (this.age >= this.life) { this.kill(); return; }
    if (this.age < this.grow) return;
    for (const b of this.world.balls) {
      if (b.team === this.team || !b.targetable) continue;
      if (M.hypot(b.x - this.x, b.y - this.y) < this.r + b.r && this.world.cdReady(`br${this.owner.id}-${b.id}`, 1.1)) {
        b.root(0.7);
        this.world.damage(b, 3, this.owner, { color: '#7cff6b' });
      }
    }
  }
  draw(ctx) {
    const g = Math.min(1, this.age / this.grow);
    const k = Math.min(1, (this.life - this.age) / 0.4);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.strokeStyle = g < 1 ? '#6a8a3a' : '#2f7a1f';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + this.x;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.quadraticCurveTo(this.x + Math.cos(a + 0.6) * this.r * 0.7 * g, this.y + Math.sin(a + 0.6) * this.r * 0.7 * g,
        this.x + Math.cos(a) * this.r * g, this.y + Math.sin(a) * this.r * g);
      ctx.stroke();
    }
    if (g >= 1) {
      ctx.fillStyle = '#e04080';
      circle(ctx, this.x, this.y, 4); ctx.fill();
    }
    ctx.restore();
  }
}
export class PlantBall extends Ball {
  static meta = {
    id: 'plant', color: '#2e8b3a',
    name: { fr: 'Ronce', en: 'Bramble' },
    desc: {
      fr: 'Plante des graines qui deviennent des ronces : elles enracinent et griffent les ennemis.',
      en: 'Plants seeds that grow into brambles: they root and scratch enemies.',
    },
  };
  update(dt) {
    if (this.timer('seed', 1.7, dt, 1)) {
      const mine = this.world.entities.filter(e => e instanceof Bramble && e.owner === this);
      if (mine.length >= 6) mine[0].kill();
      this.world.spawn(new Bramble(this.world, this, this.x, this.y));
    }
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#9be36a';
    ctx.beginPath();
    ctx.ellipse(-r * 0.22, -r * 0.1, r * 0.3, r * 0.14, -0.6, 0, Math.PI * 2);
    ctx.ellipse(r * 0.22, -r * 0.25, r * 0.3, r * 0.14, 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d7ffb0';
    ctx.lineWidth = r * 0.08;
    line(ctx, 0, r * 0.6, 0, -r * 0.2);
  }
}

export const ELEMENTS = [PyroBall, ThunderBall, BlackHoleBall, VolcanoBall, CloudBall, TornadoBall, WaveBall, PlantBall];
