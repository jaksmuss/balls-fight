/* Sons synthétisés avec Web Audio (aucun fichier à charger).
 * Le contexte audio n'est créé qu'au premier geste de l'utilisateur, et jamais
 * tant que le son est coupé (exigence CrazyGames). */
let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;
let platformMuted = false;
let backgroundMuted = false;   // onglet / application en arrière-plan
const last = {};

try { muted = localStorage.getItem('bf-muted') === '1'; } catch { /* ignoré */ }

function ensure() {
  if (ctx || muted || platformMuted) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

/** À appeler sur un geste utilisateur (clic, touche) pour débloquer l'audio. */
export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('bf-muted', m ? '1' : '0'); } catch { /* ignoré */ }
  applyGain();
}
/** Coupure imposée par la plateforme (pub, réglage CrazyGames). */
export function setPlatformMuted(m) { platformMuted = m; applyGain(); }
/** Arrière-plan : coupe le son et met le contexte audio en pause. */
export function setBackgroundMuted(m) {
  backgroundMuted = m;
  applyGain();
  if (ctx) (m ? ctx.suspend() : ctx.resume()).catch(() => {});
}
function applyGain() {
  if (master) master.gain.value = muted || platformMuted || backgroundMuted ? 0 : 0.5;
}

function tone(type, f0, f1, dur, vol, delay = 0) {
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur, vol, freq = 1200, q = 1, delay = 0) {
  const t0 = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t0);
  s.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  hit: v => { tone('triangle', 320 + 200 * Math.random(), 120, 0.09, 0.25 * v); noise(0.06, 0.25 * v, 1800, 0.8); },
  big: () => { tone('sine', 140, 45, 0.25, 0.6); noise(0.18, 0.45, 900, 0.6); },
  wall: v => tone('sine', 220, 160, 0.05, 0.08 * v),
  bump: () => { tone('sine', 180, 90, 0.08, 0.3); noise(0.05, 0.15, 600, 1); },
  zap: () => { noise(0.12, 0.25, 4000, 4); tone('square', 900, 300, 0.08, 0.06); },
  boom: () => { noise(0.45, 0.6, 300, 0.4); tone('sine', 90, 30, 0.4, 0.6); },
  shot: () => { noise(0.08, 0.3, 2500, 1.2); tone('square', 600, 150, 0.06, 0.08); },
  pop: () => tone('sine', 500, 1200, 0.08, 0.2),
  heal: () => { tone('sine', 520, 780, 0.15, 0.12); tone('sine', 780, 1040, 0.15, 0.08, 0.06); },
  block: () => tone('square', 1200, 900, 0.05, 0.06),
  blink: () => tone('sine', 1400, 300, 0.12, 0.12),
  death: () => { noise(0.7, 0.6, 400, 0.5); tone('sawtooth', 300, 40, 0.7, 0.25); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.22, 0.25, i * 0.11)),
  lose: () => [392, 330, 262].forEach((f, i) => tone('triangle', f, f * 0.98, 0.3, 0.22, i * 0.16)),
  click: () => tone('sine', 700, 900, 0.05, 0.12),
  countdown: () => tone('square', 660, 660, 0.12, 0.1),
  go: () => tone('square', 990, 990, 0.25, 0.14),
};

/** Joue un son (limité à un toutes les `gap` secondes par nom). */
export function play(name, vol = 1, gap = 0.035) {
  if (muted || platformMuted || backgroundMuted) return;
  if (!ensure() || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  if (last[name] && now - last[name] < gap) return;
  last[name] = now;
  SOUNDS[name]?.(Math.min(1, vol));
}
