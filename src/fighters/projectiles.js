/* Combattants à distance : Sniper, Ricochet, Boomerang, Fusée, Chasseur, Bulle, Acide, Hypnose. */
import { Ball } from '../sim/ball.js';
import { Projectile } from '../sim/entities.js';
import * as M from '../sim/dmath.js';
import { shoot, aim, circle, line, star } from './helpers.js';

// ======================================================================= SNIPER
export class SniperBall extends Ball {
  static meta = {
    id: 'sniper', color: '#3d4f2f',
    name: { fr: 'Sniper', en: 'Sniper' },
    desc: {
      fr: 'S\'arrête pour viser au laser, puis tire un coup dévastateur en ligne droite.',
      en: 'Stops to aim with a laser sight, then fires a devastating straight shot.',
    },
  };
  init() { this.tags.aim = 0; this.tags.ang = 0; }
  update(dt) {
    if (this.tags.aim > 0) {
      if (this.abilityRate === 0) { this.tags.aim = 0; this.speedMult = 1; return; }
      this.tags.aim -= dt;
      const t = this.target({ mainOnly: true });
      if (t && this.tags.aim > 0.22) this.tags.ang = M.atan2(t.y + t.vy * 0.15 - this.y, t.x + t.vx * 0.15 - this.x);
      if (this.tags.aim <= 0) {
        this.speedMult = 1;
        const r = this.world.ray(this.x, this.y, this.tags.ang, this.team, 3);
        const hit = r.hits[0];
        const ex = hit ? hit.x : r.x2, ey = hit ? hit.y : r.y2;
        this.world.emit('beam', { x1: this.x, y1: this.y, x2: ex, y2: ey, color: '#fff0a0', width: 7 });
        this.world.emit('sfx', { name: 'shot' });
        if (hit) {
          this.world.damage(hit, 17, this, { color: '#fff0a0', big: true });
          hit.vx += M.cos(this.tags.ang) * 420; hit.vy += M.sin(this.tags.ang) * 420;
          this.world.emit('shake', { amount: 7 });
        }
        this.vx -= M.cos(this.tags.ang) * 250; this.vy -= M.sin(this.tags.ang) * 250;
      }
    } else if (this.timer('aim', 3.3, dt, 1.8)) {
      this.tags.aim = 0.9;
      this.speedMult = 0.2;
    }
  }
  drawUnder(ctx) {
    if (!(this.tags.aim > 0)) return;
    const r = this.world.ray(this.x, this.y, this.tags.ang, this.team);
    ctx.save();
    ctx.strokeStyle = this.tags.aim < 0.22 ? 'rgba(255,60,60,0.95)' : 'rgba(255,40,40,0.5)';
    ctx.lineWidth = this.tags.aim < 0.22 ? 3 : 1.5;
    line(ctx, this.x, this.y, r.x2, r.y2);
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.strokeStyle = '#ff4040';
    ctx.lineWidth = r * 0.07;
    circle(ctx, 0, 0, r * 0.5); ctx.stroke();
    line(ctx, -r * 0.75, 0, -r * 0.2, 0); line(ctx, r * 0.2, 0, r * 0.75, 0);
    line(ctx, 0, -r * 0.75, 0, -r * 0.2); line(ctx, 0, r * 0.2, 0, r * 0.75);
    ctx.fillStyle = '#ff4040';
    circle(ctx, 0, 0, r * 0.08); ctx.fill();
  }
}

// ===================================================================== RICOCHET
export class RicochetBall extends Ball {
  static meta = {
    id: 'ricochet', color: '#b07a2a',
    name: { fr: 'Ricochet', en: 'Ricochet' },
    desc: {
      fr: 'Tire des balles qui rebondissent sur les murs et font plus mal à chaque rebond.',
      en: 'Fires bullets that bounce off walls and hit harder with every bounce.',
    },
  };
  update(dt) {
    if (this.timer('shot', 1.25, dt, 0.8)) {
      const t = this.target();
      if (!t) return;
      shoot(this, aim(this, t, 0.5), 560, {
        r: 5, damage: 2, bounces: 5, life: 4, color: '#ffd27a',
        onBounce() { this.damage += 2; this.r += 0.6; this.world.emit('spark', { x: this.x, y: this.y, color: '#ffd27a' }); },
      });
    }
  }
  drawIcon(ctx, r) {
    ctx.strokeStyle = '#ffe3a8';
    ctx.lineWidth = r * 0.08;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, -r * 0.5); ctx.lineTo(-r * 0.2, r * 0.5); ctx.lineTo(r * 0.2, -r * 0.3); ctx.lineTo(r * 0.65, r * 0.4);
    ctx.stroke();
    ctx.fillStyle = '#ffe3a8';
    circle(ctx, r * 0.65, r * 0.4, r * 0.13); ctx.fill();
  }
}

// ==================================================================== BOOMERANG
class Boomerang extends Projectile {
  update(dt) {
    this.age += dt;
    if (!this.back && this.age > 0.55) { this.back = true; this.hitSet.clear(); }
    if (this.back) {
      const o = this.owner;
      if (o.dead) { this.kill(); return; }
      const n = M.normalize(o.x - this.x, o.y - this.y);
      if (n.d < o.r) { this.kill(); return; }
      this.vx = n.x * 620; this.vy = n.y * 620;
    }
    const S = this.world.size;
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (!this.back && (this.x < 8 || this.x > S - 8 || this.y < 8 || this.y > S - 8)) { this.back = true; this.hitSet.clear(); }
    this.x = M.clamp(this.x, 8, S - 8); this.y = M.clamp(this.y, 8, S - 8);
    for (const t of this.world.balls) {
      if (t.team === this.team || !t.targetable || this.hitSet.has(t.id)) continue;
      if (M.hypot(t.x - this.x, t.y - this.y) < t.r + this.r) {
        this.hitSet.add(t.id);
        this.world.damage(t, 6, this.owner, { x: this.x, y: this.y, color: '#ffcf5a' });
      }
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.age * 18);
    ctx.fillStyle = '#c98a2a';
    ctx.strokeStyle = '#3a2408';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, -4); ctx.lineTo(4, -4); ctx.lineTo(4, 14); ctx.lineTo(-4, 14); ctx.lineTo(-4, 4); ctx.lineTo(-14, 4);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
export class BoomerangBall extends Ball {
  static meta = {
    id: 'boomerang', color: '#d2691e',
    name: { fr: 'Boomerang', en: 'Boomerang' },
    desc: {
      fr: 'Lance un boomerang qui traverse les ennemis à l\'aller… et au retour.',
      en: 'Throws a boomerang that slices through enemies on the way out… and back.',
    },
  };
  update(dt) {
    const active = this.world.entities.some(e => e instanceof Boomerang && e.owner === this);
    if (!active && this.timer('throw', 1.6, dt, 1)) {
      const t = this.target();
      if (!t) return;
      const a = aim(this, t, 0.15);
      this.world.spawn(new Boomerang(this.world, this, {
        x: this.x, y: this.y, vx: M.cos(a) * 640, vy: M.sin(a) * 640, r: 13, life: 99, pierce: true,
      }));
    }
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#ffe0b0';
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, -r * 0.45); ctx.quadraticCurveTo(0, -r * 0.1, r * 0.6, -r * 0.45);
    ctx.lineTo(r * 0.1, r * 0.55); ctx.quadraticCurveTo(0, r * 0.05, -r * 0.1, r * 0.55);
    ctx.closePath();
    ctx.fill();
  }
}

// ======================================================================== FUSÉE
export class RocketBall extends Ball {
  static meta = {
    id: 'rocket', color: '#5a6470',
    name: { fr: 'Fusée', en: 'Rocket' },
    desc: {
      fr: 'Tire des missiles à tête chercheuse qui explosent à l\'impact.',
      en: 'Fires homing missiles that explode on impact.',
    },
  };
  update(dt) {
    if (this.timer('missile', 2.4, dt, 1)) {
      const t = this.target();
      if (!t) return;
      const boom = function () { this.world.explode(this.x, this.y, 45, 6, this.owner, { color: '#ff9a3a', knock: 250 }); };
      shoot(this, aim(this, t, 1.2), 360, {
        r: 6, life: 3.2, homing: 3.4, shape: 'bolt', color: '#e8e8e8', trail: '#bbbbbb',
        onHit: boom,
        expire() { boom.call(this); this.kill(); },
      });
    }
  }
  drawIcon(ctx, r) {
    ctx.save();
    ctx.rotate(-0.8);
    ctx.fillStyle = '#f0f0f0';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.7); ctx.quadraticCurveTo(r * 0.3, -r * 0.3, r * 0.2, r * 0.35); ctx.lineTo(-r * 0.2, r * 0.35);
    ctx.quadraticCurveTo(-r * 0.3, -r * 0.3, 0, -r * 0.7);
    ctx.fill();
    ctx.fillStyle = '#ff5a3a';
    ctx.beginPath();
    ctx.moveTo(-r * 0.15, r * 0.35); ctx.lineTo(0, r * 0.7); ctx.lineTo(r * 0.15, r * 0.35);
    ctx.fill();
    ctx.restore();
  }
}

// ===================================================================== CHASSEUR
export class HunterBall extends Ball {
  static meta = {
    id: 'hunter', color: '#6b4a2b',
    name: { fr: 'Chasseur', en: 'Hunter' },
    desc: {
      fr: 'Ses flèches marquent la proie : chaque marque augmente tous les dégâts qu\'il lui inflige.',
      en: 'Its arrows mark the prey: every mark increases all the damage it deals to it.',
    },
  };
  markKey() { return 'mark' + this.id; }
  update(dt) {
    if (this.timer('arrow', 1.5, dt, 0.8)) {
      const t = this.target();
      if (!t) return;
      const key = this.markKey();
      shoot(this, aim(this, t, 0.05), 900, {
        r: 4, damage: 3, shape: 'spike', color: '#f5deb3',
        onHit(b) {
          b.tags[key] = M.min(8, (b.tags[key] || 0) + 1);
          Projectile.prototype.onHit.call(this, b);
        },
      });
    }
  }
  modifyOutgoing(a, target) { return a * (1 + 0.15 * (target.tags[this.markKey()] || 0)); }
  drawOver(ctx) {
    const key = this.markKey();
    ctx.save();
    ctx.fillStyle = '#ff5a3a';
    for (const b of this.world.balls) {
      const n = b.tags[key];
      if (!n || b.dead) continue;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.32;
        ctx.beginPath();
        const x = b.x + Math.cos(a) * (b.r + 8), y = b.y + Math.sin(a) * (b.r + 8);
        ctx.moveTo(x, y - 4); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3, y);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.strokeStyle = '#f5deb3';
    ctx.lineWidth = r * 0.07;
    ctx.beginPath(); ctx.arc(-r * 0.2, 0, r * 0.6, -1.2, 1.2); ctx.stroke();
    line(ctx, -r * 0.2 + Math.cos(-1.2) * r * 0.6, Math.sin(-1.2) * r * 0.6, -r * 0.2 + Math.cos(1.2) * r * 0.6, Math.sin(1.2) * r * 0.6);
    line(ctx, -r * 0.3, 0, r * 0.65, 0);
    ctx.fillStyle = '#f5deb3';
    ctx.beginPath(); ctx.moveTo(r * 0.75, 0); ctx.lineTo(r * 0.55, -r * 0.12); ctx.lineTo(r * 0.55, r * 0.12); ctx.fill();
  }
}

// ======================================================================== BULLE
export class BubbleBall extends Ball {
  static meta = {
    id: 'bubble', color: '#5ec8e5',
    name: { fr: 'Bulle', en: 'Bubble' },
    desc: {
      fr: 'Enferme l\'ennemi dans une bulle : il flotte, immobile, et le prochain coup fait double dégât.',
      en: 'Traps the enemy in a bubble: it floats helplessly and the next hit deals double damage.',
    },
  };
  update(dt) {
    if (this.timer('bubble', 2.8, dt, 1.2)) {
      const t = this.target();
      if (!t) return;
      shoot(this, aim(this, t, 0.1), 280, {
        r: 12, damage: 2, homing: 1.6, life: 4, color: 'rgba(200,240,255,0.6)',
        onHit(b) {
          this.world.damage(b, this.damage, this.owner, { color: '#d8f6ff' });
          if (b.st.invuln <= 0 && !b.dead) { b.st.bubble = 1.6; b.vx *= 0.2; b.vy *= 0.2; }
        },
      });
    }
  }
  drawIcon(ctx, r) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = r * 0.06;
    for (const [x, y, rr] of [[-0.2, 0.1, 0.38], [0.35, -0.3, 0.2], [0.35, 0.4, 0.14]]) {
      circle(ctx, x * r, y * r, rr * r); ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    circle(ctx, -0.32 * r, -0.05 * r, 0.08 * r); ctx.fill();
  }
}

// ======================================================================== ACIDE
export class AcidBall extends Ball {
  static meta = {
    id: 'acid', color: '#7fbf1f',
    name: { fr: 'Acide', en: 'Acid' },
    desc: {
      fr: 'Crache de l\'acide corrosif : chaque dose affaiblit les dégâts infligés par l\'ennemi.',
      en: 'Spits corrosive acid: each dose weakens the damage the enemy deals.',
    },
  };
  update(dt) {
    if (this.timer('spit', 1.7, dt, 1)) {
      const t = this.target();
      if (!t) return;
      shoot(this, aim(this, t, 0.15), 480, {
        r: 7, damage: 3, color: '#b6ff3a',
        onHit(b) {
          Projectile.prototype.onHit.call(this, b);
          const n = b.st.weaken > 0 ? M.min(5, (b.tags.acid || 0) + 1) : 1;
          b.tags.acid = n;
          b.weaken(4, 1 - 0.09 * n);
          b.addDot('acid', 2, 2, this.owner, '#b6ff3a');
        },
      });
    }
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#e6ff9a';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.65);
    ctx.quadraticCurveTo(r * 0.45, -r * 0.05, r * 0.38, r * 0.25);
    ctx.arc(0, r * 0.25, r * 0.38, 0, Math.PI);
    ctx.quadraticCurveTo(-r * 0.45, -r * 0.05, 0, -r * 0.65);
    ctx.fill();
    ctx.fillStyle = '#5a8a10';
    circle(ctx, -r * 0.1, r * 0.25, r * 0.08); ctx.fill();
    circle(ctx, r * 0.12, r * 0.05, r * 0.06); ctx.fill();
  }
}

// ======================================================================= HYPNOSE
export class HypnoBall extends Ball {
  static meta = {
    id: 'hypno', color: '#a43fbf',
    name: { fr: 'Hypnose', en: 'Hypno' },
    desc: {
      fr: 'Sa spirale hypnotique bloque les capacités de l\'ennemi et lui fait perdre le nord.',
      en: 'Its hypnotic spiral shuts down the enemy\'s abilities and scrambles its direction.',
    },
  };
  update(dt) {
    const key = 'hyp' + this.id;
    for (const b of this.world.balls) {
      if (b.tags[key] > 0) {
        b.tags[key] -= dt;
        b.rotateVelocity(M.sin(this.world.time * 6) * 3 * dt);
      }
    }
    if (this.timer('spiral', 3.6, dt, 1.5)) {
      const t = this.target();
      if (!t) return;
      shoot(this, aim(this, t, 0.1), 340, {
        r: 10, damage: 4, homing: 2.2, color: '#e3a8ff', shape: 'star',
        onHit(b) {
          Projectile.prototype.onHit.call(this, b);
          b.silence(2.3);
          b.tags[key] = 2.3;
        },
      });
    }
  }
  drawIcon(ctx, r) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = r * 0.07;
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) {
      const a = i * 0.32;
      const rr = (i / 60) * r * 0.75;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.stroke();
  }
  drawOver(ctx) {
    const key = 'hyp' + this.id;
    ctx.save();
    ctx.fillStyle = '#e3a8ff';
    for (const b of this.world.balls) {
      if (!(b.tags[key] > 0) || b.dead) continue;
      for (let i = 0; i < 3; i++) {
        const a = this.world.time * 4 + i * 2.1;
        star(ctx, b.x + Math.cos(a) * (b.r + 6), b.y - b.r * 0.6 + Math.sin(a) * 6, 5, 4);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

export const PROJECTILES = [SniperBall, RicochetBall, BoomerangBall, RocketBall, HunterBall, BubbleBall, AcidBall, HypnoBall];
