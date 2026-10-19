/* Entités génériques de la simulation : projectiles, zones, effets différés.
 * Les combattants peuvent les utiliser telles quelles (options) ou les étendre. */
import * as M from './dmath.js';

export class Entity {
  constructor(world, owner) {
    this.world = world;
    this.owner = owner;
    this.team = owner ? owner.team : -1;
    this.alive = true;
    this.age = 0;
    this.layer = 'over';   // 'floor' (sous les balles) ou 'over'
  }
  update(dt) { this.age += dt; }
  kill() { this.alive = false; }
  draw(ctx) {}
}

/** Projectile : se déplace, rebondit éventuellement, touche les ennemis. */
export class Projectile extends Entity {
  constructor(world, owner, o) {
    super(world, owner);
    this.x = owner.x; this.y = owner.y; this.vx = 0; this.vy = 0;
    this.r = 6;
    this.damage = 5;
    this.life = 3;
    this.bounces = 0;          // rebonds sur les murs avant de disparaître
    this.pierce = false;       // traverse les cibles
    this.homing = 0;           // vitesse de virage max (rad/s) vers l'ennemi le plus proche
    this.knock = 0;            // recul infligé
    this.color = owner.color;
    this.shape = 'orb';        // 'orb' | 'bolt' | 'spike' | 'star' | 'custom'
    this.big = false;
    this.kind = 'ability';
    this.reflected = false;
    this.hitSet = new Set();
    Object.assign(this, o);
  }

  update(dt) {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) { this.expire(); return; }
    const w = this.world;

    if (this.homing) {
      const t = w.nearestEnemyOfTeam(this.team, this.x, this.y);
      if (t) {
        const a = M.atan2(this.vy, this.vx);
        const want = M.atan2(t.y - this.y, t.x - this.x);
        const turn = M.clamp(M.angleDiff(a, want), -this.homing * dt, this.homing * dt);
        const s = M.hypot(this.vx, this.vy);
        this.vx = M.cos(a + turn) * s;
        this.vy = M.sin(a + turn) * s;
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const S = w.size, r = this.r;
    let hitWall = false;
    if (this.x < r) { this.x = r; this.vx = M.abs(this.vx); hitWall = true; }
    else if (this.x > S - r) { this.x = S - r; this.vx = -M.abs(this.vx); hitWall = true; }
    if (this.y < r) { this.y = r; this.vy = M.abs(this.vy); hitWall = true; }
    else if (this.y > S - r) { this.y = S - r; this.vy = -M.abs(this.vy); hitWall = true; }
    if (hitWall) {
      if (this.bounces > 0) { this.bounces--; this.onBounce(); }
      else { this.onWall(); if (this.alive) this.expire(); return; }
    }

    for (const t of w.balls) {
      if (t.team === this.team || !t.targetable || this.hitSet.has(t.id)) continue;
      const rr = this.r + t.r;
      const dx = t.x - this.x, dy = t.y - this.y;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (t.reflectsProjectiles && !this.reflected) {
        // renvoyé à l'envoyeur
        this.reflected = true;
        this.team = t.team;
        this.owner = t;
        this.vx = -this.vx; this.vy = -this.vy;
        this.hitSet.clear();
        this.life = M.max(this.life, 1.5);
        w.emit('reflect', { x: this.x, y: this.y, color: t.color });
        return;
      }
      this.hitSet.add(t.id);
      this.onHit(t);
      if (!this.pierce) { this.kill(); return; }
    }
  }

  /** Effet à l'impact (par défaut : dégâts + recul). */
  onHit(t) {
    this.world.damage(t, this.damage, this.owner, {
      kind: this.kind, x: this.x, y: this.y, color: this.color, big: this.big, reflected: this.reflected,
    });
    if (this.knock) {
      const n = M.normalize(this.vx, this.vy);
      t.vx += n.x * this.knock; t.vy += n.y * this.knock;
    }
  }
  onBounce() {}
  onWall() {}
  expire() { this.kill(); }

  draw(ctx) {
    ctx.save();
    const a = Math.atan2(this.vy, this.vx);
    ctx.translate(this.x, this.y);
    ctx.fillStyle = this.color;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    switch (this.shape) {
      case 'bolt':
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(0, 0, this.r * 2.2, this.r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        break;
      case 'spike':
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(this.r * 1.8, 0);
        ctx.lineTo(-this.r, this.r * 0.8);
        ctx.lineTo(-this.r, -this.r * 0.8);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        break;
      case 'star': {
        ctx.rotate(this.age * 12);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const rr = i % 2 ? this.r * 0.45 : this.r * 1.3;
          const aa = (i / 8) * Math.PI * 2;
          ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
        }
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        break;
      }
      default:
        ctx.beginPath();
        ctx.arc(0, 0, this.r, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(-this.r * 0.3, -this.r * 0.3, this.r * 0.35, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
  }
}

/** Zone au sol : applique onTick(ball) aux ennemis à l'intérieur toutes les `tick` s. */
export class Zone extends Entity {
  constructor(world, owner, o) {
    super(world, owner);
    this.layer = 'floor';
    this.x = owner.x; this.y = owner.y;
    this.r = 40;
    this.life = 3;
    this.maxLife = o.life ?? 3;
    this.tick = 0.5;
    this.tickT = 0;
    this.color = owner.color;
    this.affectsAllies = false;
    Object.assign(this, o);
  }
  update(dt) {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) { this.kill(); return; }
    this.tickT -= dt;
    if (this.tickT <= 0) {
      this.tickT += this.tick;
      for (const b of this.world.balls) {
        if (b.dead || b.st.intangible > 0) continue;
        if (!this.affectsAllies && b.team === this.team) continue;
        if (M.hypot(b.x - this.x, b.y - this.y) < this.r + b.r * 0.5) this.onTick(b);
      }
    }
  }
  onTick(b) {}
  draw(ctx) {
    const a = Math.min(1, this.life / 0.4, this.age / 0.2);
    ctx.save();
    ctx.globalAlpha = 0.35 * a;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.8 * a;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

/** Action différée (avec affichage optionnel du compte à rebours). */
export class Delayed extends Entity {
  constructor(world, owner, delay, fn, drawFn) {
    super(world, owner);
    this.delay = delay;
    this.total = delay;
    this.fn = fn;
    this.drawFn = drawFn;
    this.layer = 'floor';
  }
  update(dt) {
    this.age += dt;
    this.delay -= dt;
    if (this.delay <= 0) { this.kill(); this.fn(); }
  }
  draw(ctx) {
    if (this.drawFn) this.drawFn(ctx, 1 - this.delay / this.total);
  }
}

/** Cercle d'avertissement (télégraphe) qui se remplit avant un impact. */
export function drawTelegraph(ctx, x, y, r, progress, color = '#ff5040') {
  ctx.save();
  ctx.globalAlpha = 0.25 + 0.3 * progress;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r * progress, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
