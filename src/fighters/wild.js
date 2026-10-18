/* Combattants imprévisibles : Dé, Dynamite, Chrono, Ange, Berserker, Yin-Yang, Supernova, Boule de neige. */
import { Ball } from '../sim/ball.js';
import * as M from '../sim/dmath.js';
import { shoot, aim, circle, line } from './helpers.js';

// =========================================================================== DÉ
const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
export class DiceBall extends Ball {
  static meta = {
    id: 'dice', color: '#f2f2f2',
    name: { fr: 'Dé', en: 'Dice' },
    desc: {
      fr: 'Lance un dé toutes les 3 s : 1 il se blesse, 2 soin, 3 vitesse, 4 bouclier, 5 foudre, 6 triple tir.',
      en: 'Rolls a die every 3 s: 1 hurts itself, 2 heal, 3 speed, 4 shield, 5 lightning, 6 triple shot.',
    },
  };
  init() { this.tags.face = 6; }
  update(dt) {
    if (!this.timer('roll', 3, dt, 1.5)) return;
    const w = this.world;
    const f = this.tags.face = w.rng.int(6) + 1;
    w.emit('text', { x: this.x, y: this.y - this.r - 16, text: `🎲${f}`, color: '#ffffff' });
    const t = this.target();
    switch (f) {
      case 1: w.damage(this, 4, this, { pure: true, color: '#ff6060' }); break;
      case 2: w.heal(this, 9, this); break;
      case 3: this.haste(3, 1.7); break;
      case 4: this.st.invuln = 1.8; break;
      case 5:
        if (t) {
          w.emit('zap', { x1: t.x, y1: t.y - 400, x2: t.x, y2: t.y, color: '#fff27a', big: true });
          w.damage(t, 11, this, { color: '#fff27a', big: true });
        }
        break;
      case 6:
        if (t) for (const da of [-0.25, 0, 0.25]) shoot(this, aim(this, t) + da, 560, { r: 6, damage: 5, color: '#ffffff' });
        break;
    }
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#222';
    for (const [x, y] of PIPS[this.tags?.face || 6]) {
      circle(ctx, x * r * 0.38, y * r * 0.38, r * 0.12); ctx.fill();
    }
  }
}

// ===================================================================== DYNAMITE
export class DynamiteBall extends Ball {
  static meta = {
    id: 'dynamite', color: '#c0392b',
    name: { fr: 'Dynamite', en: 'Dynamite' },
    desc: {
      fr: 'Une mèche se consume… BOUM : énorme explosion autour d\'elle (elle en prend un peu aussi). Et ça recommence.',
      en: 'A fuse burns down… BOOM: a huge explosion around it (it takes a little too). Then again.',
    },
  };
  init() { this.tags.fuse = 4; }
  update(dt) {
    this.tags.fuse -= dt * this.abilityRate;
    if (this.tags.fuse <= 0) {
      this.tags.fuse = 4;
      this.world.explode(this.x, this.y, 195, 26, this, { color: '#ff7a1a', knock: 600, selfDamage: 3, falloff: true });
      this.world.emit('shake', { amount: 14 });
    }
  }
  drawOver(ctx) {
    const f = this.tags.fuse;
    ctx.save();
    ctx.font = `900 ${this.r * 0.5}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = f < 1.5 ? '#ff3030' : '#ffe066';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText(Math.ceil(f), this.x, this.y - this.r - 8);
    ctx.fillText(Math.ceil(f), this.x, this.y - this.r - 8);
    if (f < 1.5) {
      ctx.globalAlpha = 0.3 + 0.3 * Math.sin(this.world.time * 30);
      ctx.strokeStyle = '#ff3030';
      circle(ctx, this.x, this.y, 195); ctx.stroke();
    }
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#8a1a10';
    for (let i = -1; i <= 1; i++) ctx.fillRect(i * r * 0.28 - r * 0.12, -r * 0.4, r * 0.24, r * 0.85);
    ctx.fillStyle = '#222';
    ctx.fillRect(-r * 0.45, -r * 0.05, r * 0.9, r * 0.1);
    ctx.strokeStyle = '#d9b36a';
    ctx.lineWidth = r * 0.06;
    ctx.beginPath(); ctx.moveTo(0, -r * 0.4); ctx.quadraticCurveTo(r * 0.3, -r * 0.7, r * 0.15, -r * 0.8); ctx.stroke();
    ctx.fillStyle = '#ffcc33';
    circle(ctx, r * 0.15, -r * 0.82, r * 0.1); ctx.fill();
  }
}

// ======================================================================= CHRONO
export class ChronoBall extends Ball {
  static meta = {
    id: 'chrono', color: '#3a7bd5',
    name: { fr: 'Chrono', en: 'Chrono' },
    desc: {
      fr: 'Ralentit le temps autour de lui. Remonte le temps : revient 3 s en arrière, récupère des PV et inflige le paradoxe à l\'ennemi.',
      en: 'Slows time around it. Rewinds: goes back 3 s, recovers HP and inflicts the paradox on the enemy.',
    },
  };
  init() { this.hist = []; this.timers.snap = 0; }
  update(dt) {
    this.timers.snap -= dt;
    if (this.timers.snap <= 0) {
      this.timers.snap = 0.1;
      this.hist.push({ x: this.x, y: this.y, hp: this.hp, vx: this.vx, vy: this.vy });
      if (this.hist.length > 30) this.hist.shift();
    }
    if (this.timer('rewind', 5, dt, 5)) {
      const old = this.hist[0];
      if (!old) return;
      this.world.emit('blink', { x1: this.x, y1: this.y, x2: old.x, y2: old.y, color: '#8ec5ff', r: this.r });
      this.x = old.x; this.y = old.y; this.vx = old.vx; this.vy = old.vy;
      const healed = old.hp > this.hp ? this.world.heal(this, (old.hp - this.hp) * 0.75, this) : 0;
      this.hist = [];
      // paradoxe : l'ennemi encaisse une partie du temps rembobiné
      const t = this.target({ mainOnly: true });
      if (t) {
        this.world.emit('zap', { x1: this.x, y1: this.y, x2: t.x, y2: t.y, color: '#8ec5ff' });
        this.world.damage(t, 3 + healed * 0.4, this, { color: '#8ec5ff', big: true });
        t.stun(0.4);
      }
    }
    // champ temporel : les ennemis proches sont ralentis
    if (this.abilityRate > 0) {
      for (const b of this.world.enemiesOf(this)) if (b.targetable && this.dist(b) < 140 + b.r) b.applySlow(0.15, 0.78, 0.85);
    }
  }
  drawUnder(ctx) {
    const o = this.hist[0];
    if (!o) return;
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#8ec5ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 6]);
    circle(ctx, o.x, o.y, this.r); ctx.stroke();
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = r * 0.07;
    circle(ctx, 0, 0, r * 0.6); ctx.stroke();
    ctx.lineCap = 'round';
    const t = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
    line(ctx, 0, 0, Math.cos(-t * 2) * r * 0.45, Math.sin(-t * 2) * r * 0.45);
    line(ctx, 0, 0, 0, -r * 0.3);
  }
}

// ========================================================================= ANGE
export class AngelBall extends Ball {
  static meta = {
    id: 'angel', color: '#f7e7a8',
    name: { fr: 'Ange', en: 'Angel' },
    desc: {
      fr: 'Ressuscite une fois avec 40 PV. Lance des plumes sacrées.',
      en: 'Revives once with 40 HP. Throws holy feathers.',
    },
  };
  update(dt) {
    if (this.timer('feathers', 2.3, dt, 1.2)) {
      const t = this.target();
      if (!t) return;
      for (const da of [-0.3, 0, 0.3]) shoot(this, aim(this, t) + da, 520, { r: 5, damage: 2.5, color: '#fffbe0', shape: 'spike' });
    }
  }
  preventDeath() {
    if (this.tags.revived) return false;
    this.tags.revived = 1;
    this.hp = 40;
    this.st.invuln = 1.6;
    this.dots = [];
    this.world.emit('revive', { x: this.x, y: this.y, color: '#fff6c0' });
    this.world.emit('shake', { amount: 10 });
    return true;
  }
  drawOver(ctx) {
    if (this.tags.revived) return;
    ctx.save();
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y - this.r - 6, this.r * 0.55, this.r * 0.16, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#ffffff';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.1, 0);
      ctx.quadraticCurveTo(s * r * 0.8, -r * 0.7, s * r * 0.75, r * 0.1);
      ctx.quadraticCurveTo(s * r * 0.5, r * 0.05, s * r * 0.1, r * 0.25);
      ctx.fill();
    }
  }
}

// ==================================================================== BERSERKER
export class BerserkerBall extends Ball {
  static meta = {
    id: 'berserker', color: '#8b0000',
    name: { fr: 'Berserker', en: 'Berserker' },
    desc: {
      fr: 'Plus il est blessé, plus il frappe fort et vite. Charge l\'ennemi par moments.',
      en: 'The more hurt it is, the harder and faster it hits. Charges the enemy at times.',
    },
  };
  rage() { return 1 - M.max(0, this.hp) / this.maxHp; }
  speedFactor() { return 1 + 0.45 * this.rage(); }
  modifyOutgoing(a) { return a * (1 + 1.6 * this.rage()); }
  contactBonus() { return 4; }
  update(dt) {
    if (this.timer('charge', 2.2, dt, 1)) {
      const t = this.target({ mainOnly: true });
      if (t) this.moveToward(t.x, t.y, 600 + 300 * this.rage());
    }
  }
  drawUnder(ctx) {
    const k = this.rage();
    if (k < 0.2) return;
    ctx.save();
    ctx.globalAlpha = k * 0.6;
    const g = ctx.createRadialGradient(this.x, this.y, this.r * 0.8, this.x, this.y, this.r * 1.6);
    g.addColorStop(0, 'rgba(255,30,0,0.8)');
    g.addColorStop(1, 'rgba(255,30,0,0)');
    ctx.fillStyle = g;
    circle(ctx, this.x, this.y, this.r * 1.6); ctx.fill();
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.strokeStyle = '#ffd0c0';
    ctx.lineWidth = r * 0.1;
    ctx.lineCap = 'round';
    line(ctx, -r * 0.5, -r * 0.35, -r * 0.1, -r * 0.15);
    line(ctx, r * 0.5, -r * 0.35, r * 0.1, -r * 0.15);
    ctx.beginPath(); ctx.arc(0, r * 0.45, r * 0.3, Math.PI + 0.4, -0.4); ctx.stroke();
  }
}

// ===================================================================== YIN-YANG
export class YinYangBall extends Ball {
  static meta = {
    id: 'yinyang', color: '#777777',
    name: { fr: 'Yin-Yang', en: 'Yin-Yang' },
    desc: {
      fr: 'Alterne Yin (ses dégâts le soignent) et Yang (ses dégâts sont presque doublés).',
      en: 'Alternates Yin (its damage heals it) and Yang (its damage is nearly doubled).',
    },
  };
  init() { this.tags.yang = 0; this.tags.rot = 0; }
  update(dt) {
    this.tags.rot += dt * 2;
    if (this.timer('mode', 3.5, dt)) {
      this.tags.yang = 1 - this.tags.yang;
      this.world.emit('ring', { x: this.x, y: this.y, r: this.r + 20, color: this.tags.yang ? '#222222' : '#ffffff' });
    }
    if (this.timer('orb', 1.3, dt, 0.8)) {
      const t = this.target();
      if (t) shoot(this, aim(this, t, 0.15), 500, { r: 7, damage: 4, color: this.tags.yang ? '#111111' : '#ffffff' });
    }
  }
  modifyOutgoing(a) { return this.tags.yang ? a * 1.75 : a; }
  onDealtDamage(t, a) { if (!this.tags.yang) this.world.heal(this, a * 0.8, null); }
  drawIcon(ctx, r) {
    const rot = this.tags?.rot || 0;
    ctx.save();
    ctx.rotate(rot);
    ctx.fillStyle = '#ffffff';
    circle(ctx, 0, 0, r * 0.75); ctx.fill();
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.75, -Math.PI / 2, Math.PI / 2);
    ctx.arc(0, r * 0.375, r * 0.375, Math.PI / 2, -Math.PI / 2, true);
    ctx.arc(0, -r * 0.375, r * 0.375, Math.PI / 2, -Math.PI / 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff'; circle(ctx, 0, r * 0.375, r * 0.11); ctx.fill();
    ctx.fillStyle = '#111111'; circle(ctx, 0, -r * 0.375, r * 0.11); ctx.fill();
    ctx.restore();
  }
}

// ==================================================================== SUPERNOVA
export class SupernovaBall extends Ball {
  static meta = {
    id: 'supernova', color: '#ff9f1c',
    name: { fr: 'Supernova', en: 'Supernova' },
    desc: {
      fr: 'Accumule de l\'énergie en frappant et en encaissant. Pleine : elle explose en supernova géante.',
      en: 'Builds energy by hitting and getting hit. When full, it erupts in a giant supernova.',
    },
  };
  init() { this.tags.energy = 0; }
  update(dt) {
    this.tags.energy += 8 * dt * this.abilityRate;
    if (this.tags.energy >= 100) {
      this.tags.energy = 0;
      this.world.explode(this.x, this.y, 230, 26, this, { color: '#fff1a8', knock: 650, falloff: true });
      this.world.emit('shake', { amount: 16 });
      this.world.emit('flash', { color: '#fff1a8' });
    }
  }
  onDealtDamage(t, a, o) { if (o.kind !== 'dot') this.tags.energy += a * 2; }
  onDamaged(a, src, o) { this.tags.energy += a * 1.5; }
  drawUnder(ctx) {
    const k = this.tags.energy / 100;
    ctx.save();
    ctx.globalAlpha = 0.15 + 0.5 * k;
    const g = ctx.createRadialGradient(this.x, this.y, this.r * 0.5, this.x, this.y, this.r * (1.3 + k));
    g.addColorStop(0, 'rgba(255,240,160,1)');
    g.addColorStop(1, 'rgba(255,160,30,0)');
    ctx.fillStyle = g;
    circle(ctx, this.x, this.y, this.r * (1.3 + k)); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = '#fff1a8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r + 6, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = '#fff6c8';
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const rr = i % 2 ? r * 0.25 : r * 0.7;
      const a = (i / 16) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
}

// =============================================================== BOULE DE NEIGE
export class SnowballBall extends Ball {
  static meta = {
    id: 'snowball', color: '#dfefff', radius: 30,
    name: { fr: 'Boule de neige', en: 'Snowball' },
    desc: {
      fr: 'Grossit à chaque rebond sur un mur et écrase de plus en plus fort. Un gros coup la fait fondre.',
      en: 'Grows with every wall bounce and crushes harder and harder. A big hit melts it down.',
    },
  };
  onWall() { if (this.abilityRate > 0) this.r = M.min(this.baseR * 1.75, this.r + 1.6 * this.scale); }
  contactBonus() { return (this.r / this.baseR - 1) * 16; }
  onDamaged(a, src, o) {
    if (a >= 7 && o.kind !== 'dot') {
      this.r = M.max(this.baseR, this.r - 6 * this.scale);
      this.world.emit('burst', { x: this.x, y: this.y, color: '#ffffff', n: 14 });
    }
  }
  drawIcon(ctx, r) {
    ctx.fillStyle = 'rgba(160,190,230,0.6)';
    for (const [x, y, s] of [[-0.3, -0.2, 0.12], [0.25, 0.1, 0.15], [-0.05, 0.4, 0.1], [0.35, -0.35, 0.08]]) {
      circle(ctx, x * r, y * r, s * r); ctx.fill();
    }
  }
}

export const WILD = [DiceBall, DynamiteBall, ChronoBall, AngelBall, BerserkerBall, YinYangBall, SupernovaBall, SnowballBall];
