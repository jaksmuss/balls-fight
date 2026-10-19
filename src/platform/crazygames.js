/* Intégration du SDK CrazyGames (HTML5 v3), sans effet hors de CrazyGames.
 * Le script du SDK est chargé dans index.html ; s'il est absent ou bloqué,
 * toutes les fonctions deviennent des no-op. */
import { setPlatformMuted } from '../audio.js';

let sdk = null;
let env = 'none';
let playing = false;
let lastRoom = null;   // dernier état de salon envoyé à CrazyGames

async function safe(fn, fallback = null) {
  try { return await fn(); } catch (e) { console.warn('[CrazyGames]', e); return fallback; }
}

export const platform = {
  get env() { return env; },
  get onCrazyGames() { return env === 'crazygames'; },

  async init() {
    const g = window.CrazyGames?.SDK;
    if (!g) return;
    await safe(async () => {
      await g.init();
      sdk = g;
      env = g.environment || 'local';
      if (env === 'disabled') { sdk = null; return; }
      // réglage « couper le son » de la plateforme
      const apply = () => setPlatformMuted(!!sdk.game?.settings?.muteAudio);
      apply();
      sdk.game.addSettingsChangeListener?.(apply);
    });
  },

  loadingStart() { if (sdk) safe(() => sdk.game.loadingStart()); },
  loadingStop() { if (sdk) safe(() => sdk.game.loadingStop()); },

  gameplayStart() {
    if (!sdk || playing) return;
    playing = true;
    safe(() => sdk.game.gameplayStart());
  },
  gameplayStop() {
    if (!sdk || !playing) return;
    playing = false;
    safe(() => sdk.game.gameplayStop());
  },
  happytime() { if (sdk) safe(() => sdk.game.happytime()); },

  /** Publicité entre deux combats. Le son est coupé pendant la pub. */
  midgameAd() {
    if (!sdk) return Promise.resolve();
    return new Promise(resolve => {
      const done = () => { setPlatformMuted(!!sdk.game?.settings?.muteAudio); resolve(); };
      safe(() => sdk.ad.requestAd('midgame', {
        adStarted: () => setPlatformMuted(true),
        adFinished: done,
        adError: done,
      })).then(r => { if (r === null) done(); });
    });
  },

  /** Pseudo du joueur connecté sur CrazyGames, ou null. */
  async username() {
    if (!sdk?.user) return null;
    const u = await safe(() => sdk.user.getUser());
    return u?.username || null;
  },

  /** Lien d'invitation vers une partie privée (null hors CrazyGames). */
  inviteLink(params) {
    if (!sdk) return null;
    try { return sdk.game.inviteLink(params); } catch { return null; }
  },
  getInviteParam(name) {
    if (sdk) {
      try { const v = sdk.game.getInviteParam(name); if (v) return v; } catch { /* ignoré */ }
    }
    return new URLSearchParams(location.search).get(name);
  },

  // ------------------------------------------------------------- multijoueur
  /** Jeu lancé depuis la page multijoueur de CrazyGames : aller directement en partie. */
  isInstantMultiplayer() {
    try { return !!(sdk?.game?.isInstantMultiplayer ?? sdk?.game?.isInstantJoin); } catch { return false; }
  },
  /** Paramètres d'invitation reçus au lancement (ou null). */
  inviteParams() {
    try { return sdk?.game?.inviteParams || null; } catch { return null; }
  },
  /** Indique à CrazyGames le salon du joueur, et s'il peut être rejoint par ses amis. */
  updateRoom(room) {
    if (!sdk?.game?.updateRoom) return;
    const key = JSON.stringify(room);
    if (key === lastRoom) return;
    lastRoom = key;
    safe(() => sdk.game.updateRoom(room));
  },
  leftRoom() {
    if (!sdk?.game || lastRoom === null) return;
    lastRoom = null;
    safe(() => sdk.game.leftRoom?.());
  },
  /** Un ami rejoint / invite pendant que le jeu est déjà ouvert : cb(inviteParams). */
  onJoinRoom(cb) {
    if (!sdk?.game?.addJoinRoomListener) return;
    try { sdk.game.addJoinRoomListener(arg => cb(arg?.inviteParams ?? arg)); } catch (e) { console.warn('[CrazyGames]', e); }
  },

  /** Sauvegarde : dans le compte CrazyGames (synchronisée entre appareils) si disponible,
   *  sinon dans le navigateur. Les deux sont gardés à jour. */
  storageGet(key) {
    let v = null;
    if (sdk?.data) { try { v = sdk.data.getItem(key); } catch { /* ignoré */ } }
    if (v == null) { try { v = localStorage.getItem(key); } catch { /* ignoré */ } }
    return v;
  },
  storageSet(key, value) {
    if (sdk?.data) { try { sdk.data.setItem(key, value); } catch { /* ignoré */ } }
    try { localStorage.setItem(key, value); } catch { /* ignoré */ }
  },

  /** Langue suggérée par la plateforme (code pays / langue), si disponible. */
  languageHint() {
    try {
      const info = sdk?.user?.systemInfo;
      return info?.locale || info?.language || null;
    } catch { return null; }
  },
};
