/* Vidéo de présentation : un vrai combat rendu image par image (temps fixe 1/30 s),
 * avec un texte d'intro et un écran de fin. Utilisé par tools/record-video.cjs.
 * Paramètres d'URL : seed, roster (ids séparés par des virgules ; 4 = 2V2), theme. */
import { Renderer } from '../src/render/renderer.js';
import { Match } from '../src/match.js';
import { setLanguage } from '../src/i18n.js';

setLanguage('en', false);
const q = new URLSearchParams(location.search);
const seed = +(q.get('seed') || 3862);
const ids = (q.get('roster') || 'dynamite,ninja,pyro,thunder').split(',');
const FPS = 30, DT = 1 / FPS;
const FONT = '"Lilita One", "Arial Black", Impact, sans-serif';

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const match = new Match({ seed, roster: ids.map((f, i) => ({ fighter: f, team: i % 2 })), renderer, names: [] });
renderer.silent = true;
renderer.setStyle({ theme: q.get('theme') || 'classic', trail: 'none', trailTeams: null, victory: 'confetti', victoryTeam: 'any' });
renderer.resize();

const W = () => renderer.view.w, H = () => renderer.view.h;
let frame = 0, endAt = null, cardStart = null;
const CARD = 2.6;

function text(ctx, s, x, y, size, fill, stroke = 0.16) {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = size * stroke; ctx.strokeStyle = '#000'; ctx.strokeText(s, x, y);
  ctx.fillStyle = fill; ctx.fillText(s, x, y);
}

function intro(ctx, t) {
  // bandeau d'intro pendant les 2,5 premières secondes
  const a = Math.min(1, t / 0.3, (2.5 - t) / 0.4);
  if (a <= 0) return;
  const u = Math.min(W(), H() * 1.6) / 1000;
  ctx.save();
  ctx.globalAlpha = a;
  const bw = 760 * u, bh = 84 * u, x = W() / 2 - bw / 2, y = H() * 0.5 - bh / 2;
  ctx.fillStyle = 'rgba(255,77,94,0.95)'; ctx.strokeStyle = '#000'; ctx.lineWidth = 5 * u;
  ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 18 * u); ctx.fill(); ctx.stroke();
  text(ctx, '64 BALLS · UNIQUE POWERS', W() / 2, y + bh / 2 + 2 * u, 46 * u, '#fff');
  ctx.restore();
}

function endCard(ctx, t) {
  const a = Math.min(1, t / 0.4);
  const u = Math.min(W(), H() * 1.6) / 1000;
  ctx.save();
  ctx.globalAlpha = a * 0.88;
  ctx.fillStyle = '#070a20';
  ctx.fillRect(0, 0, W(), H());
  ctx.globalAlpha = a;
  const pop = 1 + 0.2 * Math.max(0, 1 - t / 0.35);
  ctx.shadowColor = 'rgba(255,130,40,0.6)'; ctx.shadowBlur = 40 * u;
  text(ctx, 'BALLS', W() / 2, H() * 0.36, 170 * u * pop, '#ffffff', 0.12);
  text(ctx, 'FIGHT', W() / 2, H() * 0.36 + 165 * u * pop, 170 * u * pop, '#ffd23a', 0.12);
  ctx.shadowBlur = 0;
  text(ctx, 'Pick your ball. Watch it fight!', W() / 2, H() * 0.36 + 300 * u, 46 * u, '#dfe5ff', 0.14);
  text(ctx, '1V1 · 2V2 · ONLINE', W() / 2, H() * 0.36 + 365 * u, 38 * u, '#ff8a9a', 0.14);
  ctx.restore();
}

/** Calcule l'image suivante ; renvoie null quand la vidéo est terminée. */
window.renderFrame = () => {
  const t = frame / FPS;
  const ctx = renderer.ctx;
  const w = match.world;
  if (cardStart === null) {
    match.tick(DT);
    renderer.update(DT);
    renderer.draw();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    intro(ctx, t);
    if (w.over && endAt === null) endAt = t;
    if (endAt !== null && t - endAt > 3.4) cardStart = t;
  } else {
    if (t - cardStart > CARD) return null;
    renderer.update(DT);
    renderer.draw();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    endCard(ctx, t - cardStart);
  }
  frame++;
  return canvas.toDataURL('image/jpeg', 0.93);
};

document.fonts.load(`40px "Lilita One"`).catch(() => {}).finally(() => { document.title = 'ready'; });
