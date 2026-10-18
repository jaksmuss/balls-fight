/* Contrôle et terrain : Peintre, Disco, Midas, Voleur, Aiguille, Tesla, Médecin, Golem. */
import { Ball } from '../sim/ball.js';
import { Entity, Projectile } from '../sim/entities.js';
import * as M from '../sim/dmath.js';
import { shoot, aim, circle, line, lightning, rgba } from './helpers.js';

// ======================================================================= PEINTRE
const CELL = 40;
class PaintGrid extends Entity {
  constructor(world, owner) {
    super(world, owner);
    this.layer = 'floor';
    this.n = Math.ceil(world.size / CELL);
    this.cells = new Uint8Array(this.n * this.n);
    this.diesWithOwner = true;
  }
  cellAt(x, y) {
    const i = M.clamp(M.floor(x / CELL), 0, this.n - 1), j = M.clamp(M.floor(y / CELL), 0, this.n - 1);
    return j * this.n + i;
  }
  update(dt) {
    const o = this.owner;
    if (o.dead) { this.kill(); return; }
    if (o.abilityRate > 0) {
      // peint la case sous lui et ses voisines touchées
      for (const [dx, dy] of [[0, 0], [o.r * 0.7, 0], [-o.r * 0.7, 0], [0, o.r * 0.7], [0, -o.r * 0.7]]) {
        this.cells[this.cellAt(o.x + dx, o.y + dy)] = 1;
      }
    }
    this.tickT = (this.tickT ?? 0.5) - dt;
    if (this.tickT <= 0) {
      this.tickT = 0.5;
      for (const b of this.world.enemiesOf(o)) {
        if (b.targetable && this.cells[this.cellAt(b.x, b.y)]) {
          b.applySlow(0.6, 0.7);
          this.world.damage(b, 1.5, o, { kind: 'dot', color: o.color });
        }
      }
    }
  }
  onOwnPaint() { const o = this.owner; return this.cells[this.cellAt(o.x, o.y)] === 1; }
  draw(ctx) {
    ctx.save();
    ctx.fillStyle = rgba(this.owner.color, 0.32);
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        if (this.cells[j * this.n + i]) ctx.fillRect(i * CELL + 1, j * CELL + 1, CELL - 2, CELL - 2);
      }
    }
    ctx.restore();
  }
}
export class PainterBall extends Ball {
  static meta = {
    id: 'painter', color: '#e83f8f',
    name: { fr: 'Peintre', en: 'Painter' },
    desc: {
      fr: 'Repeint l\'arène à sa couleur : il y fonce plus vite, les ennemis y sont ralentis et rongés.',
      en: 'Paints the arena its colour: it speeds up on it, while enemies are slowed and eaten away.',
    },
  };
  init() { this.grid = this.world.spawn(new PaintGrid(this.world, this)); }
  speedFactor() { return this.grid && this.grid.onOwnPaint() ? 1.25 : 1; }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#ffe14a'; circle(ctx, -r * 0.3, -r * 0.25, r * 0.17); ctx.fill();
    ctx.fillStyle = '#4ad8ff'; circle(ctx, r * 0.25, -r * 0.35, r * 0.15); ctx.fill();
    ctx.fillStyle = '#7dff6b'; circle(ctx, r * 0.35, r * 0.15, r * 0.15); ctx.fill();
    ctx.fillStyle = '#ffffff'; circle(ctx, -r * 0.2, r * 0.3, r * 0.17); ctx.fill();
  }
}

// ========================================================================= DISCO
class DanceFloor extends Entity {
  constructor(world, owner) {
    super(world, owner);
    this.layer = 'floor';
    this.n = 6;
    this.tile = world.size / this.n;
    this.lit = new Uint8Array(this.n * this.n);
    this.phase = 0;
    this.diesWithOwner = true;
    this.newPattern();
  }
  newPattern() {
    const rng = this.world.rng;
    this.hue = rng.int(360);
    for (let i = 0; i < this.lit.length; i++) this.lit[i] = rng.chance(0.33) ? 1 : 0;
  }
  update(dt) {
    const o = this.owner;
    if (o.dead) { this.kill(); return; }
    this.phase += dt * (o.abilityRate || 0.3);
    if (this.phase >= 1.3) { this.phase = 0; this.newPattern(); }
    if (this.phase < 0.5) return; // avertissement
    for (const b of this.world.enemiesOf(o)) {
      if (!b.targetable) continue;
      const i = M.clamp(M.floor(b.x / this.tile), 0, this.n - 1), j = M.clamp(M.floor(b.y / this.tile), 0, this.n - 1);
      if (this.lit[j * this.n + i] && this.world.cdReady(`disco${o.id}-${b.id}`, 0.35)) {
        this.world.damage(b, 2.5, o, { kind: 'dot', color: `hsl(${this.hue},100%,70%)` });
      }
    }
  }
  draw(ctx) {
    const on = this.phase >= 0.5;
    const T = this.tile;
    ctx.save();
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        if (!this.lit[j * this.n + i]) continue;
        const h = (this.hue + (i + j) * 40) % 360;
        if (on) {
          ctx.fillStyle = `hsla(${h},100%,60%,0.38)`;
          ctx.fillRect(i * T + 2, j * T + 2, T - 4, T - 4);
        } else {
          ctx.strokeStyle = `hsla(${h},100%,70%,0.5)`;
          ctx.lineWidth = 2;
          ctx.strokeRect(i * T + 4, j * T + 4, T - 8, T - 8);
        }
      }
    }
    ctx.restore();
  }
}
export class DiscoBall extends Ball {
  static meta = {
    id: 'disco', color: '#b8b8c8',
    name: { fr: 'Disco', en: 'Disco' },
    desc: {
      fr: 'Transforme l\'arène en piste de danse : les dalles qui s\'allument brûlent les ennemis.',
      en: 'Turns the arena into a dance floor: lit tiles scorch enemies.',
    },
  };
  init() { this.world.spawn(new DanceFloor(this.world, this)); }
  drawIcon(ctx, r) {
    const s = r * 0.22;
    for (let j = -4; j <= 4; j++) {
      for (let i = -4; i <= 4; i++) {
        const h = ((i * 47 + j * 83) % 360 + 360) % 360;
        ctx.fillStyle = `hsl(${h},70%,${55 + ((i + j) & 1) * 20}%)`;
        ctx.fillRect(i * s - s / 2 + 0.5, j * s - s / 2 + 0.5, s - 1, s - 1);
      }
    }
  }
}

// ========================================================================= MIDAS
export class MidasBall extends Ball {
  static meta = {
    id: 'midas', color: '#c9a227',
    name: { fr: 'Midas', en: 'Midas' },
    desc: {
      fr: 'Ses pièces changent l\'ennemi en or petit à petit : il ralentit, et à 5 piles il se brise.',
      en: 'Its coins slowly turn the enemy to gold: it slows down, and at 5 stacks it shatters.',
    },
  };
  key() { return 'gold' + this.id; }
  addGold(b) {
    const k = this.key();
    b.tags[k] = (b.tags[k] || 0) + 1;
    if (b.tags[k] >= 5) {
      b.tags[k] = 0;
      this.world.damage(b, 16, this, { color: '#ffe066', big: true });
      this.world.emit('burst', { x: b.x, y: b.y, color: '#ffe066', n: 30 });
      this.world.emit('shake', { amount: 8 });
    } else b.applySlow(3, 1 - 0.1 * b.tags[k]);
  }
  update(dt) {
    if (this.timer('coin', 1.9, dt, 1)) {
      const t = this.target();
      if (!t) return;
      const self = this;
      shoot(this, aim(this, t, 0.2), 520, {
        r: 7, damage: 2, color: '#ffd700', shape: 'orb',
        onHit(b) { Projectile.prototype.onHit.call(this, b); if (!b.dead) self.addGold(b); },
      });
    }
  }
  onContact(o, nx, ny, approaching) {
    if (approaching && !o.summon && this.world.cdReady(`midasc${this.id}-${o.id}`, 1)) this.addGold(o);
  }
  drawOver(ctx) {
    const k = this.key();
    ctx.save();
    for (const b of this.world.balls) {
      const n = b.tags[k];
      if (!n || b.dead) continue;
      ctx.fillStyle = `rgba(255,215,0,${0.12 * n})`;
      circle(ctx, b.x, b.y, b.r); ctx.fill();
    }
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#fff2a8';
    ctx.strokeStyle = '#8a6a00';
    ctx.lineWidth = r * 0.06;
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, r * 0.3); ctx.lineTo(-r * 0.55, -r * 0.35); ctx.lineTo(-r * 0.27, -r * 0.05);
    ctx.lineTo(0, -r * 0.45); ctx.lineTo(r * 0.27, -r * 0.05); ctx.lineTo(r * 0.55, -r * 0.35); ctx.lineTo(r * 0.55, r * 0.3);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
}

// ======================================================================== VOLEUR
export class ThiefBall extends Ball {
  static meta = {
    id: 'thief', color: '#2d2d3a',
    name: { fr: 'Voleur', en: 'Thief' },
    desc: {
      fr: 'Chaque touche vole de la vitesse à l\'ennemi et retarde ses capacités.',
      en: 'Every hit steals the enemy\'s speed and delays its abilities.',
    },
  };
  update(dt) {
    if (this.timer('lunge', 2.4, dt, 1.2)) {
      const t = this.target({ mainOnly: true });
      if (t) this.moveToward(t.x, t.y, 620);
    }
  }
  onContact(o, nx, ny, approaching) {
    if (!approaching || o.summon || !this.world.cdReady(`thief${this.id}-${o.id}`, 0.5)) return;
    o.speedMult = M.max(0.55, o.speedMult - 0.08);
    this.speedMult = M.min(1.6, this.speedMult + 0.08);
    for (const k of Object.keys(o.timers)) if (o.timers[k] > 0) o.timers[k] += 0.6;
    this.world.emit('text', { x: o.x, y: o.y - o.r - 18, text: '$', color: '#ffe066' });
  }
  contactBonus() { return 3; }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#111';
    ctx.fillRect(-r, -r * 0.3, r * 2, r * 0.32);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-r * 0.3, -r * 0.14, r * 0.14, r * 0.09, 0, 0, Math.PI * 2);
    ctx.ellipse(r * 0.3, -r * 0.14, r * 0.14, r * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe066';
    ctx.font = `bold ${r * 0.6}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, r * 0.45);
  }
}

// ====================================================================== AIGUILLE
export class NeedleBall extends Ball {
  static meta = {
    id: 'needle', color: '#c23b5a',
    name: { fr: 'Couturière', en: 'Seamstress' },
    desc: {
      fr: 'Ses aiguilles cousent l\'ennemi. Au 3e point, elle tire le fil d\'un coup sec : il est ramené vers elle et déchiré.',
      en: 'Its needles stitch the enemy. On the 3rd stitch it yanks the thread: the enemy is pulled in and torn.',
    },
  };
  key() { return 'stitch' + this.id; }
  update(dt) {
    if (this.tags.yank > 0) this.tags.yank -= dt;
    if (this.timer('needle', 1.7, dt, 1)) {
      const t = this.target();
      if (!t) return;
      const self = this, k = this.key();
      shoot(this, aim(this, t, 0.08), 780, {
        r: 4, damage: 2, shape: 'spike', color: '#f0f0f0',
        onHit(b) {
          Projectile.prototype.onHit.call(this, b);
          if (b.dead) return;
          b.tags[k] = (b.tags[k] || 0) + 1;
          if (b.tags[k] >= 3) {
            b.tags[k] = 0;
            b.moveToward(self.x, self.y, 720);
            self.tags.yank = 0.35; self.tags.yankTarget = b;
            self.world.damage(b, 13, self, { color: '#ff6b8a', big: true });
          }
        },
      });
    }
  }
  drawOver(ctx) {
    const k = this.key();
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    for (const b of this.world.balls) {
      const n = b.tags[k];
      if (!n || b.dead) continue;
      for (let i = 0; i < n; i++) {
        const x = b.x - 8 + i * 8, y = b.y + b.r * 0.55;
        line(ctx, x - 3, y - 3, x + 3, y + 3); line(ctx, x + 3, y - 3, x - 3, y + 3);
      }
    }
    if (this.tags.yank > 0 && this.tags.yankTarget && !this.tags.yankTarget.dead) {
      ctx.strokeStyle = '#ff6b8a';
      ctx.lineWidth = 3;
      line(ctx, this.x, this.y, this.tags.yankTarget.x, this.tags.yankTarget.y);
    }
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.save();
    ctx.rotate(-0.7);
    ctx.fillStyle = '#e8e8e8';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.75); ctx.lineTo(r * 0.08, r * 0.55); ctx.lineTo(-r * 0.08, r * 0.55); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c23b5a';
    ctx.fillRect(-r * 0.03, r * 0.3, r * 0.06, r * 0.18);
    ctx.restore();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = r * 0.05;
    ctx.beginPath(); ctx.moveTo(r * 0.2, r * 0.3); ctx.quadraticCurveTo(r * 0.7, r * 0.5, r * 0.4, -r * 0.2); ctx.stroke();
  }
}

// ========================================================================= TESLA
export class TeslaBall extends Ball {
  static meta = {
    id: 'tesla', color: '#1b4f8a',
    name: { fr: 'Tesla', en: 'Tesla' },
    desc: {
      fr: 'Électrocute tous les ennemis proches, et l\'arc rebondit d\'un ennemi à l\'autre.',
      en: 'Shocks every nearby enemy, and the arc chains from one enemy to the next.',
    },
  };
  update(dt) {
    if (this.timer('zap', 0.8, dt)) {
      const R = 165;
      const hit = new Set();
      for (const b of this.world.enemiesOf(this)) {
        if (!b.targetable || this.dist(b) > R + b.r) continue;
        hit.add(b);
        this.world.emit('zap', { x1: this.x, y1: this.y, x2: b.x, y2: b.y, color: '#7fd4ff' });
        this.world.damage(b, 3, this, { color: '#bfe9ff' });
      }
      for (const a of [...hit]) {
        for (const b of this.world.enemiesOf(this)) {
          if (hit.has(b) || !b.targetable || M.hypot(a.x - b.x, a.y - b.y) > 150) continue;
          hit.add(b);
          this.world.emit('zap', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, color: '#7fd4ff' });
          this.world.damage(b, 2, this, { color: '#bfe9ff' });
        }
      }
    }
  }
  drawUnder(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(127,212,255,0.12)';
    ctx.lineWidth = 2;
    circle(ctx, this.x, this.y, 165); ctx.stroke();
    if (Math.random() < 0.3) lightning(ctx, this.x, this.y, this.x + (Math.random() - 0.5) * 2 * (this.r + 20), this.y + (Math.random() - 0.5) * 2 * (this.r + 20), '#7fd4ff', 1.5, 8);
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.strokeStyle = '#e0f4ff';
    ctx.lineWidth = r * 0.07;
    for (let i = 0; i < 5; i++) {
      const y = -r * 0.45 + i * r * 0.2;
      ctx.beginPath(); ctx.ellipse(0, y, r * 0.35, r * 0.08, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#e0f4ff';
    circle(ctx, 0, -r * 0.62, r * 0.12); ctx.fill();
  }
}

// ======================================================================= MÉDECIN
export class MedicBall extends Ball {
  static meta = {
    id: 'medic', color: '#e8e8e8',
    name: { fr: 'Médecin', en: 'Medic' },
    desc: {
      fr: 'Émet des ondes de soin pour lui et ses alliés ; les ennemis trop proches sont blessés par l\'onde.',
      en: 'Emits healing pulses for itself and its allies; enemies caught too close get hurt by the pulse.',
    },
  };
  update(dt) {
    if (this.timer('pulse', 2.4, dt, 1.5)) {
      this.world.emit('ring', { x: this.x, y: this.y, r: 130, color: '#7dff9a' });
      for (const a of this.world.alliesOf(this, true)) {
        if (this.dist(a) < 280) this.world.heal(a, a === this ? 3 : 6, this);
      }
      for (const b of this.world.enemiesOf(this)) {
        if (b.targetable && this.dist(b) < 130 + b.r) this.world.damage(b, 5, this, { color: '#7dff9a' });
      }
    }
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#e8322e';
    ctx.fillRect(-r * 0.15, -r * 0.55, r * 0.3, r * 1.1);
    ctx.fillRect(-r * 0.55, -r * 0.15, r * 1.1, r * 0.3);
  }
}

// ========================================================================= GOLEM
export class GolemBall extends Ball {
  static meta = {
    id: 'golem', color: '#7d7468', mass: 2, hp: 110, speed: 240,
    name: { fr: 'Golem', en: 'Golem' },
    desc: {
      fr: 'Se pétrifie : immobile et invulnérable, il blesse ceux qui le percutent, puis éclate en débris.',
      en: 'Turns to stone: still and invulnerable, it hurts anything that rams it, then bursts into debris.',
    },
  };
  update(dt) {
    if (this.tags.stone > 0) {
      this.tags.stone -= dt;
      if (this.tags.stone <= 0) {
        this.immovable = false;
        const base = this.world.rng.angle();
        for (let i = 0; i < 7; i++) {
          shoot(this, base + (i / 7) * M.TAU, 480, { r: 6, damage: 3.5, color: '#a89c8c', shape: 'spike', life: 1.2 });
        }
        this.world.explode(this.x, this.y, this.r + 55, 6, this, { color: '#a89c8c', knock: 380 });
        this.setSpeed(this.cruiseSpeed());
      }
      return;
    }
    if (this.timer('stone', 4.2, dt, 2)) {
      this.tags.stone = 1.6;
      this.st.invuln = 1.6;
      this.st.root = 1.6;
      this.immovable = true;
    }
  }
  onContact(o, nx, ny, approaching) {
    if (this.tags.stone > 0 && approaching && this.world.cdReady(`golem${this.id}-${o.id}`, 0.4)) {
      this.world.damage(o, 8, this, { color: '#d9cfc0' });
    }
  }
  drawIcon(ctx, r) {
    ctx.strokeStyle = 'rgba(30,25,20,0.7)';
    ctx.lineWidth = r * 0.06;
    line(ctx, -r * 0.6, -r * 0.2, -r * 0.1, -r * 0.05);
    line(ctx, -r * 0.1, -r * 0.05, r * 0.05, -r * 0.6);
    line(ctx, -r * 0.1, -r * 0.05, r * 0.2, r * 0.4);
    line(ctx, r * 0.2, r * 0.4, r * 0.65, r * 0.2);
    ctx.fillStyle = '#ffb020';
    ctx.fillRect(-r * 0.4, -r * 0.35, r * 0.2, r * 0.1);
    ctx.fillRect(r * 0.2, -r * 0.35, r * 0.2, r * 0.1);
  }
  drawOver(ctx) {
    if (!(this.tags.stone > 0)) return;
    ctx.save();
    ctx.fillStyle = 'rgba(160,150,140,0.55)';
    circle(ctx, this.x, this.y, this.r); ctx.fill();
    ctx.restore();
  }
}

export const CONTROL = [PainterBall, DiscoBall, MidasBall, ThiefBall, NeedleBall, TeslaBall, MedicBall, GolemBall];
