/* Invocateurs et créatures : Nécromancien, Essaim, Ingénieur, Slime, Illusionniste, Écho, Serpent, Portail. */
import { Ball } from '../sim/ball.js';
import { Entity, Projectile } from '../sim/entities.js';
import * as M from '../sim/dmath.js';
import { circle, line, rgba } from './helpers.js';

/** Petite créature qui poursuit l'ennemi le plus proche. */
class Minion extends Ball {
  chase(dt, turn = 5) {
    const t = this.world.nearestEnemy(this, { mainOnly: true });
    if (!t) return;
    const a = M.atan2(this.vy, this.vx);
    const want = this.angleTo(t);
    this.rotateVelocity(M.clamp(M.angleDiff(a, want), -turn * dt, turn * dt));
  }
}

// ================================================================= NÉCROMANCIEN
class Skull extends Minion {
  static meta = { id: 'skull', color: '#e8e2d0', name: { fr: 'Crâne', en: 'Skull' }, desc: { fr: '', en: '' } };
  update(dt) { this.chase(dt, 4); }
  onContact(o) {
    if (this.dead || o.summon) return;
    this.world.explode(this.x, this.y, 42, 7, this, { color: '#b6ff9a', knock: 220 });
    this.world.kill(this, null);
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#222';
    circle(ctx, -r * 0.32, -r * 0.1, r * 0.22); ctx.fill();
    circle(ctx, r * 0.32, -r * 0.1, r * 0.22); ctx.fill();
    ctx.fillRect(-r * 0.25, r * 0.35, r * 0.5, r * 0.15);
  }
}
export class NecroBall extends Ball {
  static meta = {
    id: 'necro', color: '#3b3f4a',
    name: { fr: 'Nécromancien', en: 'Necromancer' },
    desc: {
      fr: 'Invoque des crânes qui pourchassent l\'ennemi et explosent à son contact.',
      en: 'Summons skulls that chase the enemy and explode on contact.',
    },
  };
  update(dt) {
    if (this.timer('skull', 3.6, dt, 1.5)) {
      const n = this.world.balls.filter(b => b instanceof Skull && b.owner === this && !b.dead).length;
      if (n < 3) {
        this.world.summon(Skull, this, { radius: 14, hp: 8, speed: 330 });
        this.world.emit('burst', { x: this.x, y: this.y, color: '#b6ff9a', n: 10 });
      }
    }
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#e8e2d0';
    ctx.beginPath();
    ctx.arc(0, -r * 0.1, r * 0.48, Math.PI, 0);
    ctx.lineTo(r * 0.35, r * 0.4); ctx.lineTo(-r * 0.35, r * 0.4);
    ctx.fill();
    ctx.fillStyle = '#7dff6b';
    circle(ctx, -r * 0.18, -r * 0.08, r * 0.12); ctx.fill();
    circle(ctx, r * 0.18, -r * 0.08, r * 0.12); ctx.fill();
  }
}

// ======================================================================= ESSAIM
class Bee extends Projectile {
  update(dt) {
    const o = this.owner;
    if (o.dead) { this.kill(); return; }
    if (!this.attack) {
      this.age += dt;
      this.orbit += 3 * dt;
      const R = o.r + 18;
      this.x = o.x + M.cos(this.orbit) * R; this.y = o.y + M.sin(this.orbit) * R;
      const t = this.world.nearestEnemyOfTeam(this.team, this.x, this.y);
      if (t && M.hypot(t.x - this.x, t.y - this.y) < 240 && o.abilityRate > 0) {
        this.attack = true;
        const a = M.atan2(t.y - this.y, t.x - this.x);
        this.vx = M.cos(a) * 430; this.vy = M.sin(a) * 430;
        this.life = 2.5;
      }
      return;
    }
    super.update(dt);
  }
  onHit(b) {
    this.world.damage(b, 1.5, this.owner, { x: this.x, y: this.y, color: '#ffd23a' });
    b.addDot('venom', 3, 2, this.owner, '#c6ff3a');
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    const flap = Math.sin(this.age * 60) * 2;
    ctx.beginPath(); ctx.ellipse(-1, -4 - flap * 0.3, 3, 4 + flap, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath(); ctx.ellipse(0, 0, 5, 3.5, Math.atan2(this.vy, this.vx), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(-1, -3, 2, 6);
    ctx.restore();
  }
}
export class SwarmBall extends Ball {
  static meta = {
    id: 'swarm', color: '#d4a017',
    name: { fr: 'Essaim', en: 'Swarm' },
    desc: {
      fr: 'Une ruche vivante : ses abeilles tournent autour d\'elle et piquent les ennemis proches (venin).',
      en: 'A living hive: its bees circle around and sting nearby enemies (venom).',
    },
  };
  update(dt) {
    if (this.timer('bee', 0.75, dt, 0.3)) {
      const n = this.world.entities.filter(e => e instanceof Bee && e.owner === this && !e.attack).length;
      if (n < 6) this.world.spawn(new Bee(this.world, this, { r: 5, life: 99, orbit: this.world.rng.angle(), attack: false }));
    }
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#3b2a05';
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = i ? Math.cos(a) * r * 0.42 : 0, y = i ? Math.sin(a) * r * 0.42 : 0;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) ctx.lineTo(x + Math.cos(k * Math.PI / 3) * r * 0.2, y + Math.sin(k * Math.PI / 3) * r * 0.2);
      ctx.closePath();
      ctx.fill();
    }
  }
}

// ==================================================================== INGÉNIEUR
class Turret extends Entity {
  constructor(world, owner) {
    super(world, owner);
    this.x = owner.x; this.y = owner.y;
    this.life = 10;
    this.ang = 0;
    this.diesWithOwner = true;
  }
  update(dt) {
    this.age += dt;
    if (this.age >= this.life) { this.kill(); return; }
    const t = this.world.nearestEnemyOfTeam(this.team, this.x, this.y);
    if (!t) return;
    this.ang = M.atan2(t.y - this.y, t.x - this.x);
    this.cd = (this.cd ?? 0.5) - dt;
    if (this.cd <= 0) {
      this.cd = 0.9;
      const c = M.cos(this.ang), s = M.sin(this.ang);
      this.world.spawn(new Projectile(this.world, this.owner, {
        x: this.x + c * 16, y: this.y + s * 16, vx: c * 620, vy: s * 620, r: 4, damage: 3, shape: 'bolt', color: '#ffe066',
      }));
    }
  }
  draw(ctx) {
    const k = Math.min(1, (this.life - this.age) / 0.4, this.age / 0.2);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.translate(this.x, this.y);
    ctx.fillStyle = '#5a6672';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) ctx.lineTo(Math.cos(i * Math.PI / 3) * 14, Math.sin(i * Math.PI / 3) * 14);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.rotate(this.ang);
    ctx.fillStyle = '#ffb000';
    ctx.fillRect(0, -3.5, 20, 7);
    ctx.strokeRect(0, -3.5, 20, 7);
    circle(ctx, 0, 0, 6); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
export class EngineerBall extends Ball {
  static meta = {
    id: 'engineer', color: '#d98e04',
    name: { fr: 'Ingénieur', en: 'Engineer' },
    desc: {
      fr: 'Pose des tourelles automatiques qui mitraillent l\'ennemi.',
      en: 'Deploys automatic turrets that pepper the enemy.',
    },
  };
  update(dt) {
    if (this.timer('turret', 4.5, dt, 1.2)) {
      const mine = this.world.entities.filter(e => e instanceof Turret && e.owner === this);
      if (mine.length >= 2) mine[0].kill();
      this.world.spawn(new Turret(this.world, this));
    }
  }
  drawIcon(ctx, r) {
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = r * 0.16;
    ctx.lineCap = 'round';
    line(ctx, -r * 0.4, r * 0.4, r * 0.15, -r * 0.15);
    ctx.lineWidth = r * 0.1;
    ctx.beginPath(); ctx.arc(r * 0.3, -r * 0.3, r * 0.25, 0.8, 5.5); ctx.stroke();
  }
}

// ======================================================================== SLIME
class MiniSlime extends Minion {
  static meta = { id: 'minislime', color: '#5fd35f', name: { fr: 'Mini-slime', en: 'Mini slime' }, desc: { fr: '', en: '' } };
  update(dt) { this.chase(dt, 3); }
  onContact(o) {
    if (this.dead || o.summon) return;
    this.world.damage(o, 3, this, { color: '#8fff8f' });
    o.applySlow(0.6, 0.6);
    this.world.kill(this, null);
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#103010';
    circle(ctx, -r * 0.3, -r * 0.1, r * 0.15); ctx.fill();
    circle(ctx, r * 0.3, -r * 0.1, r * 0.15); ctx.fill();
  }
}
export class SlimeBall extends Ball {
  static meta = {
    id: 'slime', color: '#3cbf3c',
    name: { fr: 'Slime', en: 'Slime' },
    desc: {
      fr: 'Quand il prend un coup, un morceau se détache et devient un mini-slime qui attaque.',
      en: 'When hit, a chunk breaks off and becomes a mini slime that attacks.',
    },
  };
  onDamaged(a, src, o) {
    if (o.kind === 'dot' || a < 2.5 || this.dead) return;
    const n = this.world.balls.filter(b => b instanceof MiniSlime && b.owner === this && !b.dead).length;
    if (n < 4 && this.world.cdReady(`slime${this.id}`, 0.6)) {
      this.world.summon(MiniSlime, this, { radius: 13, hp: 6, speed: 300 });
    }
  }
  update(dt) {
    if (this.timer('regen', 2, dt)) this.world.heal(this, 1, this);
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.4, r * 0.25, r * 0.13, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#103010';
    circle(ctx, -r * 0.22, 0, r * 0.1); ctx.fill();
    circle(ctx, r * 0.22, 0, r * 0.1); ctx.fill();
    ctx.strokeStyle = '#103010';
    ctx.lineWidth = r * 0.06;
    ctx.beginPath(); ctx.arc(0, r * 0.15, r * 0.2, 0.3, Math.PI - 0.3); ctx.stroke();
  }
}

// ================================================================ ILLUSIONNISTE
class Decoy extends Ball {
  static meta = { id: 'decoy', color: '#b03fd6', name: { fr: 'Illusion', en: 'Illusion' }, desc: { fr: '', en: '' } };
  init() { this.tags.life = 5; }
  get displayHp() { return this.owner.hp; }
  update(dt) {
    this.tags.life -= dt;
    if (this.tags.life <= 0) this.pop();
  }
  pop() {
    if (this.dead) return;
    this.world.emit('burst', { x: this.x, y: this.y, color: '#e7b6ff', n: 16 });
    this.world.kill(this, null);
  }
  modifyIncoming() { this.pop(); return 0; }
  onContact(o) { if (!o.summon) this.pop(); }
  drawIcon(ctx, r) { IllusionBall.prototype.drawIcon.call(this, ctx, r); }
}
export class IllusionBall extends Ball {
  static meta = {
    id: 'illusion', color: '#b03fd6',
    name: { fr: 'Illusionniste', en: 'Illusionist' },
    desc: {
      fr: 'Crée des copies parfaites d\'elle-même : les ennemis visent souvent la mauvaise.',
      en: 'Creates perfect copies of itself: enemies often aim at the wrong one.',
    },
  };
  update(dt) {
    if (this.timer('decoy', 4, dt, 1.5)) {
      for (let i = 0; i < 2; i++) {
        this.world.summon(Decoy, this, { hp: 1, angle: this.world.rng.angle() });
      }
      this.world.emit('burst', { x: this.x, y: this.y, color: '#e7b6ff', n: 20 });
    }
    if (this.timer('trick', 2.2, dt, 1)) {
      const t = this.target({ mainOnly: true });
      if (t) {
        this.world.damage(t, 4, this, { color: '#e7b6ff' });
        this.world.emit('zap', { x1: this.x, y1: this.y, x2: t.x, y2: t.y, color: '#e7b6ff' });
      }
    }
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#1a0a22';
    ctx.fillRect(-r * 0.32, -r * 0.6, r * 0.64, r * 0.55);
    ctx.fillRect(-r * 0.55, -r * 0.08, r * 1.1, r * 0.12);
    ctx.fillStyle = '#ffd23a';
    for (const [x, y] of [[-0.35, 0.35], [0.3, 0.45], [0, 0.25]]) {
      ctx.beginPath(); ctx.arc(x * r, y * r, r * 0.07, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// ======================================================================== ÉCHO
export class EchoBall extends Ball {
  static meta = {
    id: 'echo', color: '#2fa6a0',
    name: { fr: 'Écho', en: 'Echo' },
    desc: {
      fr: 'Un double fantôme rejoue sa trajectoire avec un temps de retard et blesse ceux qu\'il croise.',
      en: 'A ghostly double replays its path a moment later and hurts anyone it crosses.',
    },
  };
  init() { this.hist = []; this.echo = null; }
  update(dt) {
    this.hist.push(this.x, this.y);
    const lag = 2 * 150; // 1,25 s à 120 Hz (2 valeurs par pas)
    if (this.hist.length > lag) {
      this.hist.splice(0, this.hist.length - lag);
      const ex = this.hist[0], ey = this.hist[1];
      this.echo = { x: ex, y: ey };
      if (this.abilityRate === 0) return;
      for (const b of this.world.enemiesOf(this)) {
        if (b.targetable && M.hypot(b.x - ex, b.y - ey) < b.r + this.r && this.world.cdReady(`echo${this.id}-${b.id}`, 0.6)) {
          this.world.damage(b, 6, this, { x: ex, y: ey, color: '#9ffff8' });
          const n = M.normalize(b.x - ex, b.y - ey);
          b.vx += n.x * 300; b.vy += n.y * 300;
        }
      }
    }
  }
  drawUnder(ctx) {
    if (!this.echo) return;
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#5ff0e8';
    circle(ctx, this.echo.x, this.echo.y, this.r); ctx.fill();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = '#d0fffb';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.strokeStyle = '#d0fffb';
    ctx.lineWidth = r * 0.08;
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = 1 - i * 0.3;
      ctx.beginPath(); ctx.arc(-r * 0.3, 0, r * (0.25 + i * 0.22), -0.9, 0.9); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// ====================================================================== SERPENT
export class SnakeBall extends Ball {
  static meta = {
    id: 'snake', color: '#3f8f2f',
    name: { fr: 'Serpent', en: 'Snake' },
    desc: {
      fr: 'Traîne une queue qui s\'allonge avec le temps et blesse tout ennemi qui la touche.',
      en: 'Drags a tail that grows over time and hurts any enemy that touches it.',
    },
  };
  init() { this.hist = []; this.len = 3; this.segs = []; }
  update(dt) {
    this.hist.unshift(this.x, this.y);
    const spacing = 8; // pas de simulation entre deux anneaux
    if (this.hist.length > 2 * spacing * 18) this.hist.length = 2 * spacing * 18;
    if (this.timer('grow', 1.8, dt)) this.len = M.min(16, this.len + 1);
    this.segs = [];
    const sr = 11 * this.scale;
    for (let i = 1; i <= this.len; i++) {
      const k = i * spacing * 2;
      if (k + 1 >= this.hist.length) break;
      this.segs.push(this.hist[k], this.hist[k + 1]);
    }
    if (this.abilityRate === 0) return;
    for (const b of this.world.enemiesOf(this)) {
      if (!b.targetable) continue;
      for (let i = 0; i < this.segs.length; i += 2) {
        if (M.hypot(b.x - this.segs[i], b.y - this.segs[i + 1]) < b.r + sr) {
          if (this.world.cdReady(`snake${this.id}-${b.id}`, 0.4)) this.world.damage(b, 4, this, { color: '#b6ff6b', x: this.segs[i], y: this.segs[i + 1] });
          break;
        }
      }
    }
  }
  drawUnder(ctx) {
    const sr = 11 * this.scale;
    ctx.save();
    for (let i = this.segs.length - 2; i >= 0; i -= 2) {
      const k = i / 2 / Math.max(1, this.segs.length / 2);
      ctx.fillStyle = k % 0.2 < 0.1 ? '#2f6f22' : '#4fa23a';
      ctx.strokeStyle = '#173a10';
      ctx.lineWidth = 2;
      circle(ctx, this.segs[i], this.segs[i + 1], sr * (1 - k * 0.35)); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#ffe14a';
    ctx.beginPath(); ctx.ellipse(-r * 0.25, -r * 0.15, r * 0.14, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * 0.25, -r * 0.15, r * 0.14, r * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.fillRect(-r * 0.27, -r * 0.3, r * 0.05, r * 0.3);
    ctx.fillRect(r * 0.23, -r * 0.3, r * 0.05, r * 0.3);
    ctx.strokeStyle = '#ff3b5c';
    ctx.lineWidth = r * 0.06;
    line(ctx, 0, r * 0.3, 0, r * 0.6);
    line(ctx, 0, r * 0.6, -r * 0.1, r * 0.72);
    line(ctx, 0, r * 0.6, r * 0.1, r * 0.72);
  }
}

// ====================================================================== PORTAIL
class PortalPair extends Entity {
  constructor(world, owner, a, b) {
    super(world, owner);
    this.layer = 'floor';
    this.a = a; this.b = b;
    this.life = 6;
    this.diesWithOwner = true;
  }
  update(dt) {
    this.age += dt;
    if (this.age >= this.life) { this.kill(); return; }
    const w = this.world;
    for (const ball of w.balls) {
      if (ball.dead || ball.st.intangible > 0 || ball.tags.attachedTo) continue;
      for (const [p, q] of [[this.a, this.b], [this.b, this.a]]) {
        if (M.hypot(ball.x - p.x, ball.y - p.y) < 20 + ball.r * 0.4 && w.cdReady(`portal${ball.id}`, 0.8)) {
          const n = M.normalize(ball.vx, ball.vy);
          ball.x = M.clamp(q.x + n.x * (ball.r + 8), ball.r, w.size - ball.r);
          ball.y = M.clamp(q.y + n.y * (ball.r + 8), ball.r, w.size - ball.r);
          w.emit('blink', { x1: p.x, y1: p.y, x2: q.x, y2: q.y, color: '#ff9a3a', r: ball.r });
          if (ball === this.owner) { ball.tags.charged = 1; ball.haste(1.5, 1.5); }
          else if (ball.team !== this.team) w.damage(ball, 4, this.owner, { color: '#ffb06a' });
          break;
        }
      }
    }
  }
  draw(ctx) {
    const k = Math.min(1, this.age / 0.3, (this.life - this.age) / 0.3);
    for (const [p, c] of [[this.a, '#ff8a1a'], [this.b, '#2a9dff']]) {
      ctx.save();
      ctx.globalAlpha = k;
      ctx.translate(p.x, p.y);
      ctx.strokeStyle = c;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(0, 0, 26, 26, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = rgba(c === '#ff8a1a' ? '#ff8a1a' : '#2a9dff', 0.25);
      ctx.fill();
      ctx.rotate(this.age * 3);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 16, 0, 4); ctx.stroke();
      ctx.restore();
    }
  }
}
export class PortalBall extends Ball {
  static meta = {
    id: 'portal', color: '#e0701a',
    name: { fr: 'Portail', en: 'Portal' },
    desc: {
      fr: 'Ouvre deux portails reliés. Les ennemis qui les traversent sont déchirés ; lui en ressort surchargé.',
      en: 'Opens two linked portals. Enemies passing through get torn; it comes out supercharged.',
    },
  };
  update(dt) {
    if (this.timer('portal', 6, dt, 0.8)) {
      const w = this.world, S = w.size;
      const t = this.target({ mainOnly: true });
      // un portail sur le chemin de l'ennemi, l'autre devant soi
      const a = t ? { x: M.clamp(t.x + t.vx * 0.5, 50, S - 50), y: M.clamp(t.y + t.vy * 0.5, 50, S - 50) } : { x: w.rng.range(60, S - 60), y: w.rng.range(60, S - 60) };
      const b = { x: M.clamp(this.x + this.vx * 0.5, 50, S - 50), y: M.clamp(this.y + this.vy * 0.5, 50, S - 50) };
      if (M.hypot(a.x - b.x, a.y - b.y) < 150) { b.x = S - a.x; b.y = S - a.y; }
      w.entities.filter(e => e instanceof PortalPair && e.owner === this).forEach(e => e.kill());
      w.spawn(new PortalPair(w, this, a, b));
    }
  }
  contactBonus() { if (this.tags.charged) { this.tags.charged = 0; return 10; } return 0; }
  drawIcon(ctx, r) {
    ctx.lineWidth = r * 0.12;
    ctx.strokeStyle = '#ffb06a';
    ctx.beginPath(); ctx.ellipse(-r * 0.3, 0, r * 0.2, r * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#6ac0ff';
    ctx.beginPath(); ctx.ellipse(r * 0.3, 0, r * 0.2, r * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
  }
}

export const SUMMONERS = [NecroBall, SwarmBall, EngineerBall, SlimeBall, IllusionBall, EchoBall, SnakeBall, PortalBall];
export const SUMMONS = [Skull, MiniSlime, Decoy];
