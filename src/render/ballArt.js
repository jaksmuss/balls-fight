/* Dessin d'une balle « au repos » (vignettes de l'écran de sélection). */
import { shade } from '../fighters/helpers.js';

/** Dessine le combattant `Cls` dans un canvas carré de `size` px (CSS). */
export function renderThumb(Cls, size = 72) {
  const c = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  c.width = c.height = Math.round(size * dpr);
  c.style.width = c.style.height = size + 'px';
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const r = size * 0.42, x = size / 2, y = size / 2;
  const color = Cls.meta.color;
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.08, x, y, r);
  g.addColorStop(0, shade(color, 0.55));
  g.addColorStop(0.35, color);
  g.addColorStop(1, shade(color, -0.6));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  ctx.translate(x, y);
  // instance factice : drawIcon n'utilise que des valeurs d'affichage
  const fake = Object.create(Cls.prototype);
  fake.tags = {};
  fake.scale = 1;
  try { Cls.prototype.drawIcon.call(fake, ctx, r); } catch { /* motif optionnel */ }
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = shade(color, -0.7);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  return c;
}
