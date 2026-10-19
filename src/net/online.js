/* Parties en ligne 1V1 / 2V2.
 *
 * Principe : la simulation est déterministe. Les joueurs ne s'échangent donc que
 * leurs choix de combattants ; l'hôte diffuse ensuite la graine et la composition,
 * et chaque navigateur calcule exactement le même combat. Aucun flux de positions.
 *
 * Étapes :
 *  1. File d'attente (canal « queue ») : présence de chaque joueur en attente.
 *     Le plus ancien d'un groupe complet crée le salon et prévient les autres.
 *  2. Salon (canal « room ») : chacun publie son choix dans sa présence.
 *     L'hôte lance quand tout le monde est prêt ou à la fin du chrono ;
 *     les places vides ou les joueurs partis sont remplacés par l'IA.
 *  3. Combat : simulation locale ; des empreintes d'état sont échangées pour
 *     détecter une éventuelle désynchronisation.
 */
import { getTransport } from './transport.js';
import { PROTOCOL } from './config.js';
import { FIGHTER_IDS, hasFighter } from '../fighters/registry.js';
import { randomSeed } from '../sim/rng.js';
import { POWER } from '../sim/balance.js';
import { CONFIG } from '../sim/config.js';

/* Version du jeu : numéro du package + empreinte des données de jeu (combattants,
 * équilibrage, réglages). Deux copies du même code donnent toujours la même version,
 * quel que soit le moment ou l'endroit du build ; deux versions différentes ne se
 * rencontrent jamais (elles calculeraient des combats différents). */
function fnv(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0';
export const GAME_VERSION = `${APP_VERSION}-${fnv(JSON.stringify([FIGHTER_IDS, POWER, CONFIG]))}`;
const ROOM_LOOKUP = 5000;     // délai pour trouver le créateur d'une partie privée (ms)
const PICK_TIME = 20000;      // durée du choix des combattants (ms)
const JOIN_GRACE = 6000;      // délai pour que tous rejoignent le salon (ms)
const START_DELAY = 3200;     // compte à rebours avant le combat (ms)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const chanName = (kind, id) => `${PROTOCOL}-${GAME_VERSION}-${kind}-${id}`;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ------------------------------------------------------------- validation
/* Les canaux sont publics : n'importe qui peut y envoyer des messages. Tout ce qui est
 * reçu est donc vérifié avant usage (types, tailles, combattants existants, expéditeur). */
const MAX_NAME = 20;
const RATE_LIMIT = 15;  // messages par seconde et par expéditeur au-delà desquels on ignore
const isId = v => typeof v === 'string' && /^[a-z0-9]{4,32}$/.test(v);
const cleanName = v => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME) : '') || '?';
const cleanInt = (v, lo, hi, def) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : def);
export const isRoomCode = v => typeof v === 'string' && /^[A-Z0-9]{4,6}$/.test(v.trim().toUpperCase());

export function randomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
  return s;
}

export class OnlineSession {
  /**
   * @param {object} o
   * @param {string} o.name pseudo affiché
   * @param {(s: OnlineSession) => void} o.onUpdate appelé à chaque changement d'état
   * @param {(info: object) => void} o.onStart appelé quand le combat est lancé
   */
  constructor({ name, profile = {}, onUpdate, onStart }) {
    this.id = uid();
    this.name = name;
    this.profile = profile;   // { level, title } affichés aux autres joueurs
    this.onUpdate = onUpdate;
    this.onStart = onStart;
    this.phase = 'idle';       // idle | queue | room | countdown | fight | error
    this.error = null;
    this.queueCount = 0;
    this.members = [];         // [{ id, name, team, fighter, ready, present, bot }]
    this.myPick = null;
    this.ready = false;
    this.hashes = new Map();
    this.desync = false;
    this.notices = [];
    this.timers = [];
    this.rate = new Map();
  }

  /** Anti-spam : faux si l'expéditeur dépasse RATE_LIMIT messages par seconde. */
  allow(from) {
    if (!isId(from)) return false;
    const now = Date.now();
    const r = this.rate.get(from) || { t: now, n: 0 };
    if (now - r.t > 1000) { r.t = now; r.n = 0; }
    r.n++;
    this.rate.set(from, r);
    return r.n <= RATE_LIMIT;
  }
  /** Envoie un message signé de mon identifiant. */
  send(ch, event, payload) { return ch?.send(event, { ...payload, from: this.id }); }

  get size() { return this.mode === '2v2' ? 4 : 2; }
  emit() { this.onUpdate?.(this); }
  fail(err) {
    console.warn('[online]', err);
    this.error = err?.message || String(err);
    this.phase = 'error';
    this.cleanup();
    this.emit();
  }

  // ----------------------------------------------------------- file d'attente
  async findMatch(mode) {
    this.mode = mode;
    this.phase = 'queue';
    this.emit();
    try {
      const ch = this.queue = await getTransport().channel(chanName('queue', mode), this.id);
      ch.on('match', p => this.onMatchMsg(p));
      ch.onPresence(list => this.onQueuePresence(list));
      await ch.subscribe();
      if (this.phase !== 'queue') return;
      this.joinedAt = Date.now();
      await ch.track({ id: this.id, name: this.name, t: this.joinedAt });
      // la présence peut se stabiliser sans nouvel événement : on revérifie régulièrement
      this.every(1000, () => this.onQueuePresence(ch.members()));
    } catch (e) { this.fail(e); }
  }

  onQueuePresence(list) {
    if (this.phase !== 'queue') return;
    const waiting = list.filter(m => m.id && m.t).sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
    this.queueCount = waiting.length;
    this.emit();
    const N = this.size;
    // groupes complets dans l'ordre d'arrivée ; le premier de chaque groupe est l'hôte
    for (let i = 0; i + N <= waiting.length; i += N) {
      const group = waiting.slice(i, i + N);
      if (group[0].id !== this.id) continue;
      if (this.lastMatchSent && Date.now() - this.lastMatchSent < 3000) return;
      this.lastMatchSent = Date.now();
      const payload = { room: uid(), members: group.map(m => ({ id: m.id, name: cleanName(m.name) })) };
      this.send(this.queue, 'match', payload);
      this.onMatch(payload);
      return;
    }
  }

  /** Message « match » reçu : il doit venir du premier membre du groupe annoncé. */
  onMatchMsg(p) {
    if (!p || !this.allow(p.from) || !isId(p.room) || !Array.isArray(p.members)) return;
    if (p.members.length !== this.size || !p.members.every(m => m && isId(m.id))) return;
    if (p.members[0].id !== p.from) return;
    this.onMatch({ room: p.room, members: p.members.map(m => ({ id: m.id, name: cleanName(m.name) })) });
  }

  onMatch(p) {
    if (this.phase !== 'queue' || !p.members.some(m => m.id === this.id)) return;
    this.queue.close();
    this.queue = null;
    this.clearTimers();
    this.enterRoom(p.room, p.members);
  }

  // ----------------------------------------------------------- parties privées
  async createPrivate(mode) {
    this.code = randomCode();
    return this.joinPrivate(this.code, mode);
  }

  /** mode renseigné = création de la partie ; sinon on rejoint une partie existante. */
  async joinPrivate(code, mode = null) {
    if (!isRoomCode(code)) { this.fail(new Error('room-not-found')); return; }
    this.code = code.trim().toUpperCase();
    this.mode = mode;
    this.isPrivate = true;
    this.creator = !!mode;
    await this.enterRoom('P' + this.code, null);
    if (!this.creator && this.phase === 'room') {
      // la partie doit exister : son créateur doit être présent
      const t0 = Date.now();
      const check = setInterval(() => {
        if (this.phase !== 'room' || !this.room) { clearInterval(check); return; }
        if (this.room.members().some(m => m.creator && m.id !== this.id)) { clearInterval(check); return; }
        if (Date.now() - t0 > ROOM_LOOKUP) { clearInterval(check); this.fail(new Error('room-not-found')); }
      }, 250);
      this.timers.push(check);
    }
  }

  // ----------------------------------------------------------- salon
  async enterRoom(roomId, fixedMembers) {
    this.phase = 'room';
    this.roomId = roomId;
    this.fixed = fixedMembers;          // null = partie privée (membres = présence)
    this.roomJoinedAt = Date.now();
    this.roundStart = Date.now();
    this.deadline = this.isPrivate ? null : Date.now() + PICK_TIME;
    this.myPick = null;
    this.ready = false;
    this.started = false;
    this.firstSeen = null;
    this.emit();
    try {
      const ch = this.room = await getTransport().channel(chanName('room', roomId), this.id);
      ch.on('start', p => { if (p && this.allow(p.from) && this.isHostId(p.from)) this.onStartMsg(p); });
      ch.on('hash', p => { if (p && this.allow(p.from)) this.onHash(p); });
      ch.on('kick', p => {
        if (p && this.allow(p.from) && this.isPrivate && p.from === this.hostId && p.id === this.id) this.fail(new Error('room-full'));
      });
      ch.onPresence(() => this.refreshRoom());
      await ch.subscribe();
      await this.publish();
      this.every(250, () => this.hostTick());
    } catch (e) { this.fail(e); }
  }

  publish() {
    if (!this.room) return Promise.resolve();
    return this.room.track({
      id: this.id, name: this.name, t: this.roomJoinedAt,
      pick: this.myPick, ready: this.ready, mode: this.mode, creator: !!this.creator, v: GAME_VERSION,
      phase: this.phase,
      lvl: this.profile.level || 1, title: this.profile.title || null,
    });
  }

  pick(fighterId) {
    if (this.phase !== 'room' || this.ready) return;
    this.myPick = fighterId;
    this.publish();
    this.refreshRoom();
  }

  setReady() {
    if (this.phase !== 'room') return;
    if (!this.myPick) this.myPick = FIGHTER_IDS[(Math.random() * FIGHTER_IDS.length) | 0];
    this.ready = true;
    this.publish();
    this.refreshRoom();
  }

  /** Recalcule la liste des membres à partir de la présence. */
  refreshRoom() {
    if (!this.room) return;
    const present = this.room.members().filter(m => isId(m.id));
    const byId = new Map(present.map(m => [m.id, m]));
    let order;
    if (this.fixed) order = this.fixed.map(m => m.id);
    else {
      // partie privée : le créateur d'abord (il est l'hôte), puis l'ordre d'arrivée ;
      // le mode est celui du créateur
      // l'ordre d'arrivée est celui que J'AI observé (l'heure déclarée par les autres
      // n'est pas fiable : un tricheur pourrait s'annoncer « arrivé avant tout le monde »)
      if (!this.firstSeen) this.firstSeen = new Map();
      for (const m of present) if (!this.firstSeen.has(m.id)) this.firstSeen.set(m.id, m.id === this.id ? this.roomJoinedAt : Date.now());
      const seen = id => this.firstSeen.get(id);
      const sorted = [...present].sort((a, b) => (b.creator ? 1 : 0) - (a.creator ? 1 : 0) || seen(a.id) - seen(b.id) || (a.id < b.id ? -1 : 1));
      if (!this.creator) {
        const m = sorted.find(x => x.creator)?.mode;
        this.mode = m === '2v2' || m === '1v1' ? m : this.mode || '1v1';
      }
      order = sorted.slice(0, this.size).map(m => m.id);
      // trop de monde : l'hôte renvoie les derniers arrivés
      if (sorted.length > this.size && order[0] === this.id) {
        for (const m of sorted.slice(this.size)) this.send(this.room, 'kick', { id: m.id });
      }
    }
    const names = new Map((this.fixed || []).map(m => [m.id, m.name]));
    this.members = order.map((id, i) => {
      const p = byId.get(id);
      return {
        id, name: cleanName(p?.name || names.get(id)), team: i % 2,
        fighter: typeof p?.pick === 'string' && hasFighter(p.pick) ? p.pick : null,
        ready: !!p?.ready && (p.phase === 'room' || p.phase === undefined), present: !!p, me: id === this.id,
        inRoom: !!p && (p.phase === 'room' || p.phase === undefined),
        lvl: p?.lvl ? cleanInt(p.lvl, 1, 50, 1) : null, title: typeof p?.title === 'string' ? p.title.slice(0, 24) : null,
      };
    });
    // l'hôte est le premier membre encore présent
    const host = this.members.find(m => m.present);
    this.hostId = host ? host.id : null;
    // l'hôte est encore en combat ou sur l'écran de résultat : on attendra la prochaine manche
    const hp = host && byId.get(host.id);
    this.hostBusy = !!hp && hp.phase !== undefined && hp.phase !== 'room';
    this.isHost = !!host && host.id === this.id;
    this.emit();
  }

  hostTick() {
    if (this.phase !== 'room' || !this.isHost || this.started) return;
    const now = Date.now();
    if (this.fixed) {
      const graceOver = now - this.roundStart > JOIN_GRACE;
      const allReady = this.members.every(m => m.ready || (graceOver && !m.present));
      if (allReady && (graceOver || this.members.every(m => m.present))) this.start();
      else if (now >= this.deadline) this.start();
    } else {
      const full = this.members.length >= this.size && this.members.every(m => m.present && m.inRoom && m.ready);
      if (full) this.start();
    }
  }

  /** Le créateur d'une partie privée peut changer de mode tant qu'il est seul. */
  setMode(mode) {
    if (!this.creator || this.phase !== 'room' || (mode !== '1v1' && mode !== '2v2')) return;
    if (this.members.filter(m => m.present).length > 1) return;
    this.mode = mode;
    this.publish();
    this.refreshRoom();
  }

  // ----------------------------------------------------------- manches
  /** Fin du combat : on reste dans le salon pour pouvoir rejouer avec le même groupe. */
  endRound() {
    if (this.phase !== 'countdown' && this.phase !== 'fight') return;
    this.phase = 'ended';
    this.publish();
    this.emit();
  }

  /** Revanche : retour au choix des balles, dans le même salon, avec le même groupe. */
  rematch() {
    if (!this.room || this.phase !== 'ended') return;
    this.phase = 'room';
    this.roundStart = Date.now();
    this.deadline = this.isPrivate ? null : Date.now() + PICK_TIME;
    this.myPick = null;
    this.ready = false;
    this.started = false;
    this.hashes = new Map();
    this.remoteHashes = null;
    this.desync = false;
    this.publish();
    this.refreshRoom();
    this.every(250, () => this.hostTick());
  }

  /** L'expéditeur est-il (ou peut-il légitimement être) l'hôte du salon ? */
  isHostId(id) {
    if (id === this.hostId) return true;
    if (this.fixed) return this.fixed.some(m => m.id === id) && this.fixed.findIndex(m => m.id === id) <= this.fixed.findIndex(m => m.id === this.hostId);
    return this.members[0]?.id === id;
  }

  /** Partie privée : l'hôte lance sans attendre (places vides = IA). */
  startNow() { if (this.isHost && this.phase === 'room') this.start(); }

  start() {
    if (this.started) return;
    this.started = true;
    const N = this.size;
    const slots = [];
    for (let i = 0; i < N; i++) {
      const m = this.members[i];
      const human = m && m.present && (m.inRoom || m.me);
      slots.push({
        fighter: (human && m.fighter) || FIGHTER_IDS[(Math.random() * FIGHTER_IDS.length) | 0],
        team: i % 2,
        name: human ? m.name : 'IA',
        bot: !human,
        id: human ? m.id : null,
      });
    }
    const payload = { seed: randomSeed(), roster: slots, delay: START_DELAY };
    this.send(this.room, 'start', payload);
    this.onStartMsg(payload);
  }

  onStartMsg(p) {
    if (this.phase !== 'room') return;
    // composition attendue : `size` places, équipes alternées, combattants existants
    const N = this.size;
    if (!Array.isArray(p.roster) || p.roster.length !== N || !Number.isFinite(p.seed)) return;
    for (let i = 0; i < N; i++) {
      const r = p.roster[i];
      if (!r || typeof r.fighter !== 'string' || !hasFighter(r.fighter) || r.team !== i % 2) return;
    }
    p = {
      seed: p.seed,
      delay: cleanInt(p.delay, 500, 6000, START_DELAY),
      roster: p.roster.map(r => ({ fighter: r.fighter, team: r.team, name: cleanName(r.name), bot: !!r.bot, id: isId(r.id) ? r.id : null })),
    };
    this.clearTimers();
    this.phase = 'countdown';
    this.startInfo = {
      seed: p.seed >>> 0,
      roster: p.roster.map(r => ({ fighter: r.fighter, team: r.team, name: r.name, bot: r.bot })),
      names: p.roster.map(r => r.name),
      myIndex: p.roster.findIndex(r => r.id === this.id),
      startAt: Date.now() + p.delay,
    };
    this.myTeam = this.startInfo.myIndex >= 0 ? p.roster[this.startInfo.myIndex].team : 0;
    this.publish();
    this.emit();
    this.onStart?.(this.startInfo);
  }

  // ----------------------------------------------------------- combat
  /** Appelé par le jeu à intervalles réguliers avec l'empreinte locale. */
  reportHash(tick, h) {
    this.hashes.set(tick, h);
    this.send(this.room, 'hash', { tick, h });
    const theirs = this.remoteHashes?.get(tick);
    if (theirs !== undefined && theirs !== h) this.flagDesync(tick);
  }
  onHash(p) {
    if (!Number.isInteger(p.tick) || !Number.isInteger(p.h)) return;
    if (!this.remoteHashes) this.remoteHashes = new Map();
    if (this.remoteHashes.size > 500) return;
    this.remoteHashes.set(p.tick, p.h);
    const mine = this.hashes.get(p.tick);
    if (mine !== undefined && mine !== p.h) this.flagDesync(p.tick);
  }
  flagDesync(tick) {
    if (this.desync) return;
    this.desync = true;
    console.warn(`[online] désynchronisation détectée au pas ${tick}`);
    this.emit();
  }

  // ----------------------------------------------------------- utilitaires
  every(ms, fn) { const id = setInterval(fn, ms); this.timers.push(id); }
  clearTimers() { this.timers.forEach(clearInterval); this.timers = []; }
  cleanup() {
    this.clearTimers();
    try { this.queue?.close(); } catch { /* ignoré */ }
    try { this.room?.close(); } catch { /* ignoré */ }
    this.queue = null;
    this.room = null;
  }
  leave() {
    this.cleanup();
    this.phase = 'idle';
  }
}
