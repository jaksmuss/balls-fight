/* Point d'entrée : écrans (menu, sélection, combat, résultats, en ligne) et boucle principale. */
import './style.css';
import { Renderer, TEAM_COLORS } from './render/renderer.js';
import { renderThumb } from './render/ballArt.js';
import { Match } from './match.js';
import { FIGHTERS, FIGHTER_IDS, getFighter } from './fighters/registry.js';
import { t, tr, fighterName, fighterDesc, detectLanguage, setLanguage, getLanguage } from './i18n.js';
import { loadProgress, progress, recordFight, xpForLevel, MAX_LEVEL, isUnlocked, equip, equipped, counterValue, achievementCount } from './progress/progress.js';
import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID } from './progress/achievements.js';
import { COSMETICS, SLOTS, findCosmetic } from './progress/cosmetics.js';
import { play, unlockAudio, isMuted, setMuted } from './audio.js';
import { platform } from './platform/crazygames.js';
import { OnlineSession, randomCode, GAME_VERSION } from './net/online.js';
import { randomSeed } from './sim/rng.js';

const canvas = document.getElementById('game');
const ui = document.getElementById('ui');
const renderer = new Renderer(canvas);

let match = null;          // combat affiché (démo derrière les menus, ou vrai combat)
let demo = false;
let session = null;        // partie en ligne en cours
let screen = '';
let fightsSinceAd = 0;
let playerName = 'Player';
let keyHandler = null;

// ======================================================================= utilitaires DOM
function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const button = (label, onClick, cls = 'btn', extra = {}) =>
  h('button', { class: cls, onclick: () => { play('click'); onClick(); }, ...extra }, label);

function setScreen(name, el) {
  screen = name;
  ui.replaceChildren(el);
  keyHandler = null;
}

const randomFighter = () => FIGHTER_IDS[(Math.random() * FIGHTER_IDS.length) | 0];
const thumbCache = new Map();
function gridThumb(id) {
  if (!thumbCache.has(id)) thumbCache.set(id, renderThumb(getFighter(id), 64));
  return thumbCache.get(id);
}
const teamName = team => t(team === 0 ? 'blue' : 'red');
const displayName = r => (r.bot ? t('bot') : r.name);

// ======================================================================= boucle
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  match?.tick(dt);
  renderer.update(dt);
  renderer.draw();
  requestAnimationFrame(frame);
}

function startDemo() {
  demo = true;
  match = new Match({
    seed: randomSeed(),
    roster: [{ fighter: randomFighter(), team: 0 }, { fighter: randomFighter(), team: 1 }],
    renderer, demo: true,
    onEnd: () => { if (demo) startDemo(); },
  });
  applyStyle('demo');
}

/** Applique l'apparence équipée. who : 'demo' | 'local' | numéro d'équipe du joueur en ligne. */
function applyStyle(who) {
  const theme = equipped('theme').id, trail = equipped('trail').id, victory = equipped('victory').id;
  if (who === 'demo') renderer.setStyle({ theme, trail: 'none', trailTeams: null, victory: 'none', victoryTeam: null });
  else if (who === 'local') renderer.setStyle({ theme, trail, trailTeams: [0, 1], victory, victoryTeam: 'any' });
  else renderer.setStyle({ theme, trail, trailTeams: [who], victory, victoryTeam: who });
}

// ======================================================================= menu
function showMenu() {
  leaveOnline();
  platform.gameplayStop();
  if (!demo) startDemo();
  const langBtn = button(getLanguage() === 'fr' ? 'English' : 'Français', () => {
    setLanguage(getLanguage() === 'fr' ? 'en' : 'fr');
    showMenu();
  }, 'btn small');
  const soundBtn = button(`${t('sound')} : ${isMuted() ? 'OFF' : 'ON'}`, () => {
    setMuted(!isMuted());
    soundBtn.textContent = `${t('sound')} : ${isMuted() ? 'OFF' : 'ON'}`;
  }, 'btn small');
  const ach = achievementCount();
  setScreen('menu', h('div', { class: 'screen dim menu' },
    h('h1', { class: 'logo', html: 'BALLS<br><span>FIGHT</span>' }),
    h('p', { class: 'tagline' }, t('tagline')),
    playerCard(),
    h('div', { class: 'menu-footer' },
      button(`🏆 ${t('achievements')} ${ach.done}/${ach.total}`, showAchievements),
      button(`🎨 ${t('style')}`, showStyle)),
    h('div', { class: 'menu-groups' },
      h('div', { class: 'menu-group' },
        h('h2', {}, t('local')),
        h('div', { class: 'row' },
          button(t('local1v1'), () => showLocalSelect(1)),
          button(t('local2v2'), () => showLocalSelect(2)))),
      h('div', { class: 'menu-group' },
        h('h2', {}, t('online')),
        h('div', { class: 'row' },
          button(t('online1v1'), () => startQueue('1v1')),
          button(t('online2v2'), () => startQueue('2v2'))),
        button(t('privateRoom'), showPrivate))),
    h('div', { class: 'menu-footer' },
      h('span', { class: 'badge' }, `${FIGHTERS.length} ${t('fighters')}`),
      langBtn, soundBtn),
    h('div', { class: 'sub', style: 'font-size:12px;opacity:0.7' }, `v${GAME_VERSION}`)));
}

// ======================================================================= sélection
/**
 * Écran de choix des combattants.
 * slots : [{ team, label, fighter, editable, ready, note }]
 * onPick(slotIndex, fighterId) ; renvoie l'élément racine + une fonction refresh.
 */
function buildPicker({ title, slots, current = 0, lockSlot = null, onPick, headRight, bottom, info }) {
  let cur = current;
  let shown = slots[cur]?.fighter || null;
  const slotsEl = h('div', { class: 'slots' });
  const infoEl = h('div', { class: 'info' });
  const cards = new Map();

  const renderInfo = id => {
    if (!id) { infoEl.replaceChildren(h('p', {}, info || t('pickYourBall'))); return; }
    const C = getFighter(id);
    infoEl.replaceChildren(renderThumb(C, 54), h('div', {}, h('h3', { style: `color:${C.meta.color === '#222831' ? '#9aa6d8' : C.meta.color}` }, fighterName(C.meta)), h('p', {}, fighterDesc(C.meta))));
  };

  const renderSlots = () => {
    // en ligne : l'emplacement actif est toujours celui du joueur
    if (lockSlot) cur = lockSlot();
    const mk = (s, i) => {
      const cls = `slot ${s.team === 0 ? 'blue' : 'red'}${i === cur && s.editable ? ' current' : ''}`;
      const thumb = h('div', { class: 'thumb' }, s.fighter ? renderThumb(getFighter(s.fighter), 48) : '?');
      return h('button', {
        class: cls,
        onclick: () => { if (s.editable) { cur = i; renderSlots(); renderInfo(s.fighter); } },
      }, thumb, h('div', { class: 'slot-text' },
        h('div', { class: 'who' }, s.label),
        h('div', { class: 'fname' }, s.fighter ? fighterName(getFighter(s.fighter).meta) : (s.note || '—')),
        s.ready ? h('div', { class: 'ready' }, '✔ ' + t('ready')) : null));
    };
    const blue = [], red = [];
    slots.forEach((s, i) => (s.team === 0 ? blue : red).push(mk(s, i)));
    slotsEl.replaceChildren(h('div', { class: 'team blue' }, blue), h('div', { class: 'vs' }, 'VS'), h('div', { class: 'team red' }, red));
    for (const [id, c] of cards) c.classList.toggle('picked', slots[cur]?.fighter === id);
  };

  const grid = h('div', { class: 'grid' });
  for (const C of FIGHTERS) {
    const id = C.meta.id;
    const card = h('button', {
      class: 'card', title: fighterDesc(C.meta),
      onclick: () => {
        if (lockSlot) cur = lockSlot();
        if (!slots[cur]?.editable) return;
        play('click');
        onPick(cur, id);
        shown = id;
        renderInfo(id);
        // passe au prochain emplacement vide
        const next = slots.findIndex((s, i) => i !== cur && s.editable && !s.fighter);
        if (next >= 0) cur = next;
        renderSlots();
      },
      onmouseenter: () => renderInfo(id),
      onmouseleave: () => renderInfo(shown),
    }, gridThumb(id), h('span', { class: 'name' }, fighterName(C.meta)));
    card.dataset.search = `${C.meta.name.fr} ${C.meta.name.en}`.toLowerCase();
    cards.set(id, card);
    grid.append(card);
  }
  const search = h('input', { type: 'search', placeholder: t('search'), 'aria-label': t('search') });
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    for (const c of cards.values()) c.style.display = !q || c.dataset.search.includes(q) ? '' : 'none';
  });
  const randomBtn = button(t('random'), () => {
    if (lockSlot) cur = lockSlot();
        if (!slots[cur]?.editable) return;
    const id = randomFighter();
    onPick(cur, id);
    shown = id;
    renderInfo(id);
    renderSlots();
  }, 'btn small');

  const root = h('div', { class: 'screen dim select' },
    h('div', { class: 'select-head' }, h('h1', {}, title), headRight || null),
    slotsEl, infoEl,
    h('div', { class: 'grid-tools' }, search, randomBtn),
    grid,
    bottom ? h('div', { class: 'bottom-bar' }, bottom) : null);
  renderSlots();
  renderInfo(shown);
  return { root, refresh: renderSlots, current: () => cur };
}

// ======================================================================= local
let lastLocal = null; // { teamSize, picks }

function showLocalSelect(teamSize, picks = null) {
  leaveOnline();
  if (!demo) startDemo();
  const n = teamSize * 2;
  const slots = [];
  for (let i = 0; i < n; i++) {
    const team = i % 2;
    slots.push({ team, label: `${teamName(team)}${teamSize > 1 ? ' ' + (Math.floor(i / 2) + 1) : ''}`, fighter: picks?.[i] || null, editable: true });
  }
  const p = buildPicker({
    title: t('pickYourBall'),
    slots,
    onPick: (i, id) => { slots[i].fighter = id; },
    bottom: [
      button(t('back'), showMenu),
      button(t('randomAll'), () => { slots.forEach(s => { s.fighter = randomFighter(); }); p.refresh(); }),
      button(t('fight'), () => startLocalFight(teamSize, slots.map(s => s.fighter || randomFighter())), 'btn primary'),
    ],
  });
  setScreen('select', p.root);
}

function startLocalFight(teamSize, picks) {
  lastLocal = { teamSize, picks };
  demo = false;
  const roster = picks.map((f, i) => ({ fighter: f, team: i % 2 }));
  match = new Match({
    seed: randomSeed(), roster, renderer,
    names: [],
    onEnd: w => showResult(w, { kind: 'local', teamSize, prog: recordFight({ world: w, online: false, teamSize, myFighters: picks }) }),
  });
  applyStyle('local');
  platform.gameplayStart();
  showFightBar(false);
}

function showFightBar(online) {
  const speedBtns = [1, 2, 4].map(s => {
    const b = button(`x${s}`, () => {
      match.speed = s;
      speedBtns.forEach(x => x.classList.toggle('active', x === b));
    }, `btn small${s === 1 ? ' active' : ''}`);
    return b;
  });
  const pauseBtn = online ? null : button(t('pause'), () => togglePause(), 'btn small');
  const desyncEl = h('span', { class: 'desync' });
  const togglePause = () => {
    match.paused = !match.paused;
    pauseBtn.classList.toggle('active', match.paused);
  };
  const quit = () => { if (online) leaveOnline(); showMenu(); };
  setScreen('fight', h('div', { class: 'fight-bar' },
    online ? null : speedBtns, pauseBtn, button('✕ ' + t('quit'), quit, 'btn small'), desyncEl));
  keyHandler = e => {
    if (e.code === 'Escape') quit();
    if (online) return;
    if (e.code === 'Space') { togglePause(); e.preventDefault(); }
    const idx = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];
    if (idx !== undefined) speedBtns[idx].click();
  };
  return desyncEl;
}

async function maybeAd() {
  fightsSinceAd++;
  if (fightsSinceAd >= 2) {
    fightsSinceAd = 0;
    await platform.midgameAd();
  }
}

function showResult(w, ctx) {
  platform.gameplayStop();
  const win = w.winnerTeam;
  let title, color = '#ffffff';
  if (win === null) title = t('draw');
  else if (ctx.kind === 'online' && ctx.myTeam !== undefined) {
    const won = win === ctx.myTeam;
    title = won ? t('victory') : t('defeat');
    color = won ? '#ffe066' : '#ff8a8a';
    play(won ? 'win' : 'lose');
    if (won) platform.happytime();
  } else {
    title = ctx.teamSize > 1 ? t('winsTeam', { team: teamName(win) }) : t('victory');
    color = TEAM_COLORS[win];
    play('win');
  }
  const winners = win === null ? [] : w.mainBalls.filter(b => b.team === win);
  const names = h('div', { class: 'winner-names' },
    winners.map((b, i) => h('span', { style: `color:${b.color === '#222831' ? '#cfd6ff' : b.color}` }, (i ? ' & ' : '') + fighterName(b.meta))));
  const sub = h('div', { class: 'sub' }, t('fightTime', { t: w.endTime.toFixed(1) }), w.decision ? ` — ${t('decision')}` : '');
  let actions;
  if (ctx.kind === 'local') {
    actions = [
      button(t('rematch'), async () => { await maybeAd(); startLocalFight(lastLocal.teamSize, lastLocal.picks); }, 'btn primary'),
      button(t('changeFighters'), async () => { await maybeAd(); showLocalSelect(lastLocal.teamSize, lastLocal.picks); }),
      button(t('menu'), showMenu),
    ];
  } else {
    actions = [
      button(t('playAgainOnline'), async () => { await maybeAd(); ctx.again(); }, 'btn primary'),
      button(t('menu'), showMenu),
    ];
  }
  setScreen('result', h('div', { class: 'overlay' },
    h('h1', { class: 'big-title', style: `color:${color}` }, title),
    names, sub, ctx.prog ? progressSummary(ctx.prog) : null, h('div', { class: 'actions' }, actions)));
}

// ======================================================================= progression
function titleName(id) { return id && id !== 'none' ? tr(findCosmetic('title', id).name) : ''; }

/** Carte du joueur (pseudo, titre, niveau, barre d'XP). */
function playerCard() {
  const pr = progress();
  const need = xpForLevel(pr.level);
  const frac = pr.level >= MAX_LEVEL ? 1 : pr.xp / need;
  const title = titleName(equipped('title').id);
  return h('div', { class: 'player-card' },
    h('div', { class: 'lvl-badge' }, h('small', {}, t('level')), String(pr.level)),
    h('div', { class: 'pc-main' },
      h('div', { class: 'pc-name' }, playerName, title ? h('span', { class: 'pc-title' }, title) : null),
      h('div', { class: 'xpbar' }, h('div', { style: `width:${(frac * 100).toFixed(1)}%` })),
      h('div', { class: 'pc-xp' }, pr.level >= MAX_LEVEL ? 'MAX' : `${pr.xp} / ${need} XP`)));
}

/** Récapitulatif de fin de combat : XP, niveau, succès et récompenses obtenus. */
function progressSummary(r) {
  const need = xpForLevel(r.level);
  const pr = progress();
  const bar = h('div', { class: 'xpbar big' }, h('div', { style: `width:${r.levelBefore === r.level ? (r.xpBefore / need * 100).toFixed(1) : 0}%` }));
  requestAnimationFrame(() => requestAnimationFrame(() => {
    bar.firstChild.style.width = `${(pr.level >= MAX_LEVEL ? 100 : pr.xp / need * 100).toFixed(1)}%`;
  }));
  const items = [];
  if (r.level > r.levelBefore) items.push(h('div', { class: 'levelup' }, t('levelUp', { n: r.level })));
  for (const a of r.newAchievements) {
    items.push(h('div', { class: `ach-pop ${a.rarity}` }, h('span', { class: 'ach-icon' }, a.icon),
      h('div', {}, h('small', {}, t('newAchievement')), h('b', {}, tr(a.name)))));
  }
  for (const u of r.newUnlocks) {
    items.push(h('div', { class: 'unlock-pop' }, `🎁 ${t('newUnlock')} — ${t('slot_' + u.slot)} : `, h('b', {}, tr(u.item.name))));
  }
  if (r.newAchievements.length || r.level > r.levelBefore) setTimeout(() => play('win'), 400);
  return h('div', { class: 'prog-summary' },
    h('div', { class: 'xp-line' }, h('span', { class: 'lvl-badge small' }, h('small', {}, t('level')), String(pr.level)), bar, h('b', { class: 'xp-gain' }, `+${r.xp} XP`)),
    items);
}

function showAchievements() {
  const done = progress().achievements;
  const order = { epic: 2, rare: 1, common: 0 };
  const list = [...ACHIEVEMENTS].sort((a, b) => (!!done[b.id] - !!done[a.id]) || order[a.rarity] - order[b.rarity]);
  const cnt = achievementCount();
  setScreen('achievements', h('div', { class: 'screen dim select' },
    h('div', { class: 'select-head' }, h('h1', {}, `🏆 ${t('achievements')}`), h('div', { class: 'timer' }, `${cnt.done}/${cnt.total}`)),
    h('div', { class: 'ach-grid' }, list.map(a => {
      const ok = !!done[a.id];
      const prog = a.counter && !ok ? h('div', { class: 'xpbar' }, h('div', { style: `width:${Math.min(100, counterValue(a.counter) / a.goal * 100)}%` })) : null;
      const reward = a.title ? h('div', { class: 'ach-reward' }, `🎖 ${t('slot_title')} : ${titleName(a.title)}`) : null;
      return h('div', { class: `ach ${a.rarity}${ok ? ' done' : ''}` },
        h('div', { class: 'ach-icon' }, ok ? a.icon : '🔒'),
        h('div', { class: 'ach-text' },
          h('div', { class: 'ach-name' }, tr(a.name), h('span', { class: 'ach-rarity' }, t('rarity_' + a.rarity))),
          h('div', { class: 'ach-desc' }, tr(a.desc)),
          prog, reward));
    })),
    h('div', { class: 'bottom-bar' }, button(t('back'), showMenu))));
}

function showStyle() {
  const sections = SLOTS.map(slot => {
    const cur = equipped(slot).id;
    return h('div', { class: 'style-section' },
      h('h2', {}, t('slot_' + slot)),
      h('div', { class: 'chips' }, COSMETICS[slot].map(c => {
        const ok = isUnlocked(c);
        const req = !c.unlock ? '' : c.unlock.level ? t('unlockLevel', { n: c.unlock.level }) : t('unlockAchievement', { a: tr(ACHIEVEMENT_BY_ID.get(c.unlock.achievement)?.name) });
        return h('button', {
          class: `chip${c.id === cur ? ' active' : ''}${ok ? '' : ' locked'}`,
          title: ok ? '' : req,
          onclick: () => {
            if (!ok) return;
            play('click');
            equip(slot, c.id);
            applyStyle('demo');
            showStyle();
          },
        }, ok ? tr(c.name) : `🔒 ${tr(c.name)}`, ok ? null : h('small', {}, req));
      })));
  });
  setScreen('style', h('div', { class: 'screen dim select' },
    h('div', { class: 'select-head' }, h('h1', {}, `🎨 ${t('style')}`)),
    playerCard(),
    h('p', { class: 'sub' }, t('styleHint')),
    sections,
    h('div', { class: 'bottom-bar' }, button(t('back'), showMenu))));
}

// ======================================================================= en ligne
function leaveOnline() {
  if (session) { session.leave(); session = null; }
}

function newSession() {
  leaveOnline();
  const pr = progress();
  const s = session = new OnlineSession({
    name: playerName,
    profile: { level: pr.level, title: equipped('title').id === 'none' ? null : equipped('title').id },
    onUpdate: x => { if (x === session) onSessionUpdate(x); },
    onStart: info => { if (s === session) startOnlineFight(s, info); },
  });
  return s;
}

function startQueue(mode) {
  if (!demo) startDemo();
  const s = newSession();
  showQueue(s);
  s.findMatch(mode);
}

function showQueue(s) {
  const count = h('div', { class: 'sub' });
  const vsAi = button(t('playVsAi'), () => {
    const n = s.mode === '2v2' ? 2 : 1;
    leaveOnline();
    showLocalSelect(n);
  });
  vsAi.style.display = 'none';
  setTimeout(() => { if (session === s && s.phase === 'queue') vsAi.style.display = ''; }, 12000);
  setScreen('queue', h('div', { class: 'overlay' },
    h('div', { class: 'panel' },
      h('h2', {}, s.mode === '2v2' ? t('online2v2') : t('online1v1')),
      h('div', { class: 'spinner' }),
      h('div', {}, t('searching')),
      count, vsAi,
      button(t('cancel'), showMenu))));
  s.ui = { count };
  updateQueue(s);
}
function updateQueue(s) {
  if (screen === 'queue' && s.ui?.count) s.ui.count.textContent = t('playersInQueue', { n: Math.max(1, s.queueCount) });
}

function onSessionUpdate(s) {
  if (s.phase === 'queue') updateQueue(s);
  else if (s.phase === 'room') {
    if (screen !== 'room') showRoom(s);
    else s.ui?.refresh?.();
  } else if (s.phase === 'error') showOnlineError(s);
  else if (s.phase === 'countdown' || s.phase === 'fight') {
    if (s.desync && s.ui?.desync) s.ui.desync.textContent = '⚠ ' + t('desync');
  }
}

function showRoom(s) {
  const N = s.size;
  const slots = [];
  const sync = () => {
    slots.length = 0;
    for (let i = 0; i < N; i++) {
      const m = s.members[i];
      slots.push({
        team: i % 2,
        label: m ? (m.me ? `${t('you')} — ${m.name}` : m.name) + (m.lvl ? ` · ${t('level')} ${m.lvl}` : '') + (m.present ? '' : ` (${t('bot')})`) : t('waiting'),
        fighter: m?.me ? s.myPick : m?.fighter,
        editable: !!m?.me && !s.ready,
        ready: m?.ready,
        note: m ? (m.present ? '…' : t('bot')) : t('waiting'),
      });
    }
  };
  sync();
  const timer = h('div', { class: 'timer' });
  const readyBtn = button(t('ready'), () => { s.setReady(); readyBtn.disabled = true; }, 'btn primary');
  const startBtn = s.isPrivate ? button(t('startWithBots'), () => s.startNow()) : null;
  const head = s.isPrivate
    ? h('div', { style: 'text-align:right' }, h('div', { class: 'sub' }, t('roomCode')), h('div', { class: 'code', style: 'font-size:28px;letter-spacing:4px' }, s.code))
    : timer;
  const myIndex = () => Math.max(0, s.members.findIndex(m => m.me));
  const p = buildPicker({
    title: t('pickPhase'),
    slots,
    lockSlot: myIndex,
    onPick: (i, id) => { s.pick(id); },
    headRight: head,
    bottom: [button(t('quit'), showMenu), startBtn, readyBtn],
  });
  setScreen('room', p.root);
  const tick = setInterval(() => {
    if (screen !== 'room' || session !== s) { clearInterval(tick); return; }
    if (s.deadline) timer.textContent = Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000));
    if (startBtn) startBtn.style.display = s.isHost ? '' : 'none';
  }, 250);
  s.ui = { refresh: () => { sync(); p.refresh(); } };
}

function startOnlineFight(s, info) {
  demo = false;
  const names = info.roster.map(displayName);
  match = new Match({
    seed: info.seed, roster: info.roster, names, renderer,
    online: true, startAt: info.startAt,
    onHash: (tick, hsh) => s.reportHash(tick, hsh),
    onEnd: w => {
      const again = s.isPrivate ? () => joinPrivate(s.code) : () => startQueue(s.mode);
      const mine = info.roster[info.myIndex];
      const prog = recordFight({ world: w, online: true, teamSize: s.size / 2, myTeam: s.myTeam, myFighters: mine ? [mine.fighter] : [], privateMatch: !!s.isPrivate });
      showResult(w, { kind: 'online', myTeam: s.myTeam, teamSize: s.size / 2, again, prog });
      leaveOnline();
    },
  });
  applyStyle(s.myTeam ?? 0);
  const desync = showFightBar(true);
  s.ui = { desync };
  // compte à rebours
  const cd = h('div', { class: 'overlay', style: 'background:transparent;pointer-events:none' }, h('div', { class: 'countdown' }));
  ui.append(cd);
  let lastN = null;
  const iv = setInterval(() => {
    const ms = info.startAt - Date.now();
    const n = Math.ceil(ms / 1000);
    if (ms <= -700 || session !== s) { clearInterval(iv); cd.remove(); return; }
    const label = ms > 0 ? String(n) : 'GO!';
    if (label !== lastN) {
      lastN = label;
      cd.firstChild.textContent = label;
      cd.firstChild.style.animation = 'none';
      void cd.firstChild.offsetWidth;
      cd.firstChild.style.animation = 'pop 0.4s cubic-bezier(0.2,1.6,0.4,1)';
      play(ms > 0 ? 'countdown' : 'go');
      if (ms <= 0) platform.gameplayStart();
    }
  }, 50);
}

function showOnlineError(s) {
  const msg = s.error === 'room-full' ? t('roomFull') : s.error === 'room-not-found' ? t('roomNotFound') : t('onlineUnavailable');
  setScreen('error', h('div', { class: 'overlay' },
    h('div', { class: 'panel' },
      h('h2', {}, t('online')),
      h('p', { class: 'notice' }, msg),
      h('p', { class: 'sub', style: 'font-size:12px' }, s.error || ''),
      button(t('back'), showMenu))));
}

// ----------------------------------------------------------------- partie privée
function showPrivate() {
  if (!demo) startDemo();
  let mode = '1v1';
  const toggle = h('div', { class: 'toggle' });
  const renderToggle = () => toggle.replaceChildren(...['1v1', '2v2'].map(m =>
    button(m.toUpperCase(), () => { mode = m; renderToggle(); }, `btn small${mode === m ? ' active' : ''}`)));
  renderToggle();
  const input = h('input', { class: 'code-input', maxlength: 5, placeholder: 'ABCDE', 'aria-label': t('roomCode') });
  setScreen('private', h('div', { class: 'overlay' },
    h('div', { class: 'panel' },
      h('h2', {}, t('privateRoom')),
      h('div', { class: 'sub' }, t('mode')),
      toggle,
      button(t('createRoom'), () => createPrivate(mode), 'btn primary'),
      h('hr', { style: 'border:none;border-top:1px solid rgba(140,160,255,0.25);width:100%' }),
      h('div', { class: 'sub' }, t('roomCode')),
      input,
      button(t('joinRoom'), () => { const c = input.value.trim(); if (c.length >= 4) joinPrivate(c); }),
      button(t('back'), showMenu, 'btn ghost'))));
}

function createPrivate(mode) {
  const s = newSession();
  s.code = randomCode();
  showInvite(s);
  s.joinPrivate(s.code, mode);
}

function joinPrivate(code) {
  const s = newSession();
  s.joinPrivate(code);
}

function showInvite(s) {
  const link = platform.inviteLink({ room: s.code }) || `${location.origin}${location.pathname}?room=${s.code}`;
  const copyBtn = button(t('copyInvite'), async () => {
    try { await navigator.clipboard.writeText(link); copyBtn.textContent = t('copied'); } catch { /* presse-papiers refusé */ }
  });
  // l'écran de salon remplace celui-ci dès que la présence est synchronisée ;
  // on garde le code visible dans l'en-tête du salon
  setScreen('invite', h('div', { class: 'overlay' },
    h('div', { class: 'panel' },
      h('h2', {}, t('privateRoom')),
      h('div', { class: 'sub' }, t('shareCode')),
      h('div', { class: 'code' }, s.code),
      copyBtn,
      h('div', { class: 'spinner' }),
      button(t('back'), showMenu, 'btn ghost'))));
  // afficher le salon après un court instant pour laisser le temps de copier le code
  s.ui = {};
  const orig = s.onUpdate;
  let shown = false;
  s.onUpdate = x => {
    if (x.phase === 'room' && !shown) {
      shown = true;
      setTimeout(() => { if (session === s && s.phase === 'room') showRoom(s); }, 2500);
      return;
    }
    if (shown) orig(x);
  };
}

// ======================================================================= démarrage
async function boot() {
  platform.loadingStart();
  await platform.init();
  detectLanguage(platform.languageHint());
  loadProgress();
  try {
    playerName = (await platform.username()) || localStorage.getItem('bf-name') || '';
    if (!playerName) {
      playerName = 'Ball' + Math.floor(1000 + Math.random() * 9000);
      localStorage.setItem('bf-name', playerName);
    }
  } catch { playerName = 'Ball' + Math.floor(1000 + Math.random() * 9000); }

  window.addEventListener('resize', () => renderer.resize());
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', e => { unlockAudio(); keyHandler?.(e); });
  document.fonts?.load?.('20px "Lilita One"').catch(() => {});

  showMenu();
  renderer.resize();
  requestAnimationFrame(frame);
  platform.loadingStop();

  // lien d'invitation (?room=CODE ou paramètre CrazyGames)
  const code = platform.getInviteParam('room');
  if (code) joinPrivate(code);
}

boot();

// accès console pour le débogage : BallsFight.match.world
window.BallsFight = { get match() { return match; }, get session() { return session; }, renderer };
