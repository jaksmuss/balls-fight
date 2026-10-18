/* Transport temps réel abstrait : canaux avec diffusion (broadcast) et présence.
 *
 *  - SupabaseTransport : Supabase Realtime (production).
 *  - LocalTransport    : BroadcastChannel entre onglets du même navigateur
 *                        (tests sans serveur : ajouter ?net=local à l'URL).
 *
 * Interface d'un canal :
 *   ch.on(event, cb)        écoute une diffusion (à déclarer AVANT subscribe)
 *   ch.onPresence(cb)       cb(members) à chaque changement de présence
 *   await ch.subscribe()    rejoint le canal (rejette si le serveur est injoignable)
 *   await ch.track(meta)    publie / met à jour ma présence
 *   ch.send(event, payload) diffuse aux autres membres (pas à moi-même)
 *   ch.members()            [{ key, ...meta }]
 *   ch.close()
 */
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// ------------------------------------------------------------- Supabase
/* Les membres d'un canal sont connus de deux façons, fusionnées :
 *  - la « présence » Supabase ;
 *  - un battement de cœur diffusé toutes les 1,5 s (plus robuste : si la présence
 *    est lente ou indisponible, les joueurs se voient quand même). */
const HEARTBEAT = 1500;
const PEER_TIMEOUT = 5000;

export class SupabaseChannel {
  constructor(client, name, key) {
    this.client = client;
    this.key = key;
    this.meta = null;
    this.peers = new Map();
    this.presenceCb = null;
    this.ch = client.channel(name, { config: { presence: { key }, broadcast: { self: false } } });
    this.ch.on('presence', { event: 'sync' }, () => this.emit());
    this.ch.on('broadcast', { event: '_hb' }, ({ payload }) => {
      if (!payload || payload.key === this.key) return;
      const prev = this.peers.get(payload.key);
      this.peers.set(payload.key, { meta: payload.meta, seen: Date.now() });
      if (!prev || JSON.stringify(prev.meta) !== JSON.stringify(payload.meta)) this.emit();
    });
    this.ch.on('broadcast', { event: '_bye' }, ({ payload }) => {
      if (payload && this.peers.delete(payload.key)) this.emit();
    });
    this.ch.on('broadcast', { event: '_q' }, () => this.announce());
  }
  on(event, cb) { this.ch.on('broadcast', { event }, msg => cb(msg.payload)); }
  onPresence(cb) { this.presenceCb = cb; }
  emit() { this.presenceCb?.(this.members()); }
  members() {
    const byKey = new Map();
    for (const [key, metas] of Object.entries(this.ch.presenceState())) {
      const m = metas[metas.length - 1];
      if (m) byKey.set(key, { key, ...m });
    }
    for (const [key, p] of this.peers) byKey.set(key, { key, ...p.meta });
    if (this.meta) byKey.set(this.key, { key: this.key, ...this.meta });
    return [...byKey.values()];
  }
  announce() {
    if (this.meta) this.ch.send({ type: 'broadcast', event: '_hb', payload: { key: this.key, meta: this.meta } }).catch(() => {});
  }
  subscribe() {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('TIMED_OUT')); } }, 10000);
      this.ch.subscribe(status => {
        if (done) return;
        if (status === 'SUBSCRIBED') {
          done = true;
          clearTimeout(timer);
          this.ch.send({ type: 'broadcast', event: '_q', payload: {} }).catch(() => {});
          this.timer = setInterval(() => {
            this.announce();
            const now = Date.now();
            let changed = false;
            for (const [k, p] of this.peers) if (now - p.seen > PEER_TIMEOUT) { this.peers.delete(k); changed = true; }
            if (changed) this.emit();
          }, HEARTBEAT);
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          done = true; clearTimeout(timer); reject(new Error(status));
        }
      });
    });
  }
  async track(meta) {
    this.meta = meta;
    this.announce();
    this.emit();
    try { await this.ch.track(meta); } catch (e) { console.warn('[online] présence indisponible', e); }
  }
  send(event, payload) { return this.ch.send({ type: 'broadcast', event, payload }); }
  close() {
    clearInterval(this.timer);
    try { this.ch.send({ type: 'broadcast', event: '_bye', payload: { key: this.key } }); } catch { /* ignoré */ }
    try { this.ch.untrack(); } catch { /* ignoré */ }
    this.client.removeChannel(this.ch);
  }
}

class SupabaseTransport {
  constructor() { this.client = null; }
  async load() {
    if (this.client) return;
    const { createClient } = await import('@supabase/supabase-js');
    this.client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  async channel(name, key) {
    await this.load();
    return new SupabaseChannel(this.client, name, key);
  }
}

// ------------------------------------------------------------- Local (tests)
class LocalChannel {
  constructor(name, key) {
    this.bc = new BroadcastChannel('bfnet:' + name);
    this.key = key;
    this.meta = null;
    this.peers = new Map();
    this.handlers = {};
    this.presenceCb = null;
    this.bc.onmessage = e => this.receive(e.data);
  }
  receive(m) {
    if (m.t === 'b') this.handlers[m.event]?.(m.payload);
    else if (m.t === 'p') {
      const prev = this.peers.get(m.key);
      this.peers.set(m.key, { meta: m.meta, seen: Date.now() });
      if (!prev || JSON.stringify(prev.meta) !== JSON.stringify(m.meta)) this.emit();
    } else if (m.t === 'l') {
      if (this.peers.delete(m.key)) this.emit();
    } else if (m.t === 'q') this.announce();
  }
  on(event, cb) { this.handlers[event] = cb; }
  onPresence(cb) { this.presenceCb = cb; }
  members() {
    const list = [];
    if (this.meta) list.push({ key: this.key, ...this.meta });
    for (const [key, p] of this.peers) list.push({ key, ...p.meta });
    return list;
  }
  emit() { this.presenceCb?.(this.members()); }
  announce() { if (this.meta) this.bc.postMessage({ t: 'p', key: this.key, meta: this.meta }); }
  subscribe() {
    this.timer = setInterval(() => {
      this.announce();
      const now = Date.now();
      let changed = false;
      for (const [k, p] of this.peers) if (now - p.seen > 3500) { this.peers.delete(k); changed = true; }
      if (changed) this.emit();
    }, 1000);
    this.bc.postMessage({ t: 'q' });
    return Promise.resolve();
  }
  track(meta) { this.meta = meta; this.announce(); this.emit(); return Promise.resolve(); }
  send(event, payload) { this.bc.postMessage({ t: 'b', event, payload }); return Promise.resolve(); }
  close() {
    clearInterval(this.timer);
    this.bc.postMessage({ t: 'l', key: this.key });
    this.bc.close();
  }
}

class LocalTransport {
  async channel(name, key) { return new LocalChannel(name, key); }
}

let instance = null;
export function getTransport() {
  if (!instance) {
    const local = new URLSearchParams(location.search).get('net') === 'local';
    instance = local ? new LocalTransport() : new SupabaseTransport();
  }
  return instance;
}
