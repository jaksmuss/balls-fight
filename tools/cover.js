/* Génère l'image de présentation (ouvrir tools/cover.html?w=1920&h=1080 avec `npm run dev`). */
import { getFighter } from '../src/fighters/registry.js';
import { shade, lightning, star } from '../src/fighters/helpers.js';

const q = new URLSearchParams(location.search);
const W = +(q.get('w') || 1920), H = +(q.get('h') || 1080);
const c = document.getElementById('c');
c.width = W; c.height = H;
const ctx = c.getContext('2d');
const U = Math.min(W / 1920, H / 1080);     // unité d'échelle
const FONT = '"Lilita One", "Arial Black", Impact, sans-serif';
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function ball(id, x, y, r, hp) {
  const C = getFighter(id);
  const color = C.meta.color;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(x + r * 0.1, y + r * 0.95, r * 0.9, r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.08, x, y, r);
  g.addColorStop(0, shade(color, 0.55)); g.addColorStop(0.35, color); g.addColorStop(1, shade(color, -0.6));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip(); ctx.translate(x, y);
  const fake = Object.create(C.prototype); fake.tags = {}; fake.scale = 1;
  C.prototype.drawIcon.call(fake, ctx, r);
  ctx.restore();
  ctx.lineWidth = Math.max(2, r * 0.05); ctx.strokeStyle = shade(color, -0.7);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  if (hp !== undefined) text(String(hp), x, y + r * 0.05, r * 0.7, '#fff');
  ctx.restore();
}
function text(s, x, y, size, fill, stroke = '#000', sw = 0.22) {
  ctx.font = `${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = size * sw; ctx.strokeStyle = stroke; ctx.strokeText(s, x, y);
  ctx.fillStyle = fill; ctx.fillText(s, x, y);
}
function burst(x, y, n, colors, R, size) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = R * (0.2 + rnd() * 0.8);
    ctx.globalAlpha = 0.4 + rnd() * 0.6;
    ctx.fillStyle = colors[(rnd() * colors.length) | 0];
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, size * (0.4 + rnd()), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

await document.fonts.load(`100px "Lilita One"`).catch(() => {});

// --- fond
const bg = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H / 2, Math.max(W, H) * 0.75);
bg.addColorStop(0, '#26338a'); bg.addColorStop(0.5, '#121a4a'); bg.addColorStop(1, '#060818');
ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
// rayons
ctx.save(); ctx.translate(W / 2, H * 0.42); ctx.globalAlpha = 0.07; ctx.fillStyle = '#ffffff';
for (let i = 0; i < 18; i++) { ctx.rotate(Math.PI / 9); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, -60 * U); ctx.lineTo(W, 60 * U); ctx.fill(); }
ctx.restore();
// sol d'arène en perspective
ctx.save();
ctx.strokeStyle = 'rgba(140,160,255,0.12)'; ctx.lineWidth = 2 * U;
for (let i = -12; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 40 * U, H * 0.62); ctx.lineTo(W / 2 + i * 260 * U, H); ctx.stroke(); }
for (let k = 0; k < 7; k++) { const y = H * 0.62 + (H * 0.38) * Math.pow(k / 6, 1.7); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
ctx.restore();

// --- effets derrière les balles
const P = (x, y) => [x * W, y * H];
const [hx, hy] = P(0.2, 0.62), [tx, ty] = P(0.8, 0.6), [wx, wy] = P(0.12, 0.3), [fx, fy] = P(0.88, 0.28);
const [px, py] = P(0.33, 0.86), [bx, by] = P(0.67, 0.87);
// fil de la Toile vers le Vampire
ctx.save(); ctx.lineCap = 'round';
ctx.strokeStyle = 'rgba(143,220,255,0.35)'; ctx.lineWidth = 22 * U; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(px, py); ctx.stroke();
ctx.strokeStyle = '#8fdcff'; ctx.lineWidth = 8 * U; ctx.stroke(); ctx.restore();
// traînée de feu du Pyro
for (let i = 0; i < 14; i++) {
  const t = i / 14, x = fx + (0.06 + t * 0.12) * W, y = fy + Math.sin(t * 5) * 30 * U + t * 120 * U;
  const g = ctx.createRadialGradient(x, y, 0, x, y, 34 * U * (1 - t * 0.5));
  g.addColorStop(0, 'rgba(255,240,150,0.9)'); g.addColorStop(0.4, 'rgba(255,130,20,0.7)'); g.addColorStop(1, 'rgba(255,40,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 34 * U, 0, Math.PI * 2); ctx.fill();
}
// éclair de la Foudre
lightning(ctx, tx, ty - 520 * U, tx, ty - 40 * U, '#fff27a', 8 * U, 60 * U);
lightning(ctx, tx, ty, bx, by, '#bfe9ff', 4 * U, 30 * U);
// explosion entre Marteau et Trou noir
burst(W * 0.5, H * 0.66, 120, ['#ffffff', '#ffd27a', '#ff8a3a', '#ff4d5e'], 260 * U, 9 * U);
const ex = ctx.createRadialGradient(W * 0.5, H * 0.66, 0, W * 0.5, H * 0.66, 200 * U);
ex.addColorStop(0, 'rgba(255,255,220,0.9)'); ex.addColorStop(0.4, 'rgba(255,160,40,0.45)'); ex.addColorStop(1, 'rgba(255,80,0,0)');
ctx.fillStyle = ex; ctx.beginPath(); ctx.arc(W * 0.5, H * 0.66, 200 * U, 0, Math.PI * 2); ctx.fill();

// --- marteau (arme) du Marteau
ctx.save(); ctx.translate(hx, hy); ctx.rotate(0.28);
const R1 = 125 * U, L = R1 + 120 * U;
ctx.strokeStyle = '#13265e'; ctx.lineWidth = 6 * U;
ctx.fillStyle = '#dceaff'; ctx.fillRect(R1 * 0.2, -13 * U, L - R1 * 0.2, 26 * U); ctx.strokeRect(R1 * 0.2, -13 * U, L - R1 * 0.2, 26 * U);
ctx.fillStyle = '#eaf3ff'; ctx.fillRect(L - 24 * U, -60 * U, 48 * U, 120 * U); ctx.strokeRect(L - 24 * U, -60 * U, 48 * U, 120 * U);
ctx.fillStyle = '#2f6bff'; ctx.fillRect(L - 6 * U, -50 * U, 12 * U, 100 * U);
ctx.restore();
// arc de mouvement
ctx.save(); ctx.strokeStyle = 'rgba(160,200,255,0.35)'; ctx.lineWidth = 70 * U;
ctx.beginPath(); ctx.arc(hx, hy, L, -0.6, 0.18); ctx.stroke(); ctx.restore();

// --- balles
ball('web', wx, wy, 95 * U, 74);
ball('pyro', fx, fy, 95 * U, 88);
ball('vampire', px, py, 105 * U, 41);
ball('blackhole', bx, by, 105 * U, 63);
ball('hammer', hx, hy, 125 * U, 92);
ball('thunder', tx, ty, 125 * U, 57);
burst(tx, ty, 40, ['#fff27a', '#ffffff'], 170 * U, 6 * U);
// petites balles en arrière-plan
const extras = [['ninja', 0.04, 0.55, 55], ['dice', 0.96, 0.52, 55], ['ghost', 0.42, 0.95, 50], ['midas', 0.58, 0.97, 50], ['disco', 0.03, 0.9, 60], ['angel', 0.97, 0.9, 60]];
for (const [id, x, y, r] of extras) ball(id, x * W, y * H, r * U);

// chiffres de dégâts
text('-12', tx + 150 * U, ty - 150 * U, 90 * U, '#ffe066');
text('-8', hx + 300 * U, hy - 230 * U, 70 * U, '#ffffff');
text('-4', px + 120 * U, py - 140 * U, 56 * U, '#8fdcff');
text('+7', px - 140 * U, py - 110 * U, 56 * U, '#7dff9a');

// --- titre (taille adaptée au format : paysage, carré ou portrait)
const portrait = H > W * 1.1;
const T = Math.min(W * 0.2, H * 0.21);
const y1 = portrait ? H * 0.12 : H * 0.19, y2 = y1 + T * 0.95;
ctx.save();
ctx.shadowColor = 'rgba(255,130,40,0.55)'; ctx.shadowBlur = T * 0.26;
text('BALLS', W / 2, y1, T, '#ffffff', '#000', 0.12);
text('FIGHT', W / 2, y2, T, '#ffd23a', '#000', 0.12);
ctx.restore();
// bandeau
const bw = T * 3.4, bh = T * 0.33, bx0 = W / 2 - bw / 2, by0 = y2 + T * 0.55;
ctx.save();
ctx.fillStyle = '#ff4d5e'; ctx.strokeStyle = '#000'; ctx.lineWidth = T * 0.026;
ctx.beginPath(); ctx.roundRect(bx0, by0, bw, bh, T * 0.08); ctx.fill(); ctx.stroke();
ctx.restore();
text('64 FIGHTERS · 1V1 · 2V2 ONLINE', W / 2, by0 + bh / 2 + T * 0.01, T * 0.19, '#ffffff', '#000', 0.18);
// étoiles décoratives
ctx.fillStyle = '#ffe066';
for (const [x, y, r] of [[0.28, 0.13, 26], [0.73, 0.1, 20], [0.7, 0.42, 16], [0.3, 0.44, 14]]) { star(ctx, x * W, y * H, r * U, 4, 0.35); ctx.fill(); }
document.title = 'ready';
