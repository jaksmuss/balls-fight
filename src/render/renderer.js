/* Rendu Canvas 2D : arène, balles, entités, effets (particules, chiffres de dégâts,
 * éclairs, tremblement), ralenti et zoom sur le coup fatal, HUD des équipes.
 * Le rendu lit le monde sans jamais le modifier ; les effets visuels utilisent
 * Math.random librement (ils n'influencent pas la simulation). */
import { play } from '../audio.js';
import { fighterName } from '../i18n.js';
import { lightning, shade, rgba, star } from '../fighters/helpers.js';
import { THEMES, drawThemeDecor, spawnTrail, VictoryFx } from './style.js';

export const TEAM_COLORS = ['#3d9cff', '#ff4d5e'];
const FONT = '"Lilita One", "Arial Black", Impact, system-ui, sans-serif';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.view = { w: 0, h: 0, dpr: 1, scale: 1, ox: 0, oy: 0 };
    this.world = null;
    this.silent = false;   // pas de son (combat de démonstration derrière les menus)
    // apparence choisie par le joueur (thème, traînée, effet de victoire)
    this.style = { theme: 'classic', trail: 'none', trailTeams: null, victory: 'none', victoryTeam: null };
    this.reset();
  }

  sfx(name, vol, gap) { if (!this.silent) play(name, vol, gap); }

  /** trailTeams : liste des équipes qui portent la traînée ; victoryTeam : équipe dont la
   *  victoire déclenche l'effet ('any' = n'importe laquelle). */
  setStyle(style) { Object.assign(this.style, style); }

  reset() {
    this.victoryFx = null;
    this.victoryDelay = 0;
    this.particles = [];
    this.trailParts = [];  // traînée cosmétique (dessinée sous les balles)
    this.texts = [];
    this.fx = [];          // beams, zaps, rings, slashes, blinks
    this.trails = new Map();
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
    this.hitstop = 0;
    this.slowmo = 0;       // secondes réelles de ralenti restantes
    this.zoom = 1;
    this.focus = null;
    this.hudHp = new Map(); // barres de vie animées
  }

  attach(world, { names = [] } = {}) {
    this.world = world;
    this.names = names;
    this.reset();
  }

  resize() {
    const v = this.view;
    v.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    v.w = window.innerWidth;
    v.h = window.innerHeight;
    this.canvas.width = Math.round(v.w * v.dpr);
    this.canvas.height = Math.round(v.h * v.dpr);
    this.canvas.style.width = v.w + 'px';
    this.canvas.style.height = v.h + 'px';
    const S = this.world ? this.world.size : 600;
    const wall = 22;
    // marges du HUD (noms en haut, boutons en bas), réduites sur les écrans bas
    // zones sûres (encoche...) lues depuis les variables CSS
    const cs = getComputedStyle(document.documentElement);
    const px = n => parseFloat(cs.getPropertyValue(n)) || 0;
    v.safe = { t: px('--sat'), r: px('--sar'), b: px('--sab'), l: px('--sal') };
    const short = v.h < 600;
    const duo = (this.world?.teamSize || 1) > 1;
    const top = v.w < 600 ? 92 : short && !duo ? 62 : short ? 80 : 84, bottom = short ? 42 : 46, side = 10;
    const total = S + wall * 2;
    v.wall = wall;
    const sf = v.safe;
    const availW = v.w - side * 2 - sf.l - sf.r, availH = v.h - top - bottom - sf.t - sf.b;
    v.scale = Math.max(0.1, Math.min(availW / total, availH / total));
    v.ox = sf.l + (v.w - sf.l - sf.r - total * v.scale) / 2 + wall * v.scale;
    v.oy = sf.t + top + (availH - total * v.scale) / 2 + wall * v.scale;
  }

  /** Multiplicateur de temps de simulation (arrêt sur coup, ralenti final). */
  timeScale() {
    if (this.hitstop > 0) return 0.05;
    if (this.slowmo > 0) return 0.22;
    return 1;
  }

  // ------------------------------------------------------------- événements
  consume() {
    const w = this.world;
    if (!w) return;
    const evs = w.events;
    w.events = [];
    for (const e of evs) this.handle(e);
  }

  handle(e) {
    switch (e.type) {
      case 'hit': {
        const big = e.big;
        this.burst(e.x, e.y, big ? 22 : e.kind === 'dot' ? 2 : 10, ['#ffffff', e.color], big ? 340 : 200, big ? 4 : 3);
        if (e.kind !== 'dot' || e.amount >= 1.5) {
          const n = Math.max(1, Math.round(e.amount));
          this.texts.push({
            x: e.tx + (Math.random() - 0.5) * 20, y: e.ty - 4, vy: -80, life: 0.9, max: 0.9,
            text: `-${n}`, color: e.kind === 'dot' ? e.color : big ? '#ffe066' : '#ffffff',
            size: big ? 30 : e.kind === 'dot' ? 15 : 21,
          });
        }
        if (big) { this.shake = Math.max(this.shake, 6); this.hitstop = Math.max(this.hitstop, 0.06); this.sfx('big'); }
        else if (e.kind !== 'dot') this.sfx('hit', 0.6 + Math.min(0.4, e.amount / 10));
        break;
      }
      case 'heal':
        this.texts.push({ x: e.x, y: e.y - 6, vy: -60, life: 0.9, max: 0.9, text: `+${Math.max(1, Math.round(e.amount))}`, color: '#7dff9a', size: 18 });
        this.burst(e.x, e.y + 10, 6, ['#7dff9a', '#ffffff'], 80, 2.5, -60);
        this.sfx('heal', 1, 0.15);
        break;
      case 'block':
        this.burst(e.x, e.y, 5, ['#ffffff', '#9fd6ff'], 150, 2);
        this.sfx('block');
        break;
      case 'death':
        if (e.summon) { this.burst(e.x, e.y, 14, [e.color, '#ffffff'], 220, 3); this.sfx('pop'); break; }
        this.burst(e.x, e.y, 160, [e.color, '#ffffff', shade(e.color, 0.4), '#ffe066'], 620, 6);
        this.fx.push({ k: 'ring', x: e.x, y: e.y, r0: e.r, r1: e.r * 5, life: 0.6, max: 0.6, color: '#ffffff', w: 8 });
        this.shake = Math.max(this.shake, 16);
        this.flash = 0.5; this.flashColor = '#ffffff';
        this.sfx('death');
        break;
      case 'end':
        // ralenti + zoom sur la dernière mort
        this.slowmo = 1.4;
        this.focus = this.lastDeath || null;
        {
          const st = this.style;
          if (st.victory !== 'none' && e.team !== null && (st.victoryTeam === 'any' || st.victoryTeam === e.team)) this.victoryDelay = 1.2;
        }
        break;
      case 'explode':
        this.burst(e.x, e.y, 26 + e.r * 0.2, [e.color, '#ffffff', '#ffd27a'], e.r * 4, 4.5);
        this.fx.push({ k: 'ring', x: e.x, y: e.y, r0: 4, r1: e.r, life: 0.3, max: 0.3, color: e.color, w: 6, fill: true });
        this.shake = Math.max(this.shake, Math.min(14, e.r / 12));
        this.sfx('boom', 1, 0.08);
        break;
      case 'ring':
        this.fx.push({ k: 'ring', x: e.x, y: e.y, r0: 6, r1: e.r, life: 0.35, max: 0.35, color: e.color, w: 4 });
        break;
      case 'beam':
        this.fx.push({ k: 'beam', ...e, life: 0.22, max: 0.22 });
        if (e.width >= 6) this.sfx('shot');
        break;
      case 'zap':
        this.fx.push({ k: 'zap', ...e, life: e.big ? 0.25 : 0.13, max: e.big ? 0.25 : 0.13 });
        this.sfx('zap', 1, 0.06);
        if (e.big) this.flash = Math.max(this.flash, 0.25), this.flashColor = '#fffbe0';
        break;
      case 'slash':
        this.fx.push({ k: 'beam', x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, color: '#ffffff', width: 6, life: 0.25, max: 0.25 });
        this.shake = Math.max(this.shake, 6);
        this.sfx('shot');
        break;
      case 'blink':
        this.fx.push({ k: 'blink', ...e, life: 0.35, max: 0.35 });
        this.burst(e.x1, e.y1, 12, [e.color, '#ffffff'], 160, 3);
        this.burst(e.x2, e.y2, 12, [e.color, '#ffffff'], 160, 3);
        this.sfx('blink', 1, 0.08);
        break;
      case 'burst':
        this.burst(e.x, e.y, e.n || 12, [e.color, '#ffffff'], 220, 3);
        break;
      case 'spark':
        this.burst(e.x, e.y, 8, [e.color, '#ffffff'], 140, 2.5);
        break;
      case 'reflect':
        this.burst(e.x, e.y, 8, ['#ffffff', e.color], 180, 2.5);
        this.sfx('block');
        break;
      case 'pop':
        this.fx.push({ k: 'ring', x: e.x, y: e.y, r0: e.r, r1: e.r * 1.8, life: 0.25, max: 0.25, color: '#d8f6ff', w: 3 });
        this.sfx('pop');
        break;
      case 'revive':
        this.burst(e.x, e.y, 60, ['#fff6c0', '#ffffff', '#ffe066'], 300, 4, -100);
        this.fx.push({ k: 'ring', x: e.x, y: e.y, r0: 10, r1: 160, life: 0.6, max: 0.6, color: '#fff6c0', w: 6 });
        this.flash = 0.4; this.flashColor = '#fff6c0';
        this.sfx('heal');
        break;
      case 'flash':
        this.flash = 0.45; this.flashColor = e.color || '#ffffff';
        break;
      case 'shake':
        this.shake = Math.max(this.shake, e.amount);
        break;
      case 'text':
        this.texts.push({ x: e.x, y: e.y, vy: -50, life: 1, max: 1, text: e.text, color: e.color, size: 20 });
        break;
      case 'wall':
        if (e.speed > 500) this.burst(e.x, e.y, 4, ['#ffffff'], 120, 2);
        this.sfx('wall', Math.min(1, e.speed / 900), 0.05);
        break;
      case 'bump':
        this.sfx('bump', 1, 0.08);
        break;
      case 'sfx':
        this.sfx(e.name);
        break;
    }
    if (e.type === 'death' && !e.summon) this.lastDeath = { x: e.x, y: e.y };
  }

  burst(x, y, n, colors, speed, size, vyBias = 0) {
    const cap = 900;
    if (this.particles.length > cap) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (0.25 + Math.random() * 0.75) * speed;
      const life = 0.3 + Math.random() * 0.6;
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + vyBias, life, max: life,
        size: (0.5 + Math.random() * 0.6) * size, color: colors[(Math.random() * colors.length) | 0],
      });
    }
  }

  // ------------------------------------------------------------- mise à jour
  /** dt réel (s) : anime les effets. */
  update(dt) {
    if (this.hitstop > 0) this.hitstop -= dt;
    if (this.slowmo > 0) {
      this.slowmo -= dt;
      this.zoom += (1.35 - this.zoom) * Math.min(1, dt * 4);
    } else this.zoom += (1 - this.zoom) * Math.min(1, dt * 3);
    const k = this.slowmo > 0 ? 0.35 : 1;
    const edt = dt * k;
    for (const p of this.particles) {
      p.life -= edt;
      p.x += p.vx * edt; p.y += p.vy * edt;
      p.vx *= 1 - 3 * edt; p.vy *= 1 - 3 * edt;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const p of this.trailParts) { p.life -= edt; p.x += p.vx * edt; p.y += p.vy * edt; }
    this.trailParts = this.trailParts.filter(p => p.life > 0);
    for (const t of this.texts) { t.life -= edt; t.y += t.vy * edt; t.vy *= 1 - 2 * edt; }
    this.texts = this.texts.filter(t => t.life > 0);
    for (const f of this.fx) f.life -= edt;
    this.fx = this.fx.filter(f => f.life > 0);
    this.shake = Math.max(0, this.shake - 40 * dt);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    if (this.victoryDelay > 0) {
      this.victoryDelay -= dt;
      if (this.victoryDelay <= 0) this.victoryFx = new VictoryFx(this.style.victory, this.view.w, this.view.h);
    }
    if (this.victoryFx && !this.victoryFx.update(dt)) this.victoryFx = null;

    // traînée cosmétique du joueur
    const st = this.style;
    if (this.world && st.trail !== 'none' && st.trailTeams) {
      for (const b of this.world.mainBalls) {
        if (!b.dead && st.trailTeams.includes(b.team) && b.alpha > 0.5) spawnTrail(st.trail, b, this.trailParts, this.world.time);
      }
    }

    // traînées des balles rapides
    if (this.world) {
      for (const b of this.world.balls) {
        if (b.dead) { this.trails.delete(b.id); continue; }
        let tr = this.trails.get(b.id);
        if (!tr) this.trails.set(b.id, tr = []);
        tr.unshift({ x: b.x, y: b.y - b.z });
        if (tr.length > 8) tr.length = 8;
      }
      // projectiles à traînée de fumée
      for (const e of this.world.entities) {
        if (e.trail && Math.random() < 0.6) {
          this.particles.push({ x: e.x, y: e.y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0.4, max: 0.4, size: 3, color: e.trail });
        }
      }
    }
  }

  // ------------------------------------------------------------- dessin
  draw() {
    const { ctx, view: v } = this;
    const w = this.world;
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    const theme = THEMES[this.style.theme] || THEMES.classic;
    const bg = ctx.createRadialGradient(v.w / 2, v.h / 2, 0, v.w / 2, v.h / 2, Math.max(v.w, v.h) * 0.75);
    bg.addColorStop(0, theme.bg[0]);
    bg.addColorStop(1, theme.bg[1]);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, v.w, v.h);
    if (!w) return;

    const sx = this.shake ? (Math.random() - 0.5) * 2 * this.shake : 0;
    const sy = this.shake ? (Math.random() - 0.5) * 2 * this.shake : 0;
    let s = v.scale, ox = v.ox, oy = v.oy;
    if (this.zoom > 1.001 && this.focus) {
      // zoom centré sur le point focal (le point reste fixe à l'écran)
      const fx = ox + this.focus.x * s, fy = oy + this.focus.y * s;
      const z = this.zoom;
      ox = fx - (fx - ox) * z; oy = fy - (fy - oy) * z; s *= z;
    }
    ctx.setTransform(v.dpr * s, 0, 0, v.dpr * s, v.dpr * (ox + sx * s), v.dpr * (oy + sy * s));

    this.drawArena(ctx, w.size, v.wall);
    for (const e of w.entities) if (e.layer === 'floor') e.draw(ctx);
    const live = w.balls.filter(b => !b.dead);
    // traînées
    for (const b of live) {
      const tr = this.trails.get(b.id);
      const sp = Math.hypot(b.vx, b.vy);
      if (!tr || sp < 420 || b.alpha < 0.5) continue;
      ctx.save();
      for (let i = 1; i < tr.length; i++) {
        ctx.globalAlpha = 0.18 * (1 - i / tr.length) * Math.min(1, (sp - 420) / 300);
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(tr[i].x, tr[i].y, b.r * (1 - i * 0.06), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    this.drawParticles(ctx, this.trailParts);
    for (const b of live) b.drawUnder(ctx);
    // anneau d'équipe au sol
    {
      for (const b of live) {
        if (b.summon && b.fighterId !== 'decoy') continue;
        ctx.save();
        ctx.globalAlpha = 0.85 * b.alpha;
        ctx.strokeStyle = TEAM_COLORS[b.team] || '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(b.x, b.y + b.r * 0.15, b.r + 4, b.r + 4, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    const order = [...live.filter(b => b.summon), ...live.filter(b => !b.summon)];
    for (const b of order) this.drawBall(ctx, b);
    for (const e of w.entities) if (e.layer !== 'floor') e.draw(ctx);
    for (const b of order) this.drawHp(ctx, b);
    this.drawFx(ctx);

    this.drawParticles(ctx, this.particles);
    // chiffres flottants
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, (t.life / t.max) * 2);
      const pop = 1 + 0.4 * Math.max(0, (t.life - t.max + 0.12) / 0.12);
      ctx.font = `${t.size * pop}px ${FONT}`;
      ctx.lineWidth = t.size * 0.22;
      ctx.strokeStyle = '#000';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;

    // écran
    ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    if (this.flash > 0) {
      ctx.fillStyle = rgba(this.flashColor.startsWith('#') ? this.flashColor : '#ffffff', Math.min(0.6, this.flash));
      ctx.fillRect(0, 0, v.w, v.h);
    }
    if (this.slowmo > 0) {
      // bandes cinéma pendant le ralenti
      const k = Math.min(1, (1.4 - this.slowmo) * 4, this.slowmo * 4);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, v.w, 36 * k);
      ctx.fillRect(0, v.h - 36 * k, v.w, 36 * k);
    }
    this.drawHud(ctx);
    this.victoryFx?.draw(ctx);
  }

  drawParticles(ctx, list) {
    for (const p of list) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      switch (p.shape) {
        case 'star': star(ctx, p.x, p.y, p.size, 5, 0.45); ctx.fill(); break;
        case 'square': ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); break;
        case 'ring':
          ctx.strokeStyle = p.color; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.stroke();
          break;
        case 'heart': {
          const r = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y + r);
          ctx.bezierCurveTo(p.x - r * 1.6, p.y - r * 0.2, p.x - r * 0.6, p.y - r * 1.4, p.x, p.y - r * 0.4);
          ctx.bezierCurveTo(p.x + r * 0.6, p.y - r * 1.4, p.x + r * 1.6, p.y - r * 0.2, p.x, p.y + r);
          ctx.fill();
          break;
        }
        default:
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawArena(ctx, S, wl) {
    const th = THEMES[this.style.theme] || THEMES.classic;
    const fg = ctx.createLinearGradient(0, 0, S, S);
    fg.addColorStop(0, th.floor[0]);
    fg.addColorStop(1, th.floor[1]);
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, S, S);
    drawThemeDecor(ctx, th, S, this.world ? this.world.time : 0);
    ctx.strokeStyle = th.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 50; i < S; i += 50) { ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.moveTo(0, i); ctx.lineTo(S, i); }
    ctx.stroke();
    const quad = (pts, c) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.closePath();
      ctx.fill();
    };
    const [top, left, bottom, right] = th.walls;
    quad([-wl, -wl, S + wl, -wl, S, 0, 0, 0], top);
    quad([-wl, -wl, 0, 0, 0, S, -wl, S + wl], left);
    quad([-wl, S + wl, 0, S, S, S, S + wl, S + wl], bottom);
    quad([S + wl, -wl, S + wl, S + wl, S, S, S, 0], right);
    ctx.save();
    if (th.glow) { ctx.shadowColor = th.edge; ctx.shadowBlur = 18; }
    ctx.strokeStyle = th.edge;
    ctx.lineWidth = th.glow ? 3 : 2;
    ctx.strokeRect(-wl, -wl, S + 2 * wl, S + 2 * wl);
    if (th.glow) ctx.strokeRect(0, 0, S, S);
    ctx.restore();
  }


  drawBall(ctx, b) {
    const t = this.world.time;
    const { r } = b;
    const x = b.x, y = b.y - b.z;
    // ombre (visible surtout pendant les sauts)
    ctx.save();
    ctx.globalAlpha = 0.25 * b.alpha;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(b.x + 4, b.y + r * 0.85, r * (0.9 - b.z / 120), r * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = b.alpha;
    const st = b.st;
    if (st.slow > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(143,220,255,0.8)';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -t * 30;
      ctx.beginPath(); ctx.arc(x, y, r + 7, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.08, x, y, r);
    g.addColorStop(0, shade(b.color, 0.55));
    g.addColorStop(0.35, b.color);
    g.addColorStop(1, shade(b.color, -0.6));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.translate(x, y);
    b.drawIcon(ctx, r);
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = shade(b.color, -0.7);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();

    const since = t - b.hitTime;
    if (since < 0.13) {
      ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - since / 0.13)})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    if (st.invuln > 0) {
      ctx.strokeStyle = `rgba(255,230,120,${0.6 + 0.3 * Math.sin(t * 20)})`;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.stroke();
    }
    if (st.bubble > 0) {
      ctx.fillStyle = 'rgba(200,240,255,0.25)';
      ctx.strokeStyle = 'rgba(230,250,255,0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, r + 10 + Math.sin(t * 6) * 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    if (st.stun > 0) {
      ctx.fillStyle = '#ffe066';
      for (let i = 0; i < 3; i++) {
        const a = t * 6 + i * 2.1;
        const sx = x + Math.cos(a) * r * 0.7, sy = y - r - 6 + Math.sin(a) * 4;
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const rr = k % 2 ? 2.2 : 5.5, aa = (k / 10) * Math.PI * 2;
          ctx.lineTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr);
        }
        ctx.fill();
      }
    }
    if (st.root > 0 && !b.immovable) {
      ctx.strokeStyle = '#4caf50';
      ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        const a = i * 1.6 + 0.4;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * (r + 8), y + Math.sin(a) * (r + 8));
        ctx.quadraticCurveTo(x + Math.cos(a + 0.5) * r * 0.6, y + Math.sin(a + 0.5) * r * 0.6, x + Math.cos(a + 1) * r * 0.9, y + Math.sin(a + 1) * r * 0.9);
        ctx.stroke();
      }
    }
    if (st.silence > 0) {
      ctx.strokeStyle = '#e3a8ff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x + r * 0.75, y - r * 0.75, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + r * 0.75 - 5.5, y - r * 0.75 + 5.5); ctx.lineTo(x + r * 0.75 + 5.5, y - r * 0.75 - 5.5); ctx.stroke();
    }
    if (st.weaken > 0) {
      ctx.fillStyle = 'rgba(160,255,60,0.18)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    if (b.dots.length && Math.random() < 0.35) {
      const d = b.dots[(Math.random() * b.dots.length) | 0];
      this.particles.push({ x: x + (Math.random() - 0.5) * r, y: y + (Math.random() - 0.5) * r, vx: 0, vy: -50, life: 0.5, max: 0.5, size: 3, color: d.color });
    }
    b.drawOver(ctx);
    ctx.restore();
  }

  drawHp(ctx, b) {
    if (b.summon && b.displayHp === undefined) return;
    const hp = b.displayHp ?? b.hp;
    const size = b.r * 0.72;
    ctx.save();
    ctx.globalAlpha = b.alpha;
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.24;
    ctx.strokeStyle = '#000';
    const txt = String(Math.max(0, Math.ceil(hp)));
    const y = b.y - b.z + size * 0.06;
    ctx.strokeText(txt, b.x, y);
    ctx.fillStyle = '#fff';
    ctx.fillText(txt, b.x, y);
    ctx.restore();
  }

  drawFx(ctx) {
    for (const f of this.fx) {
      const k = f.life / f.max;
      ctx.save();
      switch (f.k) {
        case 'ring': {
          const r = f.r1 + (f.r0 - f.r1) * k;
          ctx.globalAlpha = k;
          if (f.fill) {
            ctx.fillStyle = rgba(f.color.startsWith('#') ? f.color : '#ffffff', 0.25 * k);
            ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.fill();
          }
          ctx.strokeStyle = f.color;
          ctx.lineWidth = f.w * k + 1;
          ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.stroke();
          break;
        }
        case 'beam':
          ctx.globalAlpha = k;
          ctx.lineCap = 'round';
          ctx.strokeStyle = f.color;
          ctx.lineWidth = (f.width || 4) * 2.5 * k;
          ctx.globalAlpha = 0.35 * k;
          ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
          ctx.globalAlpha = k;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = (f.width || 4) * k;
          ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
          break;
        case 'zap':
          lightning(ctx, f.x1, f.y1, f.x2, f.y2, f.color, f.big ? 4 : 2.5, f.big ? 30 : 14);
          break;
        case 'blink':
          ctx.globalAlpha = 0.5 * k;
          ctx.strokeStyle = f.color;
          ctx.lineWidth = (f.r || 20) * 1.2 * k;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
          break;
      }
      ctx.restore();
    }
  }

  /** Noms et barres de vie des équipes en haut de l'écran. */
  drawHud(ctx) {
    const v0 = this.view, w = this.world;
    // dans les zones sûres : décalage + largeur utile
    const sf = v0.safe || { t: 0, r: 0, b: 0, l: 0 };
    const v = { w: v0.w - sf.l - sf.r };
    ctx.save();
    ctx.translate(sf.l, sf.t);
    const mains = w.mainBalls;
    const pad = 12;
    const narrow = v.w < 600;
    const colW = Math.min(v.w / 2 - pad * 1.5, 340);
    for (const team of [0, 1]) {
      const members = mains.filter(b => b.team === team);
      members.forEach((b, i) => {
        const right = team === 1;
        const rowH = members.length > 1 ? 36 : 54;
        const y = pad + i * rowH;
        const x = right ? v.w - pad - colW : pad;
        const nameSize = members.length > 1 ? (narrow ? 14 : 17) : (narrow ? 18 : 24);
        ctx.save();
        ctx.font = `${nameSize}px ${FONT}`;
        ctx.textBaseline = 'top';
        ctx.textAlign = right ? 'right' : 'left';
        ctx.lineJoin = 'round';
        const label = fighterName(b.meta);
        const player = this.names[mains.indexOf(b)];
        const tx = right ? v.w - pad : pad;
        ctx.lineWidth = nameSize * 0.22;
        ctx.strokeStyle = '#000';
        ctx.globalAlpha = b.dead ? 0.45 : 1;
        ctx.strokeText(label, tx, y);
        ctx.fillStyle = shade(b.color, 0.25);
        ctx.fillText(label, tx, y);
        if (player) {
          const lw = ctx.measureText(label).width;
          ctx.font = `600 ${Math.max(11, nameSize * 0.55)}px system-ui, sans-serif`;
          ctx.fillStyle = TEAM_COLORS[team];
          ctx.fillText(player, right ? tx - lw - 8 : tx + lw + 8, y + nameSize * 0.3);
        }
        // barre de vie (avec trace blanche qui rattrape)
        const bh = members.length > 1 ? 6 : 8, by = y + nameSize * 1.12;
        const frac = Math.max(0, b.hp / b.maxHp);
        const prev = this.hudHp.get(b.id) ?? frac;
        const shown = prev > frac ? prev - Math.min(prev - frac, 0.008) : frac;
        this.hudHp.set(b.id, shown);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(x, by, colW, bh);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(right ? x + colW * (1 - shown) : x, by, colW * shown, bh);
        ctx.fillStyle = TEAM_COLORS[team];
        ctx.fillRect(right ? x + colW * (1 - frac) : x, by, colW * frac, bh);
        ctx.restore();
      });
    }
    ctx.restore();
  }
}
