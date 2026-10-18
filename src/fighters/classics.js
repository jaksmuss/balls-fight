/* Combattants « classiques » : Toile, Marteau, Vampire, Mineur, Fantôme, Miroir, Aimant, Givre. */
import { Ball } from '../sim/ball.js';
import { Entity, Delayed } from '../sim/entities.js';
import * as M from '../sim/dmath.js';
import { pointOnWall, circle, line, rgba } from './helpers.js';

// ======================================================================= TOILE
export class WebBall extends Ball {
  static meta = {
    id: 'web', color: '#8e1a1a',
    name: { fr: 'Toile', en: 'Web' },
    desc: {
      fr: 'Lance un fil : sur un mur il sert de grappin, sur un ennemi il le ralentit fortement.',
      en: 'Shoots a thread: on a wall it grapples, on an enemy it heavily slows it.',
    },
  };
  init() { this.thread = null; }
  update(dt) {
    if (!this.thread) {
      if (this.timer('fire', 2, dt, 1)) this.fire();
      return;
    }
    const th = this.thread, w = this.world, S = w.size;
    if (th.phase === 'extend') {
      const px = th.x, py = th.y;
      const nx = px + th.dx * 1700 * dt, ny = py + th.dy * 1700 * dt;
      for (const t of w.balls) {
        if (t.team === this.team || !t.targetable) continue;
        if (M.distToSegment(t.x, t.y, px, py, nx, ny) < t.r) {
          th.phase = 'enemy'; th.t = 0.3; th.target = t;
          t.applySlow(1.5, 0.25, 0.5);
          w.damage(t, 4, this, { color: '#8fdcff' });
          return;
        }
      }
      if (nx < 0 || nx > S || ny < 0 || ny > S) {
        let k = 1;
        if (nx < 0) k = M.min(k, -px / (nx - px));
        if (nx > S) k = M.min(k, (S - px) / (nx - px));
        if (ny < 0) k = M.min(k, -py / (ny - py));
        if (ny > S) k = M.min(k, (S - py) / (ny - py));
        th.x = px + (nx - px) * k; th.y = py + (ny - py) * k;
        th.phase = 'grapple'; th.t = 0.45;
        w.emit('spark', { x: th.x, y: th.y, color: '#8fdcff' });
        return;
      }
      th.x = nx; th.y = ny;
    } else if (th.phase === 'grapple') {
      const n = M.normalize(th.x - this.x, th.y - this.y);
      this.vx += n.x * 1500 * dt; this.vy += n.y * 1500 * dt;
      th.t -= dt;
      if (th.t <= 0 || n.d < this.r + 6) { th.phase = 'fade'; th.t = 0.25; }
    } else if (th.phase === 'enemy') {
      if (!th.target.dead) { th.x = th.target.x; th.y = th.target.y; }
      th.t -= dt;
      if (th.t <= 0) { th.phase = 'fade'; th.t = 0.25; }
    } else {
      th.t -= dt;
      if (th.t <= 0) this.thread = null;
    }
  }
  fire() {
    const t = this.target();
    let ang;
    if (t && this.world.rng.chance(0.65)) ang = this.angleTo(t) + this.world.rng.range(-0.12, 0.12);
    else {
      const p = pointOnWall(this.world);
      ang = M.atan2(p.y - this.y, p.x - this.x);
    }
    this.thread = { phase: 'extend', dx: M.cos(ang), dy: M.sin(ang), x: this.x, y: this.y, t: 0, target: null };
  }
  drawUnder(ctx) {
    const th = this.thread;
    if (!th) return;
    ctx.save();
    ctx.globalAlpha = th.phase === 'fade' ? Math.max(0, th.t / 0.25) : 1;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(143,220,255,0.3)';
    ctx.lineWidth = 12;
    line(ctx, this.x, this.y, th.x, th.y);
    ctx.strokeStyle = '#8fdcff';
    ctx.lineWidth = 4.5;
    line(ctx, this.x, this.y, th.x, th.y);
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = r * 0.045;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    for (const k of [0.28, 0.52, 0.76, 0.98]) {
      const rr = r * k;
      for (let i = 0; i < 8; i++) {
        const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2, am = (a0 + a1) / 2;
        if (i === 0) ctx.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
        ctx.quadraticCurveTo(Math.cos(am) * rr * 0.8, Math.sin(am) * rr * 0.8, Math.cos(a1) * rr, Math.sin(a1) * rr);
      }
    }
    ctx.stroke();
  }
}

// ===================================================================== MARTEAU
export class HammerBall extends Ball {
  static meta = {
    id: 'hammer', color: '#ff2b2b',
    name: { fr: 'Marteau', en: 'Hammer' },
    desc: {
      fr: 'Un marteau tourne autour de lui. Chaque coup repousse fort et accélère la rotation.',
      en: 'A hammer spins around it. Every hit knocks back hard and speeds up the spin.',
    },
  };
  init() {
    this.angle = this.world.rng.angle();
    this.spin = 3.2 * this.world.rng.sign();
  }
  weapon() {
    const dx = M.cos(this.angle), dy = M.sin(this.angle);
    const L = this.r + 40 * this.scale;
    const tx = this.x + dx * L, ty = this.y + dy * L, hh = 19 * this.scale;
    return { dx, dy, px: -dy, py: dx, tx, ty, ax: tx - dy * hh, ay: ty + dx * hh, bx: tx + dy * hh, by: ty - dx * hh };
  }
  update(dt) {
    this.angle += this.spin * (this.abilityRate || 0.15) * dt;
    if (this.abilityRate === 0) return;
    const w = this.weapon();
    for (const t of this.world.balls) {
      if (t.team === this.team || !t.targetable) continue;
      const d = M.min(
        M.distToSegment(t.x, t.y, w.ax, w.ay, w.bx, w.by) - 8 * this.scale,
        M.distToSegment(t.x, t.y, this.x, this.y, w.tx, w.ty) - 4,
      );
      if (d < t.r && this.world.cdReady(`ham${this.id}-${t.id}`, 0.5)) {
        const sg = M.abs(this.spin) / this.spin;
        const n = M.normalize(t.x - this.x + w.px * sg * t.r, t.y - this.y + w.py * sg * t.r);
        t.vx += n.x * 520; t.vy += n.y * 520;
        this.spin = sg * M.min(M.abs(this.spin) * 1.12, 13);
        this.world.damage(t, 8, this, { x: w.tx, y: w.ty, color: '#cfe6ff', big: true });
        this.world.emit('shake', { amount: 6 });
      }
    }
  }
  drawOver(ctx) {
    const L = this.r + 40 * this.scale, s = this.scale;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.strokeStyle = '#13265e';
    ctx.lineWidth = 3;
    ctx.fillStyle = '#dceaff';
    ctx.fillRect(this.r * 0.15, -4.5 * s, L - this.r * 0.15, 9 * s);
    ctx.strokeRect(this.r * 0.15, -4.5 * s, L - this.r * 0.15, 9 * s);
    ctx.fillStyle = '#eaf3ff';
    ctx.fillRect(L - 8 * s, -19 * s, 16 * s, 38 * s);
    ctx.strokeRect(L - 8 * s, -19 * s, 16 * s, 38 * s);
    ctx.fillStyle = '#2f6bff';
    ctx.fillRect(L - 2 * s, -16 * s, 4 * s, 32 * s);
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#eaf3ff';
    ctx.strokeStyle = '#13265e';
    ctx.lineWidth = r * 0.06;
    ctx.save();
    ctx.rotate(-0.6);
    ctx.fillRect(-r * 0.1, -r * 0.1, r * 0.2, r * 0.75);
    ctx.strokeRect(-r * 0.1, -r * 0.1, r * 0.2, r * 0.75);
    ctx.fillRect(-r * 0.45, -r * 0.42, r * 0.9, r * 0.34);
    ctx.strokeRect(-r * 0.45, -r * 0.42, r * 0.9, r * 0.34);
    ctx.restore();
  }
}

// ===================================================================== VAMPIRE
export class VampireBall extends Ball {
  static meta = {
    id: 'vampire', color: '#5b0f2e',
    name: { fr: 'Vampire', en: 'Vampire' },
    desc: {
      fr: 'Fonce régulièrement sur sa proie : la morsure vole des PV et le soigne.',
      en: 'Regularly lunges at its prey: the bite drains HP and heals it.',
    },
  };
  update(dt) {
    if (this.tags.dash > 0) this.tags.dash -= dt;
    if (this.timer('lunge', 2.6, dt, 1.2)) {
      const t = this.target();
      if (t) { this.moveToward(t.x, t.y, 760); this.tags.dash = 0.6; }
    }
  }
  onContact(o, nx, ny, approaching) {
    if (this.tags.dash > 0 && approaching) {
      this.tags.dash = 0;
      const d = this.world.damage(o, 7, this, { color: '#ff2050', x: this.x + nx * this.r, y: this.y + ny * this.r });
      this.world.heal(this, d, null);
      this.world.emit('burst', { x: o.x, y: o.y, color: '#ff2050', n: 14 });
    }
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, -r * 0.05); ctx.lineTo(-r * 0.25, r * 0.5); ctx.lineTo(-r * 0.08, -r * 0.05);
    ctx.moveTo(r * 0.08, -r * 0.05); ctx.lineTo(r * 0.25, r * 0.5); ctx.lineTo(r * 0.45, -r * 0.05);
    ctx.fill();
    ctx.fillStyle = '#ff3355';
    ctx.beginPath();
    ctx.arc(-r * 0.32, -r * 0.42, r * 0.11, 0, Math.PI * 2);
    ctx.arc(r * 0.32, -r * 0.42, r * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }
  drawUnder(ctx) {
    if (!(this.tags.dash > 0)) return;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#ff2050';
    for (let i = 1; i <= 3; i++) {
      circle(ctx, this.x - this.vx * 0.025 * i, this.y - this.vy * 0.025 * i, this.r * (1 - i * 0.12));
      ctx.fill();
    }
    ctx.restore();
  }
}

// ====================================================================== MINEUR
class Mine extends Entity {
  constructor(world, owner) {
    super(world, owner);
    this.layer = 'floor';
    this.x = owner.x; this.y = owner.y;
    this.diesWithOwner = true;
  }
  update(dt) {
    this.age += dt;
    if (this.age < 0.6) return;
    for (const b of this.world.balls) {
      if (b.team === this.team || !b.targetable) continue;
      if (M.hypot(b.x - this.x, b.y - this.y) < b.r + 18) {
        this.kill();
        this.world.explode(this.x, this.y, 75, 10, this.owner, { color: '#ffb040', knock: 350 });
        this.world.emit('shake', { amount: 7 });
        return;
      }
    }
  }
  draw(ctx) {
    const armed = this.age >= 0.6;
    ctx.save();
    ctx.fillStyle = '#2b2b2b';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    circle(ctx, this.x, this.y, 9); ctx.fill(); ctx.stroke();
    ctx.fillStyle = armed && Math.floor(this.age * 4) % 2 ? '#ff3030' : '#661010';
    circle(ctx, this.x, this.y, 3.5); ctx.fill();
    ctx.restore();
  }
}
export class BomberBall extends Ball {
  static meta = {
    id: 'bomber', color: '#4d5a2a',
    name: { fr: 'Mineur', en: 'Miner' },
    desc: {
      fr: 'Sème des mines sur son passage, qui explosent quand un ennemi s\'approche.',
      en: 'Drops mines along its path that blow up when an enemy comes close.',
    },
  };
  update(dt) {
    if (this.timer('mine', 1.5, dt, 0.8)) {
      const mines = this.world.entities.filter(e => e instanceof Mine && e.owner === this);
      if (mines.length >= 5) mines[0].kill();
      this.world.spawn(new Mine(this.world, this));
    }
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#1d1d1d';
    circle(ctx, 0, r * 0.1, r * 0.48); ctx.fill();
    ctx.strokeStyle = '#d9b36a';
    ctx.lineWidth = r * 0.08;
    ctx.beginPath(); ctx.moveTo(r * 0.25, -r * 0.3); ctx.quadraticCurveTo(r * 0.5, -r * 0.7, r * 0.2, -r * 0.75); ctx.stroke();
    ctx.fillStyle = '#ffcc33';
    circle(ctx, r * 0.18, -r * 0.78, r * 0.12); ctx.fill();
  }
}

// ===================================================================== FANTÔME
export class GhostBall extends Ball {
  static meta = {
    id: 'ghost', color: '#9aa7c7',
    name: { fr: 'Fantôme', en: 'Ghost' },
    desc: {
      fr: 'Devient intangible et invulnérable par moments, puis surgit pour un contact hanté surpuissant.',
      en: 'Phases out, intangible and invulnerable, then reappears for a haunted super hit.',
    },
  };
  update(dt) {
    if (this.timer('phase', 4.2, dt, 2.5)) {
      this.st.intangible = 1.4;
      this.tags.haunt = 1;
      const t = this.target();
      if (t) this.moveToward(t.x, t.y, this.cruiseSpeed() * 1.4);
    }
    this.alpha = this.st.intangible > 0 ? 0.35 : 1;
  }
  contactBonus(o) {
    if (this.tags.haunt && this.st.intangible <= 0) { this.tags.haunt = 0; this.world.emit('burst', { x: o.x, y: o.y, color: '#c9d4ff', n: 20 }); return 10; }
    return 0;
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, r * 0.55);
    ctx.lineTo(-r * 0.5, -r * 0.05);
    ctx.arc(0, -r * 0.05, r * 0.5, Math.PI, 0);
    ctx.lineTo(r * 0.5, r * 0.55);
    for (let i = 0; i < 4; i++) ctx.lineTo(r * (0.5 - (i + 0.5) * 0.25), r * (i % 2 ? 0.55 : 0.35));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#222a44';
    circle(ctx, -r * 0.18, -r * 0.08, r * 0.09); ctx.fill();
    circle(ctx, r * 0.18, -r * 0.08, r * 0.09); ctx.fill();
  }
}

// ====================================================================== MIROIR
export class MirrorBall extends Ball {
  static meta = {
    id: 'mirror', color: '#7fd6e8',
    name: { fr: 'Miroir', en: 'Mirror' },
    desc: {
      fr: 'Renvoie les projectiles et une partie des dégâts reçus. Tire des éclats de lumière.',
      en: 'Reflects projectiles and part of the damage it takes. Fires light shards.',
    },
  };
  init() { this.reflectsProjectiles = true; }
  update(dt) {
    if (this.timer('ray', 2.4, dt)) {
      const t = this.target();
      if (t) {
        const r = this.world.ray(this.x, this.y, this.angleTo(t), this.team, 2);
        this.world.emit('beam', { x1: this.x, y1: this.y, x2: r.x2, y2: r.y2, color: '#e8fdff', width: 4 });
        if (r.hits[0]) this.world.damage(r.hits[0], 4, this, { color: '#e8fdff' });
      }
    }
  }
  modifyIncoming(a, src, o) {
    if (src && src !== this && !src.dead && o.kind !== 'reflect' && o.kind !== 'dot') {
      this.world.damage(src, a * 0.4, this, { kind: 'reflect', color: '#bff6ff' });
      this.world.emit('zap', { x1: this.x, y1: this.y, x2: src.x, y2: src.y, color: '#bff6ff' });
    }
    return a * 0.9;
  }
  drawIcon(ctx, r) {
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.1)');
    g.addColorStop(1, 'rgba(255,255,255,0.7)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, -r); ctx.lineTo(r * 0.15, -r); ctx.lineTo(-r * 0.35, r); ctx.lineTo(-r * 0.7, r);
    ctx.moveTo(r * 0.4, -r); ctx.lineTo(r * 0.55, -r); ctx.lineTo(r * 0.05, r); ctx.lineTo(-r * 0.1, r);
    ctx.fill();
  }
}

// ======================================================================= AIMANT
export class MagnetBall extends Ball {
  static meta = {
    id: 'magnet', color: '#c22f2f',
    name: { fr: 'Aimant', en: 'Magnet' },
    desc: {
      fr: 'Alterne attraction et répulsion. Un ennemi attiré qui le percute se fait écraser.',
      en: 'Alternates pull and push. An enemy pulled into it gets crushed.',
    },
  };
  init() { this.tags.pol = 1; }
  update(dt) {
    if (this.timer('flip', 2.5, dt)) this.tags.pol = -this.tags.pol;
    if (this.abilityRate === 0) return;
    for (const t of this.world.balls) {
      if (t.team === this.team || !t.targetable) continue;
      const n = M.normalize(this.x - t.x, this.y - t.y);
      if (n.d > 280) continue;
      const f = 700 * (1 - n.d / 280) * this.tags.pol * dt;
      t.vx += n.x * f; t.vy += n.y * f;
    }
  }
  contactBonus(o) { return this.tags.pol > 0 ? 6 : 0; }
  drawUnder(ctx) {
    ctx.save();
    ctx.strokeStyle = this.tags.pol > 0 ? 'rgba(255,90,90,0.35)' : 'rgba(90,160,255,0.35)';
    ctx.lineWidth = 2;
    const ph = (this.world.time * (this.tags.pol > 0 ? -1 : 1) * 90) % 60;
    for (let k = 0; k < 4; k++) {
      const rr = this.r + 20 + ((k * 60 + ph + 240) % 240);
      ctx.globalAlpha = 1 - (rr - this.r) / 260;
      circle(ctx, this.x, this.y, rr); ctx.stroke();
    }
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.lineWidth = r * 0.28;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#e0e0e0';
    ctx.beginPath(); ctx.arc(0, -r * 0.05, r * 0.42, Math.PI, 0); ctx.stroke();
    ctx.strokeStyle = '#ff4040';
    ctx.beginPath(); ctx.moveTo(-r * 0.42, -r * 0.05); ctx.lineTo(-r * 0.42, r * 0.5); ctx.stroke();
    ctx.strokeStyle = '#4080ff';
    ctx.beginPath(); ctx.moveTo(r * 0.42, -r * 0.05); ctx.lineTo(r * 0.42, r * 0.5); ctx.stroke();
  }
}

// ======================================================================== GIVRE
export class FrostBall extends Ball {
  static meta = {
    id: 'frost', color: '#3fa9f5',
    name: { fr: 'Givre', en: 'Frost' },
    desc: {
      fr: 'Libère une onde de froid qui gèle sur place les ennemis proches.',
      en: 'Releases a cold nova that freezes nearby enemies in place.',
    },
  };
  update(dt) {
    if (this.timer('nova', 3, dt, 2)) {
      const R = 165 * this.scale + 30;
      this.world.spawn(new Delayed(this.world, this, 0.35, () => {
        if (this.dead) return;
        this.world.emit('ring', { x: this.x, y: this.y, r: R, color: '#bfe9ff' });
        for (const t of this.world.enemiesOf(this)) {
          if (t.targetable && this.dist(t) < R + t.r) {
            t.stun(1);
            this.world.damage(t, 6, this, { color: '#bfe9ff' });
          }
        }
      }, (ctx, p) => {
        ctx.save();
        ctx.strokeStyle = rgba('#bfe9ff', 0.3 + 0.5 * p);
        ctx.lineWidth = 3;
        circle(ctx, this.x, this.y, this.r + (R - this.r) * p); ctx.stroke();
        ctx.restore();
      }));
    }
  }
  drawIcon(ctx, r) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = r * 0.08;
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      line(ctx, 0, 0, c * r * 0.7, s * r * 0.7);
      const bx = c * r * 0.45, by = s * r * 0.45;
      line(ctx, bx, by, bx + Math.cos(a + 0.7) * r * 0.2, by + Math.sin(a + 0.7) * r * 0.2);
      line(ctx, bx, by, bx + Math.cos(a - 0.7) * r * 0.2, by + Math.sin(a - 0.7) * r * 0.2);
    }
  }
}

export const CLASSICS = [WebBall, HammerBall, VampireBall, BomberBall, GhostBall, MirrorBall, MagnetBall, FrostBall];
