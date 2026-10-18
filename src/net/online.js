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

const BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';
const PICK_TIME = 20000;      // durée du choix des combattants (ms)
const JOIN_GRACE = 6000;      // délai pour que tous rejoignent le salon (ms)
const START_DELAY = 3200;     // compte à rebours avant le combat (ms)
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const chanName = (kind, id) => `${PROTOCOL}-${BUILD}-${kind}-${id}`;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

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
  constructor({ name, onUpdate, onStart }) {
    this.id = uid();
    this.name = name;
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
  }

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
      ch.on('match', p => this.onMatch(p));
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
      const payload = { room: uid(), members: group.map(m => ({ id: m.id, name: m.name })) };
      this.queue.send('match', payload);
      this.onMatch(payload);
      return;
    }
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

  async joinPrivate(code, mode = null) {
    this.code = code.toUpperCase();
    this.mode = mode;
    this.isPrivate = true;
    this.enterRoom('P' + this.code, null);
  }

  // ----------------------------------------------------------- salon
  async enterRoom(roomId, fixedMembers) {
    this.phase = 'room';
    this.roomId = roomId;
    this.fixed = fixedMembers;          // null = partie privée (membres = présence)
    this.roomJoinedAt = Date.now();
    this.deadline = this.isPrivate ? null : Date.now() + PICK_TIME;
    this.myPick = null;
    this.ready = false;
    this.started = false;
    this.emit();
    try {
      const ch = this.room = await getTransport().channel(chanName('room', roomId), this.id);
      ch.on('start', p => this.onStartMsg(p));
      ch.on('hash', p => this.onHash(p));
      ch.on('kick', p => { if (p.id === this.id) this.fail(new Error('room-full')); });
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
      pick: this.myPick, ready: this.ready, mode: this.mode,
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
    const present = this.room.members().filter(m => m.id);
    const byId = new Map(present.map(m => [m.id, m]));
    let order;
    if (this.fixed) order = this.fixed.map(m => m.id);
    else {
      // partie privée : ordre d'arrivée ; le mode est celui du créateur
      const sorted = [...present].sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
      if (!this.mode) this.mode = sorted.find(m => m.mode)?.mode || '1v1';
      order = sorted.slice(0, this.size).map(m => m.id);
      // trop de monde : l'hôte renvoie les derniers arrivés
      if (sorted.length > this.size && order[0] === this.id) {
        for (const m of sorted.slice(this.size)) this.room.send('kick', { id: m.id });
      }
    }
    const names = new Map((this.fixed || []).map(m => [m.id, m.name]));
    this.members = order.map((id, i) => {
      const p = byId.get(id);
      return {
        id, name: p?.name || names.get(id) || '?', team: i % 2,
        fighter: p?.pick && hasFighter(p.pick) ? p.pick : null,
        ready: !!p?.ready, present: !!p, me: id === this.id,
      };
    });
    // l'hôte est le premier membre encore présent
    const host = this.members.find(m => m.present);
    this.isHost = !!host && host.id === this.id;
    this.emit();
  }

  hostTick() {
    if (this.phase !== 'room' || !this.isHost || this.started) return;
    const now = Date.now();
    if (this.fixed) {
      const graceOver = now - this.roomJoinedAt > JOIN_GRACE;
      const allReady = this.members.every(m => m.ready || (graceOver && !m.present));
      if (allReady && (graceOver || this.members.every(m => m.present))) this.start();
      else if (now >= this.deadline) this.start();
    } else {
      const full = this.members.length >= this.size && this.members.every(m => m.present && m.ready);
      if (full) this.start();
    }
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
      const human = m && m.present;
      slots.push({
        fighter: (human && m.fighter) || FIGHTER_IDS[(Math.random() * FIGHTER_IDS.length) | 0],
        team: i % 2,
        name: human ? m.name : 'IA',
        bot: !human,
        id: human ? m.id : null,
      });
    }
    const payload = { seed: randomSeed(), roster: slots, delay: START_DELAY };
    this.room.send('start', payload);
    this.onStartMsg(payload);
  }

  onStartMsg(p) {
    if (this.phase !== 'room') return;
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
    this.emit();
    this.onStart?.(this.startInfo);
  }

  // ----------------------------------------------------------- combat
  /** Appelé par le jeu à intervalles réguliers avec l'empreinte locale. */
  reportHash(tick, h) {
    this.hashes.set(tick, h);
    this.room?.send('hash', { tick, h, id: this.id });
    const theirs = this.remoteHashes?.get(tick);
    if (theirs !== undefined && theirs !== h) this.flagDesync(tick);
  }
  onHash(p) {
    if (!this.remoteHashes) this.remoteHashes = new Map();
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
