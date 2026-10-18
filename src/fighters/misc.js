/* Divers : Laser, Bouclier, Porc-épic, Cristal, Bâtisseur, Boxeur, Diamant, Onde de choc. */
import { Ball } from '../sim/ball.js';
import { Entity, Projectile } from '../sim/entities.js';
import * as M from '../sim/dmath.js';
import { shoot, aim, pointOnWall, circle, line, clampInArena } from './helpers.js';

// ======================================================================== LASER
export class LaserBall extends Ball {
  static meta = {
    id: 'laser', color: '#d6213b',
    name: { fr: 'Laser', en: 'Laser' },
    desc: {
      fr: 'Un rayon continu tourne autour de lui et balaie l\'arène jusqu\'au mur, puis refroidit.',
      en: 'A continuous beam sweeps around it all the way to the wall, then cools down.',
    },
  };
  init() { this.tags.ang = this.world.rng.angle(); this.tags.dir = this.world.rng.sign(); this.tags.on = 0; }
  update(dt) {
    const T = this.tags;
    if (T.on > 0) {
      T.on -= dt;
      T.ang += 1.5 * T.dir * dt * (this.abilityRate || 0);
      if (this.abilityRate === 0) { T.on = 0; return; }
      const r = this.world.ray(this.x, this.y, T.ang, this.team, 3);
      T.x2 = r.x2; T.y2 = r.y2;
      for (const b of r.hits) {
        if (this.world.cdReady(`laser${this.id}-${b.id}`, 0.2)) this.world.damage(b, 3, this, { kind: 'dot', color: '#ff6070' });
      }
    } else if (this.timer('fire', 3.5, dt, 1.2)) {
      T.on = 2.2;
      const t = this.target();
      if (t) T.ang = this.angleTo(t) - T.dir * 0.8;
    }
  }
  drawUnder(ctx) {
    const T = this.tags;
    if (!(T.on > 0) || T.x2 === undefined) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,40,70,0.35)';
    ctx.lineWidth = 14;
    line(ctx, this.x, this.y, T.x2, T.y2);
    ctx.strokeStyle = '#ffd0d6';
    ctx.lineWidth = 4;
    line(ctx, this.x, this.y, T.x2, T.y2);
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#ffe0e4';
    circle(ctx, 0, 0, r * 0.3); ctx.fill();
    ctx.strokeStyle = '#ffe0e4';
    ctx.lineWidth = r * 0.1;
    line(ctx, r * 0.3, 0, r, 0);
    ctx.strokeStyle = 'rgba(255,224,228,0.5)';
    ctx.lineWidth = r * 0.05;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.5; line(ctx, Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4, Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6); }
  }
}

// ===================================================================== BOUCLIER
export class ShieldBall extends Ball {
  static meta = {
    id: 'shield', color: '#2f5d8a', mass: 1.3,
    name: { fr: 'Bouclier', en: 'Shield' },
    desc: {
      fr: 'Son bouclier pivote vers l\'ennemi et bloque presque tout ce qui arrive de face. Coup de bouclier au contact.',
      en: 'Its shield turns toward the enemy and blocks almost everything from the front. Shield bash on contact.',
    },
  };
  init() { this.tags.face = this.world.rng.angle(); }
  update(dt) {
    const t = this.target();
    if (t && this.abilityRate > 0) {
      const d = M.angleDiff(this.tags.face, this.angleTo(t));
      this.tags.face += M.clamp(d, -2.4 * dt, 2.4 * dt);
    }
  }
  inFront(x, y) { return M.abs(M.angleDiff(this.tags.face, M.atan2(y - this.y, x - this.x))) < 1.05; }
  modifyIncoming(a, src, o) {
    if (o.kind === 'dot' || this.abilityRate === 0) return a;
    const x = o.x ?? (src ? src.x : this.x), y = o.y ?? (src ? src.y : this.y);
    if ((x !== this.x || y !== this.y) && this.inFront(x, y)) {
      this.world.emit('block', { x, y });
      return a * 0.15;
    }
    return a;
  }
  onContact(o, nx, ny, approaching) {
    if (approaching && this.inFront(o.x, o.y) && this.world.cdReady(`bash${this.id}-${o.id}`, 0.6)) {
      o.vx += nx * 480; o.vy += ny * 480;
      this.world.damage(o, 5, this, { color: '#cfe6ff' });
    }
  }
  drawOver(ctx) {
    ctx.save();
    ctx.strokeStyle = '#d8ecff';
    ctx.lineWidth = 7 * this.scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r + 7, this.tags.face - 1.05, this.tags.face + 1.05);
    ctx.stroke();
    ctx.strokeStyle = '#4a8fd8';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#d8ecff';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.6); ctx.lineTo(r * 0.5, -r * 0.4); ctx.quadraticCurveTo(r * 0.45, r * 0.35, 0, r * 0.65);
    ctx.quadraticCurveTo(-r * 0.45, r * 0.35, -r * 0.5, -r * 0.4); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2f5d8a';
    ctx.fillRect(-r * 0.06, -r * 0.4, r * 0.12, r * 0.8);
  }
}

// ==================================================================== PORC-ÉPIC
export class PorcupineBall extends Ball {
  static meta = {
    id: 'porcupine', color: '#6b5640',
    name: { fr: 'Porc-épic', en: 'Porcupine' },
    desc: {
      fr: 'Quand on le frappe, il riposte en projetant ses piquants dans toutes les directions.',
      en: 'When hit, it retaliates by firing its quills in every direction.',
    },
  };
  onDamaged(a, src, o) {
    if (o.kind === 'dot' || this.dead || this.abilityRate === 0) return;
    if (!this.world.cdReady(`quills${this.id}`, 0.55)) return;
    const base = this.world.rng.angle();
    for (let i = 0; i < 9; i++) shoot(this, base + (i / 9) * M.TAU, 540, { r: 5, damage: 3, shape: 'spike', color: '#f0e0c8', life: 1.4 });
  }
  update(dt) {
    // piquants « au repos » : tir automatique lent pour ne pas rester passif
    if (this.timer('idle', 3.5, dt, 2)) {
      const t = this.target();
      if (t) for (const da of [-0.2, 0.2]) shoot(this, aim(this, t) + da, 540, { r: 5, damage: 3, shape: 'spike', color: '#f0e0c8', life: 1.4 });
    }
  }
  drawIcon(ctx, r) {
    ctx.strokeStyle = '#f0e0c8';
    ctx.lineWidth = r * 0.06;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      line(ctx, Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.35, Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
    }
    ctx.fillStyle = '#3a2a1a';
    circle(ctx, 0, 0, r * 0.32); ctx.fill();
  }
}

// ====================================================================== CRISTAL
class Crystal extends Entity {
  constructor(world, owner, p) {
    super(world, owner);
    this.x = p.x + p.nx * 8; this.y = p.y + p.ny * 8;
    this.nx = p.nx; this.ny = p.ny;
    this.diesWithOwner = true;
  }
  update(dt) {
    this.age += dt;
    if (this.age < 0.5) return;
    for (const b of this.world.balls) {
      if (b.dead || b.st.intangible > 0) continue;
      if (M.hypot(b.x - this.x, b.y - this.y) < b.r + 16) { this.shatter(); return; }
    }
  }
  shatter() {
    this.kill();
    const o = this.owner;
    const t = this.world.nearestEnemyOfTeam(this.team, this.x, this.y);
    const base = t ? M.atan2(t.y - this.y, t.x - this.x) : M.atan2(this.ny, this.nx);
    for (let i = 0; i < 5; i++) {
      const a = base + (i - 2) * 0.18;
      this.world.spawn(new Projectile(this.world, o, {
        x: this.x, y: this.y, vx: M.cos(a) * 640, vy: M.sin(a) * 640, r: 5, damage: 3, shape: 'spike', color: '#c8f4ff',
      }));
    }
    this.world.emit('burst', { x: this.x, y: this.y, color: '#c8f4ff', n: 14 });
  }
  draw(ctx) {
    const g = Math.min(1, this.age / 0.5);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(Math.atan2(this.ny, this.nx) + Math.PI / 2);
    ctx.fillStyle = 'rgba(180,240,255,0.85)';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    for (const [dx, h] of [[-7, 18], [0, 26], [7, 16]]) {
      ctx.beginPath();
      ctx.moveTo(dx - 4, 6); ctx.lineTo(dx, 6 - h * g); ctx.lineTo(dx + 4, 6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
}
export class CrystalBall extends Ball {
  static meta = {
    id: 'crystal', color: '#4fc3d9',
    name: { fr: 'Cristal', en: 'Crystal' },
    desc: {
      fr: 'Fait pousser des cristaux sur les murs ; quiconque les heurte les fait éclater en éclats tirés vers l\'ennemi.',
      en: 'Grows crystals on the walls; anyone bumping into one shatters it into shards fired at the enemy.',
    },
  };
  update(dt) {
    if (this.timer('grow', 2.2, dt, 0.8)) {
      const mine = this.world.entities.filter(e => e instanceof Crystal && e.owner === this);
      if (mine.length >= 5) mine[0].kill();
      this.world.spawn(new Crystal(this.world, this, pointOnWall(this.world)));
    }
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#e8fbff';
    ctx.strokeStyle = '#1a6f80';
    ctx.lineWidth = r * 0.04;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.7); ctx.lineTo(r * 0.4, -r * 0.1); ctx.lineTo(0, r * 0.7); ctx.lineTo(-r * 0.4, -r * 0.1); ctx.closePath();
    ctx.fill(); ctx.stroke();
    line(ctx, -r * 0.4, -r * 0.1, r * 0.4, -r * 0.1);
    line(ctx, 0, -r * 0.7, 0, r * 0.7);
  }
}

// ==================================================================== BÂTISSEUR
class BuiltWall extends Entity {
  constructor(world, owner, x1, y1, x2, y2) {
    super(world, owner);
    this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2;
    this.life = 5;
    this.diesWithOwner = true;
  }
  update(dt) {
    this.age += dt;
    if (this.age >= this.life) { this.kill(); return; }
    for (const b of this.world.balls) {
      if (b.dead || b.team === this.team || b.st.intangible > 0) continue;
      const c = M.closestOnSegment(b.x, b.y, this.x1, this.y1, this.x2, this.y2);
      const n = M.normalize(b.x - c.x, b.y - c.y);
      const rr = b.r + 5;
      if (n.d >= rr) continue;
      b.x = c.x + n.x * rr; b.y = c.y + n.y * rr;
      const vn = b.vx * n.x + b.vy * n.y;
      if (vn < 0) {
        b.vx -= 2 * vn * n.x; b.vy -= 2 * vn * n.y;
        if (this.world.cdReady(`bwall${this.owner.id}-${b.id}`, 0.4)) {
          this.world.damage(b, 4, this.owner, { x: c.x, y: c.y, color: '#ffcf8a' });
        }
      }
    }
  }
  draw(ctx) {
    const k = Math.min(1, this.age / 0.2, (this.life - this.age) / 0.4);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#5a3a1a';
    ctx.lineWidth = 12;
    line(ctx, this.x1, this.y1, this.x2, this.y2);
    ctx.strokeStyle = '#d98b4a';
    ctx.lineWidth = 8;
    ctx.setLineDash([14, 3]);
    line(ctx, this.x1, this.y1, this.x2, this.y2);
    ctx.restore();
  }
}
export class BuilderBall extends Ball {
  static meta = {
    id: 'builder', color: '#c46a1a',
    name: { fr: 'Bâtisseur', en: 'Builder' },
    desc: {
      fr: 'Construit des murets dans l\'arène : les ennemis s\'y cognent et s\'y blessent, lui passe au travers.',
      en: 'Builds walls inside the arena: enemies crash and get hurt on them, it passes right through.',
    },
  };
  update(dt) {
    if (this.timer('build', 2.4, dt, 1)) {
      const t = this.target({ mainOnly: true });
      if (!t) return;
      // muret placé en travers de la trajectoire de l'ennemi
      const n = M.normalize(t.vx, t.vy);
      const c = clampInArena(this.world, t.x + n.x * 110, t.y + n.y * 110, 30);
      const L = 65;
      const mine = this.world.entities.filter(e => e instanceof BuiltWall && e.owner === this);
      if (mine.length >= 3) mine[0].kill();
      this.world.spawn(new BuiltWall(this.world, this, c.x - n.y * L, c.y + n.x * L, c.x + n.y * L, c.y - n.x * L));
    }
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#ffe0b8';
    for (let row = 0; row < 3; row++) {
      for (let i = -2; i <= 2; i++) {
        const x = i * r * 0.32 + (row % 2) * r * 0.16, y = -r * 0.3 + row * r * 0.24;
        ctx.fillRect(x - r * 0.14, y, r * 0.28, r * 0.18);
      }
    }
  }
}

// ======================================================================= BOXEUR
export class BoxerBall extends Ball {
  static meta = {
    id: 'boxer', color: '#c0392b',
    name: { fr: 'Boxeur', en: 'Boxer' },
    desc: {
      fr: 'Envoie des directs quand l\'ennemi est à portée. Le 3e coup est un uppercut qui assomme.',
      en: 'Throws jabs when the enemy is in range. Every 3rd punch is a stunning uppercut.',
    },
  };
  init() { this.tags.p = 0; this.tags.n = 0; }
  update(dt) {
    const T = this.tags;
    if (T.p > 0) {
      T.p -= dt;
      const prog = 1 - T.p / 0.22;
      T.ext = M.sin(M.PI * prog) * 95 * this.scale;
      if (!T.landed) {
        const fx = this.x + M.cos(T.ang) * (this.r + T.ext), fy = this.y + M.sin(T.ang) * (this.r + T.ext);
        for (const b of this.world.enemiesOf(this)) {
          if (b.targetable && M.hypot(b.x - fx, b.y - fy) < b.r + 13) {
            T.landed = true;
            T.n++;
            const upper = T.n % 3 === 0;
            this.world.damage(b, upper ? 9 : 5, this, { x: fx, y: fy, color: '#ffffff', big: upper });
            b.vx += M.cos(T.ang) * (upper ? 520 : 320); b.vy += M.sin(T.ang) * (upper ? 520 : 320);
            if (upper) { b.stun(0.6); this.world.emit('shake', { amount: 8 }); }
            break;
          }
        }
      }
      if (T.p <= 0) T.ext = 0;
      return;
    }
    if (this.abilityRate === 0) return;
    this.timers.punch = (this.timers.punch ?? 0) - dt;
    if (this.timers.punch > 0) return;
    const t = this.target();
    if (t && this.dist(t) < this.r + t.r + 95 * this.scale) {
      T.p = 0.22; T.ang = this.angleTo(t); T.landed = false;
      this.timers.punch = 0.75;
    }
  }
  drawOver(ctx) {
    const T = this.tags;
    const ext = T.ext || 0;
    const a = T.ang ?? 0;
    ctx.save();
    for (const side of [-1, 1]) {
      const off = side * this.r * 0.55;
      const e = side === 1 ? ext : 0;
      const bx = this.x + Math.cos(a) * (this.r * 0.75 + e) - Math.sin(a) * off;
      const by = this.y + Math.sin(a) * (this.r * 0.75 + e) + Math.cos(a) * off;
      ctx.fillStyle = '#e8322e';
      ctx.strokeStyle = '#3a0a08';
      ctx.lineWidth = 2;
      circle(ctx, bx, by, 12 * this.scale); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${r * 0.9}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('K.O', 0, r * 0.05);
  }
}

// ====================================================================== DIAMANT
export class DiamondBall extends Ball {
  static meta = {
    id: 'diamond', color: '#9fe8ff', mass: 1.3,
    name: { fr: 'Diamant', en: 'Diamond' },
    desc: {
      fr: 'Une armure qui retire 2,5 dégâts à chaque coup reçu. Ses tirs de prisme se divisent en trois sur les murs.',
      en: 'Armour that shaves 2.5 damage off every hit taken. Its prism shots split in three on walls.',
    },
  };
  modifyIncoming(a, src, o) {
    if (o.kind === 'dot') return a * 0.7;
    return M.max(a * 0.2, a - 2.5);
  }
  update(dt) {
    if (this.timer('prism', 2.4, dt, 1.2)) {
      const t = this.target();
      if (!t) return;
      const self = this;
      shoot(this, aim(this, t, 0.6), 560, {
        r: 6, damage: 4, color: '#e0faff', shape: 'star',
        onWall() {
          const base = M.atan2(-this.vy, -this.vx);
          const tt = self.world.nearestEnemyOfTeam(this.team, this.x, this.y);
          const a0 = tt ? M.atan2(tt.y - this.y, tt.x - this.x) : base;
          for (const da of [-0.25, 0, 0.25]) {
            self.world.spawn(new Projectile(self.world, self, {
              x: this.x, y: this.y, vx: M.cos(a0 + da) * 600, vy: M.sin(a0 + da) * 600, r: 4, damage: 3, color: '#bff4ff', shape: 'spike', life: 1.5,
            }));
          }
        },
      });
    }
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.strokeStyle = '#2a7a90';
    ctx.lineWidth = r * 0.04;
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, -r * 0.2); ctx.lineTo(-r * 0.3, -r * 0.5); ctx.lineTo(r * 0.3, -r * 0.5); ctx.lineTo(r * 0.55, -r * 0.2); ctx.lineTo(0, r * 0.6);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    line(ctx, -r * 0.55, -r * 0.2, r * 0.55, -r * 0.2);
    line(ctx, -r * 0.15, -r * 0.2, 0, r * 0.6); line(ctx, r * 0.15, -r * 0.2, 0, r * 0.6);
  }
}

// ================================================================ ONDE DE CHOC
class ShockRing extends Entity {
  constructor(world, owner, x, y) {
    super(world, owner);
    this.layer = 'floor';
    this.x = x; this.y = y;
    this.R = 0;
    this.max = 280;
    this.hitSet = new Set();
    this.diesWithOwner = true;
  }
  update(dt) {
    this.R += 400 * dt;
    if (this.R > this.max) { this.kill(); return; }
    for (const b of this.world.balls) {
      if (b.team === this.team || !b.targetable || this.hitSet.has(b.id)) continue;
      const d = M.hypot(b.x - this.x, b.y - this.y);
      if (M.abs(d - this.R) < b.r) {
        this.hitSet.add(b.id);
        this.world.damage(b, 6, this.owner, { color: '#ffe8b0' });
        const n = M.normalize(b.x - this.x, b.y - this.y);
        b.vx += n.x * 330; b.vy += n.y * 330;
      }
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = 1 - this.R / this.max;
    ctx.strokeStyle = '#ffe8b0';
    ctx.lineWidth = 5;
    circle(ctx, this.x, this.y, this.R); ctx.stroke();
    ctx.restore();
  }
}
export class ShockwaveBall extends Ball {
  static meta = {
    id: 'shockwave', color: '#d4a24c',
    name: { fr: 'Onde de choc', en: 'Shockwave' },
    desc: {
      fr: 'Chaque rebond sur un mur déclenche une onde circulaire qui blesse et repousse.',
      en: 'Every wall bounce triggers a circular shockwave that hurts and pushes back.',
    },
  };
  onWall(nx, ny) {
    if (this.abilityRate === 0 || !this.world.cdReady(`sw${this.id}`, 0.35)) return;
    this.world.spawn(new ShockRing(this.world, this, this.x - nx * this.r, this.y - ny * this.r));
  }
  drawIcon(ctx, r) {
    ctx.strokeStyle = '#fff3d6';
    ctx.lineWidth = r * 0.08;
    for (let i = 1; i <= 3; i++) { circle(ctx, 0, r * 0.5, r * 0.28 * i); ctx.stroke(); }
  }
}

export const MISC = [LaserBall, ShieldBall, PorcupineBall, CrystalBall, BuilderBall, BoxerBall, DiamondBall, ShockwaveBall];
