/* Progression du joueur : expérience, niveau, succès, récompenses visuelles équipées.
 * Sauvegarde dans le compte CrazyGames si disponible, sinon dans le navigateur. */
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, RARITY_XP } from './achievements.js';
import { COSMETICS, SLOTS, findCosmetic } from './cosmetics.js';
import { platform } from '../platform/crazygames.js';

const KEY = 'bf-progress-v1';
export const MAX_LEVEL = 50;
const XP = { local: 20, online: 35, onlineWin: 25 };

/** XP nécessaire pour passer du niveau l au niveau l + 1. */
export const xpForLevel = l => 60 + 15 * l;

function fresh() {
  return {
    v: 1, xp: 0, level: 1,
    fights: 0, onlineFights: 0, onlineWins: 0,
    played: [], achievements: {},
    equipped: { title: 'none', trail: 'none', victory: 'none', theme: 'classic' },
  };
}

let state = fresh();

export function loadProgress() {
  try {
    const raw = platform.storageGet(KEY);
    if (raw) state = { ...fresh(), ...JSON.parse(raw) };
  } catch { state = fresh(); }
  return state;
}

function save() {
  try { platform.storageSet(KEY, JSON.stringify(state)); } catch { /* stockage indisponible */ }
}

export const progress = () => state;

export function counterValue(name) {
  if (name === 'variety') return state.played.length;
  return state[name] || 0;
}

export function isUnlocked(item) {
  const u = item.unlock;
  if (!u) return true;
  if (u.level) return state.level >= u.level;
  if (u.achievement) return !!state.achievements[u.achievement];
  return false;
}

export function equip(slot, id) {
  const c = findCosmetic(slot, id);
  if (!isUnlocked(c)) return;
  state.equipped[slot] = c.id;
  save();
}

export function equipped(slot) {
  const c = findCosmetic(slot, state.equipped[slot]);
  return isUnlocked(c) ? c : COSMETICS[slot][0];
}

/** Liste de toutes les récompenses débloquées par l'état courant (pour détecter les nouveautés). */
function unlockedSet() {
  const s = new Set();
  for (const slot of SLOTS) for (const c of COSMETICS[slot]) if (c.unlock && isUnlocked(c)) s.add(`${slot}:${c.id}`);
  return s;
}

function addXp(n) {
  state.xp += n;
  while (state.level < MAX_LEVEL && state.xp >= xpForLevel(state.level)) {
    state.xp -= xpForLevel(state.level);
    state.level++;
  }
  if (state.level >= MAX_LEVEL) state.xp = Math.min(state.xp, xpForLevel(MAX_LEVEL));
}

/**
 * Enregistre un combat terminé et renvoie le récapitulatif à afficher.
 * @param {object} o { world, online, teamSize, myTeam, myFighters, privateMatch }
 */
export function recordFight({ world, online, teamSize, myTeam = null, myFighters = [], privateMatch = false }) {
  const before = { level: state.level, xp: state.xp, unlocked: unlockedSet() };
  const subjectTeam = online ? myTeam : world.winnerTeam;
  const won = world.winnerTeam !== null && world.winnerTeam === subjectTeam;

  state.fights++;
  if (online) { state.onlineFights++; if (won) state.onlineWins++; }
  for (const id of myFighters) if (!state.played.includes(id)) state.played.push(id);

  let xp = online ? XP.online + (won ? XP.onlineWin : 0) : XP.local;
  const ctx = { world, online, teamSize, subjectTeam, won, privateMatch };
  const newAchievements = [];
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id]) continue;
    let ok = false;
    try { ok = a.counter ? counterValue(a.counter) >= a.goal : !!a.check(ctx); } catch { ok = false; }
    if (ok) {
      state.achievements[a.id] = Date.now();
      newAchievements.push(a);
      xp += RARITY_XP[a.rarity];
    }
  }
  addXp(xp);
  const after = unlockedSet();
  const newUnlocks = [];
  for (const k of after) if (!before.unlocked.has(k)) {
    const [slot, id] = k.split(':');
    newUnlocks.push({ slot, item: findCosmetic(slot, id) });
  }
  save();
  return { xp, won, levelBefore: before.level, xpBefore: before.xp, level: state.level, newAchievements, newUnlocks };
}

export function achievementCount() {
  return { done: Object.keys(state.achievements).filter(id => ACHIEVEMENT_BY_ID.has(id)).length, total: ACHIEVEMENTS.length };
}
