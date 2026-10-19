/* Apparence personnalisable : thèmes d'arène, traînées, effets de victoire (affichage seulement). */

export const THEMES = {
  classic: { bg: ['#141c4a', '#070a20'], floor: ['#1b2459', '#10173f'], grid: 'rgba(255,255,255,0.035)', walls: ['#6a7bd6', '#5263bb', '#1d2558', '#28316c'], edge: '#070b22' },
  lava: { bg: ['#3a1208', '#120402'], floor: ['#2b0f08', '#1a0603'], grid: 'rgba(255,120,40,0.08)', walls: ['#c2461b', '#9a3412', '#3d1206', '#521a08'], edge: '#100301', decor: 'lava' },
  ice: { bg: ['#1d4a6e', '#081a2b'], floor: ['#bfe3f5', '#8cc4e3'], grid: 'rgba(255,255,255,0.35)', walls: ['#eaf8ff', '#cfeaf7', '#5f9cbf', '#7fb5d3'], edge: '#163a52' },
  neon: { bg: ['#1a0630', '#050010'], floor: ['#0d0420', '#08021a'], grid: 'rgba(255,40,220,0.25)', walls: ['#ff3ad8', '#c22fb0', '#2a0a6b', '#3d1290'], edge: '#00e5ff', glow: true },
  space: { bg: ['#0b0b26', '#000005'], floor: ['#090b1f', '#03040f'], grid: 'rgba(160,180,255,0.06)', walls: ['#5a5f8c', '#474b73', '#1a1c33', '#24264a'], edge: '#000000', decor: 'stars' },
  candy: { bg: ['#ffb6d9', '#c96bb0'], floor: ['#ffe3f1', '#ffd0e8'], grid: 'rgba(255,120,190,0.25)', walls: ['#ff7ac0', '#ff5eae', '#b03a7f', '#c84a92'], edge: '#7a1f55' },
  gold: { bg: ['#4a3a08', '#140f02'], floor: ['#3b2f0a', '#241c05'], grid: 'rgba(255,210,58,0.12)', walls: ['#ffe066', '#e0b520', '#7a5d08', '#94720c'], edge: '#2b2003' },
};

// étoiles fixes pour le thème « espace » (positions relatives)
const STARS = Array.from({ length: 70 }, (_, i) => ({ x: ((i * 7919) % 1000) / 1000, y: ((i * 104729) % 1000) / 1000, r: 0.6 + ((i * 31) % 10) / 8 }));

/** Décor dessiné sur le sol de l'arène. */
export function drawThemeDecor(ctx, theme, S, time) {
  if (theme.decor === 'stars') {
    for (const s of STARS) {
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(time * 2 + s.x * 40);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(s.x * S, s.y * S, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (theme.decor === 'lava') {
    ctx.strokeStyle = 'rgba(255,110,30,0.35)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const y0 = ((i * 97) % 11) / 11 * S;
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(time * 1.5 + i);
      ctx.beginPath();
      ctx.moveTo(0, y0);
      for (let x = 0; x <= S; x += 55) ctx.lineTo(x, y0 + Math.sin(x * 0.05 + i) * 18);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------- traînées
const RAINBOW = ['#ff4d4d', '#ffa53a', '#ffe14a', '#5dff6b', '#3ab0ff', '#9b5dff'];

/** Ajoute les particules de traînée derrière une balle (appelé à chaque image). */
export function spawnTrail(type, b, particles, time) {
  const sp = Math.hypot(b.vx, b.vy);
  if (sp < 40 || Math.random() > 0.85) return;
  const n = { x: -b.vx / sp, y: -b.vy / sp };
  const x = b.x + n.x * b.r * 0.9 + (Math.random() - 0.5) * b.r * 0.6;
  const y = b.y - b.z + n.y * b.r * 0.9 + (Math.random() - 0.5) * b.r * 0.6;
  const base = { x, y, vx: n.x * 30 + (Math.random() - 0.5) * 20, vy: n.y * 30 + (Math.random() - 0.5) * 20, life: 0.6, max: 0.6, size: 3 };
  switch (type) {
    case 'stars': particles.push({ ...base, shape: 'star', size: 5.5, color: Math.random() < 0.5 ? '#ffe066' : '#ffffff' }); break;
    case 'fire': particles.push({ ...base, vy: base.vy - 40, size: 5, life: 0.45, max: 0.45, color: Math.random() < 0.5 ? '#ff8a1a' : '#ffd23a' }); break;
    case 'bubbles': particles.push({ ...base, vy: base.vy - 25, shape: 'ring', size: 4 + Math.random() * 3, life: 0.8, max: 0.8, color: '#bff4ff' }); break;
    case 'rainbow': particles.push({ ...base, size: 6.5, life: 0.7, max: 0.7, color: RAINBOW[Math.floor(time * 12) % RAINBOW.length] }); break;
    case 'lightning': particles.push({ ...base, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, size: 2, life: 0.25, max: 0.25, color: Math.random() < 0.5 ? '#8fdcff' : '#ffffff' }); break;
    case 'hearts': particles.push({ ...base, vy: base.vy - 30, shape: 'heart', size: 5, life: 0.8, max: 0.8, color: '#ff5a8a' }); break;
    case 'pixels': particles.push({ ...base, shape: 'square', size: 4, life: 0.7, max: 0.7, color: RAINBOW[(Math.random() * RAINBOW.length) | 0] }); break;
  }
}

// ------------------------------------------------------------- victoire
/** Effet plein écran à la victoire. update(dt, w, h) puis draw(ctx). */
export class VictoryFx {
  constructor(type, w, h) {
    this.type = type;
    this.t = 0;
    this.p = [];
    this.w = w; this.h = h;
    this.flash = 0;
  }
  update(dt) {
    this.t += dt;
    const { w, h } = this;
    const active = this.t < 3;
    if (active) {
      if (this.type === 'confetti') {
        for (let i = 0; i < 6; i++) this.p.push({ x: Math.random() * w, y: -10, vx: (Math.random() - 0.5) * 80, vy: 150 + Math.random() * 150, life: 4, max: 4, size: 6 + Math.random() * 5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10, color: RAINBOW[(Math.random() * 6) | 0], shape: 'confetti' });
      } else if (this.type === 'fireworks') {
        if (Math.random() < dt * 3) {
          const x = w * (0.15 + Math.random() * 0.7), y = h * (0.15 + Math.random() * 0.4), c = RAINBOW[(Math.random() * 6) | 0];
          for (let i = 0; i < 50; i++) {
            const a = Math.random() * Math.PI * 2, s = 80 + Math.random() * 220;
            this.p.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 120, life: 1.4, max: 1.4, size: 2.5, color: c });
          }
        }
      } else if (this.type === 'lightning') {
        if (Math.random() < dt * 4) { this.bolt = { x: w * Math.random(), life: 0.2 }; this.flash = 0.35; }
      } else if (this.type === 'gold') {
        for (let i = 0; i < 4; i++) this.p.push({ x: Math.random() * w, y: -10, vx: 0, vy: 200 + Math.random() * 200, life: 4, max: 4, size: 7, rot: Math.random() * 6, vr: 6, color: '#ffd23a', shape: 'coin' });
      }
    }
    for (const p of this.p) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.g) p.vy += p.g * dt;
      if (p.vr) p.rot += p.vr * dt;
    }
    this.p = this.p.filter(p => p.life > 0 && p.y < h + 20);
    if (this.bolt) this.bolt.life -= dt;
    this.flash = Math.max(0, this.flash - dt * 2);
    return active || this.p.length > 0;
  }
  draw(ctx) {
    if (this.flash > 0) { ctx.fillStyle = `rgba(220,240,255,${this.flash})`; ctx.fillRect(0, 0, this.w, this.h); }
    if (this.bolt && this.bolt.life > 0) {
      ctx.save();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.shadowColor = '#8fdcff'; ctx.shadowBlur = 20;
      ctx.beginPath();
      let x = this.bolt.x;
      ctx.moveTo(x, 0);
      for (let y = 0; y < this.h; y += 40) { x += (Math.random() - 0.5) * 60; ctx.lineTo(x, y); }
      ctx.stroke();
      ctx.restore();
    }
    for (const p of this.p) {
      ctx.globalAlpha = Math.min(1, p.life / p.max * 2);
      ctx.fillStyle = p.color;
      if (p.shape === 'confetti' || p.shape === 'coin') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.shape === 'coin') {
          ctx.scale(Math.abs(Math.cos(p.rot)) + 0.15, 1);
          ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#a07a00'; ctx.lineWidth = 1.5; ctx.stroke();
        } else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
