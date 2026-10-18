/* Combattants de mouvement : Taureau, Téléporteur, Ninja, Kangourou, Ressort, Ancre, Sangsue, Gravité. */
import { Ball } from '../sim/ball.js';
import { Delayed } from '../sim/entities.js';
import * as M from '../sim/dmath.js';
import { circle, line, clampInArena } from './helpers.js';

// ====================================================================== TAUREAU
export class BullBall extends Ball {
  static meta = {
    id: 'bull', color: '#7a3b1e', mass: 1.4,
    name: { fr: 'Taureau', en: 'Bull' },
    desc: {
      fr: 'Gratte le sol, puis charge à toute vitesse : l\'impact est violent, mais il s\'assomme s\'il rate et percute un mur.',
      en: 'Paws the ground, then charges at full speed: brutal impact, but it stuns itself if it misses into a wall.',
    },
  };
  init() { this.tags.phase = 'idle'; this.tags.t = 0; }
  update(dt) {
    const T = this.tags;
    if (T.phase === 'aim') {
      T.t -= dt;
      const tg = this.target({ mainOnly: true });
      if (tg) T.ang = this.angleTo(tg);
      if (T.t <= 0) {
        T.phase = 'charge'; T.t = 0.85;
        this.speedMult = 1; this.noRelax = true;
        this.launch(T.ang, 860);
      }
    } else if (T.phase === 'charge') {
      T.t -= dt;
      if (T.t <= 0 || this.abilityRate === 0) this.endCharge();
    } else if (this.timer('charge', 3.1, dt, 1.5)) {
      T.phase = 'aim'; T.t = 0.55; this.speedMult = 0.12;
    }
  }
  endCharge() { this.tags.phase = 'idle'; this.noRelax = false; }
  onContact(o, nx, ny, approaching) {
    if (this.tags.phase === 'charge' && approaching) {
      o.vx += nx * 650; o.vy += ny * 650;
      this.world.emit('shake', { amount: 9 });
      this.endCharge();
      if (!o.summon) this.tags.gore = 1;
    }
  }
  contactBonus() { if (this.tags.gore) { this.tags.gore = 0; return 13; } return this.tags.phase === 'charge' ? 13 : 0; }
  onWall() {
    if (this.tags.phase === 'charge') {
      this.endCharge();
      this.stun(0.55);
      this.world.emit('burst', { x: this.x, y: this.y, color: '#d9b38c', n: 12 });
    }
  }
  drawUnder(ctx) {
    if (this.tags.phase !== 'aim') return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,80,40,0.6)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    line(ctx, this.x, this.y, this.x + Math.cos(this.tags.ang) * 140, this.y + Math.sin(this.tags.ang) * 140);
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#f2e6d0';
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, -r * 0.1); ctx.quadraticCurveTo(-r * 0.8, -r * 0.2, -r * 0.75, -r * 0.75);
    ctx.quadraticCurveTo(-r * 0.55, -r * 0.35, -r * 0.15, -r * 0.35);
    ctx.moveTo(r * 0.3, -r * 0.1); ctx.quadraticCurveTo(r * 0.8, -r * 0.2, r * 0.75, -r * 0.75);
    ctx.quadraticCurveTo(r * 0.55, -r * 0.35, r * 0.15, -r * 0.35);
    ctx.fill();
    ctx.strokeStyle = '#ffd04a';
    ctx.lineWidth = r * 0.08;
    ctx.beginPath(); ctx.arc(0, r * 0.35, r * 0.18, 0, Math.PI * 2); ctx.stroke();
  }
}

// ================================================================== TÉLÉPORTEUR
export class BlinkBall extends Ball {
  static meta = {
    id: 'blink', color: '#4b2bd6',
    name: { fr: 'Téléporteur', en: 'Blinker' },
    desc: {
      fr: 'Se téléporte dans le dos de l\'ennemi et frappe aussitôt.',
      en: 'Teleports behind the enemy and strikes instantly.',
    },
  };
  update(dt) {
    if (this.timer('blink', 2.7, dt, 1.5)) {
      const t = this.target();
      if (!t) return;
      const n = M.normalize(t.vx, t.vy);
      const d = t.r + this.r + 4;
      const p = clampInArena(this.world, t.x - n.x * d, t.y - n.y * d, this.r);
      this.world.emit('blink', { x1: this.x, y1: this.y, x2: p.x, y2: p.y, color: '#a08cff', r: this.r });
      this.x = p.x; this.y = p.y;
      this.moveToward(t.x, t.y, this.cruiseSpeed());
      this.world.damage(t, 7, this, { color: '#c8bcff' });
      t.vx += n.x * 250; t.vy += n.y * 250;
    }
  }
  drawIcon(ctx, r) {
    ctx.strokeStyle = '#e0d8ff';
    ctx.lineWidth = r * 0.07;
    ctx.setLineDash([r * 0.15, r * 0.1]);
    circle(ctx, -r * 0.3, 0, r * 0.28); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#e0d8ff';
    circle(ctx, r * 0.35, 0, r * 0.28); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-r * 0.02, -r * 0.12); ctx.lineTo(r * 0.06, 0); ctx.lineTo(-r * 0.02, r * 0.12); ctx.stroke();
  }
}

// ======================================================================== NINJA
export class NinjaBall extends Ball {
  static meta = {
    id: 'ninja', color: '#222831',
    name: { fr: 'Ninja', en: 'Ninja' },
    desc: {
      fr: 'Traverse l\'ennemi d\'un trait invisible… la coupure explose un instant plus tard.',
      en: 'Dashes clean through the enemy… the slash explodes a moment later.',
    },
  };
  init() { this.tags.dash = 0; }
  update(dt) {
    if (this.tags.dash > 0) {
      this.tags.dash -= dt;
      if (this.tags.dash <= 0) { this.noRelax = false; this.setSpeed(this.cruiseSpeed()); }
      return;
    }
    if (this.timer('dash', 2.6, dt, 1.4)) {
      const t = this.target();
      if (!t) return;
      const n = M.normalize(t.x - this.x, t.y - this.y);
      const len = n.d + 110;
      const end = clampInArena(this.world, this.x + n.x * len, this.y + n.y * len, this.r);
      const x1 = this.x, y1 = this.y;
      const dur = M.max(0.08, M.hypot(end.x - x1, end.y - y1) / 1300);
      this.tags.dash = dur;
      this.st.intangible = dur;
      this.noRelax = true;
      this.vx = (end.x - x1) / dur; this.vy = (end.y - y1) / dur;
      const w = this.world;
      w.spawn(new Delayed(w, this, dur + 0.4, () => {
        if (this.dead) return;
        w.emit('slash', { x1, y1, x2: end.x, y2: end.y });
        for (const b of w.enemiesOf(this)) {
          if (b.targetable && M.distToSegment(b.x, b.y, x1, y1, end.x, end.y) < b.r + 14) {
            w.damage(b, 15, this, { color: '#ffffff', big: true });
          }
        }
      }, (ctx, p) => {
        ctx.save();
        ctx.strokeStyle = `rgba(255,255,255,${0.3 + 0.6 * p})`;
        ctx.lineWidth = 1 + 4 * p;
        line(ctx, x1, y1, end.x, end.y);
        ctx.restore();
      }));
    }
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(-r, -r * 0.3, r * 2, r * 0.28);
    ctx.fillStyle = '#f5f5f5';
    ctx.beginPath();
    ctx.ellipse(-r * 0.28, -r * 0.16, r * 0.14, r * 0.07, 0.2, 0, Math.PI * 2);
    ctx.ellipse(r * 0.28, -r * 0.16, r * 0.14, r * 0.07, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ==================================================================== KANGOUROU
export class KangarooBall extends Ball {
  static meta = {
    id: 'kangaroo', color: '#c47a3a',
    name: { fr: 'Kangourou', en: 'Kangaroo' },
    desc: {
      fr: 'Bondit dans les airs (intouchable) et retombe sur l\'ennemi avec une onde de choc.',
      en: 'Leaps into the air (untouchable) and crashes down on the enemy with a shockwave.',
    },
  };
  init() { this.tags.air = 0; }
  update(dt) {
    const T = this.tags;
    if (T.air > 0) {
      T.air -= dt;
      this.z = M.sin(M.PI * (1 - T.air / 0.8)) * 34;
      if (T.air <= 0) {
        this.z = 0; this.noRelax = false;
        this.world.explode(this.x, this.y, 85 * this.scale + 15, 10, this, { color: '#d9b38c', knock: 460 });
        this.world.emit('shake', { amount: 8 });
        this.setSpeed(this.cruiseSpeed());
      }
      return;
    }
    if (this.timer('jump', 3, dt, 1.6)) {
      const t = this.target({ mainOnly: true });
      if (!t) return;
      const px = t.x + t.vx * 0.8, py = t.y + t.vy * 0.8;
      const p = clampInArena(this.world, px, py, this.r);
      T.air = 0.8;
      this.st.intangible = 0.8;
      this.noRelax = true;
      this.vx = (p.x - this.x) / 0.8; this.vy = (p.y - this.y) / 0.8;
    }
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#ffe2c0';
    ctx.beginPath();
    ctx.ellipse(-r * 0.25, -r * 0.45, r * 0.12, r * 0.3, -0.3, 0, Math.PI * 2);
    ctx.ellipse(r * 0.25, -r * 0.45, r * 0.12, r * 0.3, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a2210';
    ctx.beginPath(); ctx.ellipse(0, r * 0.25, r * 0.16, r * 0.11, 0, 0, Math.PI * 2); ctx.fill();
  }
}

// ====================================================================== RESSORT
export class SpringBall extends Ball {
  static meta = {
    id: 'spring', color: '#2bb673',
    name: { fr: 'Ressort', en: 'Spring' },
    desc: {
      fr: 'Accélère à chaque rebond sur un mur. Plus il va vite, plus le choc fait mal.',
      en: 'Speeds up with every wall bounce. The faster it goes, the harder it hits.',
    },
  };
  init() { this.tags.boost = 1; }
  speedFactor() { return this.tags.boost || 1; }
  onWall() { if (this.abilityRate > 0) this.tags.boost = M.min(2.7, this.tags.boost * 1.14); }
  contactBonus() {
    const b = (this.tags.boost - 1) * 10;
    this.tags.boost = 1;
    return b;
  }
  drawUnder(ctx) {
    if (this.tags.boost < 1.4) return;
    ctx.save();
    ctx.globalAlpha = Math.min(0.5, (this.tags.boost - 1.3) / 2);
    ctx.fillStyle = '#7dffb8';
    for (let i = 1; i <= 4; i++) {
      circle(ctx, this.x - this.vx * 0.018 * i, this.y - this.vy * 0.018 * i, this.r * (1 - i * 0.15));
      ctx.fill();
    }
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.strokeStyle = '#e8fff2';
    ctx.lineWidth = r * 0.09;
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const y = -r * 0.6 + i * r * 0.24;
      ctx.lineTo(i % 2 ? r * 0.4 : -r * 0.4, y);
    }
    ctx.stroke();
  }
}

// ======================================================================== ANCRE
export class AnchorBall extends Ball {
  static meta = {
    id: 'anchor', color: '#24435e', mass: 1.3,
    name: { fr: 'Ancre', en: 'Anchor' },
    desc: {
      fr: 'Jette l\'ancre et tournoie autour : la chaîne balaie tout ce qu\'elle touche.',
      en: 'Drops anchor and swings around it: the chain sweeps everything it touches.',
    },
  };
  init() { this.tags.swing = 0; }
  update(dt) {
    const T = this.tags;
    if (T.swing > 0) {
      T.swing -= dt;
      const dx = this.x - T.ax, dy = this.y - T.ay;
      const d = M.hypot(dx, dy) || 1;
      const sp = 520;
      // vitesse tangentielle + correction radiale pour rester sur le cercle
      this.vx = (-dy / d) * sp * T.dir + (dx / d) * (T.R - d) * 8;
      this.vy = (dx / d) * sp * T.dir + (dy / d) * (T.R - d) * 8;
      for (const b of this.world.enemiesOf(this)) {
        if (b.targetable && M.distToSegment(b.x, b.y, T.ax, T.ay, this.x, this.y) < b.r + 12 &&
          this.world.cdReady(`anc${this.id}-${b.id}`, 0.5)) {
          this.world.damage(b, 7, this, { color: '#b8c8d8' });
          const n = M.normalize(b.x - T.ax, b.y - T.ay);
          b.vx += n.x * 300; b.vy += n.y * 300;
        }
      }
      if (T.swing <= 0) this.noRelax = false;
      return;
    }
    if (this.timer('anchor', 3.2, dt, 1.5)) {
      const S = this.world.size;
      const t = this.target();
      const n = t ? M.normalize(t.x - this.x, t.y - this.y) : M.normalize(S / 2 - this.x, S / 2 - this.y);
      T.R = M.min(150, M.max(70, n.d * 0.55));
      const p = clampInArena(this.world, this.x + n.x * T.R, this.y + n.y * T.R, 40);
      T.ax = p.x; T.ay = p.y; T.R = M.hypot(p.x - this.x, p.y - this.y);
      T.dir = this.world.rng.sign();
      T.swing = 1.7;
      this.noRelax = true;
      this.world.emit('spark', { x: T.ax, y: T.ay, color: '#b8c8d8' });
    }
  }
  drawUnder(ctx) {
    const T = this.tags;
    if (!(T.swing > 0)) return;
    ctx.save();
    ctx.strokeStyle = '#9fb3c8';
    ctx.lineWidth = 4;
    ctx.setLineDash([7, 4]);
    line(ctx, T.ax, T.ay, this.x, this.y);
    ctx.setLineDash([]);
    ctx.fillStyle = '#6c7f93';
    circle(ctx, T.ax, T.ay, 9); ctx.fill();
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.strokeStyle = '#e6eef5';
    ctx.lineWidth = r * 0.09;
    ctx.lineCap = 'round';
    circle(ctx, 0, -r * 0.55, r * 0.13); ctx.stroke();
    line(ctx, 0, -r * 0.42, 0, r * 0.55);
    line(ctx, -r * 0.3, -r * 0.2, r * 0.3, -r * 0.2);
    ctx.beginPath(); ctx.arc(0, r * 0.1, r * 0.45, 0.3, Math.PI - 0.3); ctx.stroke();
  }
}

// ====================================================================== SANGSUE
export class LeechBall extends Ball {
  static meta = {
    id: 'leech', color: '#4a6b2a',
    name: { fr: 'Sangsue', en: 'Leech' },
    desc: {
      fr: 'S\'accroche à l\'ennemi et aspire sa vie jusqu\'à ce qu\'un choc contre un mur la décroche.',
      en: 'Latches onto the enemy and drains its life until a wall impact shakes it off.',
    },
  };
  init() { this.tags.host = null; }
  update(dt) {
    const T = this.tags, h = T.host;
    if (!h) return;
    T.t -= dt;
    if (h.dead || T.t <= 0 || h.st.intangible > 0 || (h.lastWall !== undefined && h.lastWall > T.since + 0.05) || this.abilityRate === 0) {
      this.detach();
      return;
    }
    const d = h.r + this.r - 6;
    this.x = h.x + M.cos(T.ang) * d; this.y = h.y + M.sin(T.ang) * d;
    this.vx = h.vx; this.vy = h.vy;
    if (this.world.cdReady(`leech${this.id}`, 0.25)) {
      const a = this.world.damage(h, 1.5, this, { kind: 'dot', color: '#c7ff6b' });
      this.world.heal(this, a, null);
    }
  }
  detach() {
    const h = this.tags.host;
    this.tags.host = null;
    this.tags.attachedTo = null;
    this.noRelax = false;
    this.timers.latch = 2.5;
    if (h) { const n = M.normalize(this.x - h.x, this.y - h.y); this.vx = n.x * 400; this.vy = n.y * 400; }
  }
  onContact(o, nx, ny, approaching) {
    if (this.tags.host || o.summon || this.abilityRate === 0) return;
    if (this.timers.latch > 0) return;
    this.tags.host = o; this.tags.attachedTo = o;
    this.tags.t = 2.6; this.tags.since = this.world.time;
    this.tags.ang = M.atan2(-ny, -nx);
    this.noRelax = true;
    this.world.emit('burst', { x: this.x, y: this.y, color: '#c7ff6b', n: 10 });
  }
  physics(dt) {
    if (this.timers.latch > 0) this.timers.latch -= dt;
    super.physics(dt);
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#2a1a10';
    circle(ctx, 0, 0, r * 0.42); ctx.fill();
    ctx.fillStyle = '#f0f0e0';
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42);
      ctx.lineTo(Math.cos(a + 0.18) * r * 0.25, Math.sin(a + 0.18) * r * 0.25);
      ctx.lineTo(Math.cos(a + 0.35) * r * 0.42, Math.sin(a + 0.35) * r * 0.42);
      ctx.fill();
    }
  }
}

// ====================================================================== GRAVITÉ
export class GravityBall extends Ball {
  static meta = {
    id: 'gravity', color: '#5b3a8c',
    name: { fr: 'Gravité', en: 'Gravity' },
    desc: {
      fr: 'Alourdit l\'ennemi et le projette contre un mur : l\'impact fait d\'autant plus mal qu\'il va vite.',
      en: 'Makes the enemy heavy and hurls it into a wall: the faster the impact, the bigger the damage.',
    },
  };
  update(dt) {
    if (this.timer('grav', 3.3, dt, 1.5)) {
      const t = this.target();
      if (!t) return;
      const n = M.normalize(t.x - this.x, t.y - this.y);
      t.vx = n.x * 780; t.vy = n.y * 780;
      t.slam(1.4, 0.015, this);
      this.world.emit('ring', { x: t.x, y: t.y, r: t.r + 18, color: '#c9a0ff' });
    }
  }
  drawOver(ctx) {
    ctx.save();
    ctx.strokeStyle = '#c9a0ff';
    ctx.lineWidth = 2.5;
    for (const b of this.world.balls) {
      if (!(b.st.slam > 0) || b.st.slamSrc !== this || b.dead) continue;
      const n = Math.hypot(b.vx, b.vy) || 1;
      for (let i = 0; i < 3; i++) {
        const o = (i - 1) * 10;
        const px = -b.vy / n * o, py = b.vx / n * o;
        line(ctx, b.x + px - b.vx / n * b.r * 1.2, b.y + py - b.vy / n * b.r * 1.2, b.x + px - b.vx / n * b.r * 2.2, b.y + py - b.vy / n * b.r * 2.2);
      }
    }
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#efe4ff';
    ctx.beginPath();
    ctx.moveTo(-r * 0.35, -r * 0.6); ctx.lineTo(r * 0.35, -r * 0.6); ctx.lineTo(r * 0.35, r * 0.05);
    ctx.lineTo(r * 0.6, r * 0.05); ctx.lineTo(0, r * 0.7); ctx.lineTo(-r * 0.6, r * 0.05); ctx.lineTo(-r * 0.35, r * 0.05);
    ctx.closePath();
    ctx.fill();
  }
}

export const MOVEMENT = [BullBall, BlinkBall, NinjaBall, KangarooBall, SpringBall, AnchorBall, LeechBall, GravityBall];
