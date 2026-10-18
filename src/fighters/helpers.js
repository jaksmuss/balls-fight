/* Outils partagés par les combattants.
 * - fonctions de simulation (déterministes) : shoot, pointOnWall...
 * - fonctions de dessin (affichage seulement) : star, poly, line... */
import * as M from '../sim/dmath.js';
import { Projectile } from '../sim/entities.js';

/** Tire un projectile depuis le bord de la balle dans la direction `angle`. */
export function shoot(ball, angle, speed, o = {}) {
  const c = M.cos(angle), s = M.sin(angle);
  const p = new Projectile(ball.world, ball, {
    x: ball.x + c * ball.r * 0.9, y: ball.y + s * ball.r * 0.9,
    vx: c * speed, vy: s * speed, ...o,
  });
  return ball.world.spawn(p);
}

/** Angle vers la cible avec une imprécision aléatoire (déterministe). */
export function aim(ball, target, spread = 0) {
  return ball.angleTo(target) + (spread ? ball.world.rng.range(-spread, spread) : 0);
}

/** Point aléatoire sur un mur : { x, y, nx, ny } (normale vers l'intérieur). */
export function pointOnWall(world, margin = 0.1) {
  const S = world.size;
  const side = world.rng.int(4);
  const u = world.rng.range(margin, 1 - margin) * S;
  return [
    { x: u, y: 0, nx: 0, ny: 1 },
    { x: S, y: u, nx: -1, ny: 0 },
    { x: u, y: S, nx: 0, ny: -1 },
    { x: 0, y: u, nx: 1, ny: 0 },
  ][side];
}

export function clampInArena(world, x, y, pad) {
  return { x: M.clamp(x, pad, world.size - pad), y: M.clamp(y, pad, world.size - pad) };
}

// ------------------------------------------------------------- dessin
export function star(ctx, x, y, r, points = 5, inner = 0.45, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * inner : r;
    const a = rot + (i / (points * 2)) * Math.PI * 2;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

export function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

export function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

/** Éclair en zigzag entre deux points (affichage). */
export function lightning(ctx, x1, y1, x2, y2, color = '#bfe9ff', width = 3, jag = 14) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const segs = Math.max(3, Math.floor(len / 22));
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const [w, c, a] of [[width * 3, color, 0.25], [width, '#ffffff', 1]]) {
    ctx.globalAlpha = a;
    ctx.strokeStyle = c;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const off = (Math.random() - 0.5) * jag;
      ctx.lineTo(x1 + dx * t + nx * off, y1 + dy * t + ny * off);
    }
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Teinte une couleur hex vers le blanc (a>0) ou le noir (a<0). */
export function shade(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const t = a < 0 ? 0 : 255, k = Math.abs(a);
  return `rgb(${ch.map(c => Math.round(c + (t - c) * k)).join(',')})`;
}

export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
