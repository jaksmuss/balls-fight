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
class SupabaseChannel {
  constructor(client, name, key) {
    this.client = client;
    this.ch = client.channel(name, { config: { presence: { key }, broadcast: { self: false } } });
    this.presenceCb = null;
    this.ch.on('presence', { event: 'sync' }, () => this.presenceCb?.(this.members()));
  }
  on(event, cb) { this.ch.on('broadcast', { event }, msg => cb(msg.payload)); }
  onPresence(cb) { this.presenceCb = cb; }
  members() {
    const st = this.ch.presenceState();
    return Object.entries(st).map(([key, metas]) => ({ key, ...metas[metas.length - 1] }));
  }
  subscribe() {
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('TIMED_OUT')); } }, 10000);
      this.ch.subscribe(status => {
        if (done) return;
        if (status === 'SUBSCRIBED') { done = true; clearTimeout(timer); resolve(); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          done = true; clearTimeout(timer); reject(new Error(status));
        }
      });
    });
  }
  track(meta) { return this.ch.track(meta); }
  send(event, payload) { return this.ch.send({ type: 'broadcast', event, payload }); }
  close() {
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
