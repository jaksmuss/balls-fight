/* Textes de l'interface en français et en anglais. */
const STRINGS = {
  fr: {
    title: 'BALLS FIGHT',
    tagline: 'Choisis ta balle. Regarde-la se battre.',
    local: 'Local',
    online: 'En ligne',
    local1v1: '1 contre 1',
    local2v2: '2 contre 2',
    online1v1: '1V1 en ligne',
    online2v2: '2V2 en ligne',
    privateRoom: 'Partie privée',
    sound: 'Son',
    language: 'Langue',
    back: 'Retour',
    fight: 'COMBATTRE !',
    random: 'Aléatoire',
    randomAll: 'Tout aléatoire',
    team: 'Équipe',
    blue: 'Bleus',
    red: 'Rouges',
    you: 'Toi',
    bot: 'IA',
    pickYourBall: 'Choisis ta balle',
    pickFor: 'Choisis pour',
    search: 'Rechercher…',
    victory: 'VICTOIRE !',
    defeat: 'DÉFAITE',
    draw: 'ÉGALITÉ',
    winsTeam: 'Victoire des {team}',
    decision: 'Victoire aux points',
    fightTime: 'Combat terminé en {t} s',
    rematch: 'Revanche',
    changeFighters: 'Changer de balles',
    menu: 'Menu',
    playAgainOnline: 'Rejouer en ligne',
    pause: 'Pause',
    speed: 'Vitesse',
    quit: 'Quitter',
    searching: 'Recherche d\'adversaires…',
    playersInQueue: '{n} joueur(s) en file d\'attente',
    cancel: 'Annuler',
    playVsAi: 'Jouer contre l\'IA en attendant',
    matchFound: 'Adversaire trouvé !',
    pickPhase: 'Choisis ta balle',
    ready: 'Prêt !',
    waiting: 'En attente…',
    starting: 'Le combat commence dans {n}…',
    createRoom: 'Créer une partie',
    joinRoom: 'Rejoindre',
    roomCode: 'Code de la partie',
    shareCode: 'Donne ce code à tes amis :',
    copyInvite: 'Copier le lien d\'invitation',
    copied: 'Copié !',
    startWithBots: 'Lancer (places vides = IA)',
    mode: 'Mode',
    playersInRoom: 'Joueurs',
    onlineUnavailable: 'Le mode en ligne est indisponible (pas de connexion au serveur).',
    connectionLost: 'Connexion perdue.',
    opponentLeft: 'Un joueur est parti : il est remplacé par l\'IA.',
    host: 'hôte',
    desync: 'désynchro',
    fighters: 'combattants',
    tapToContinue: 'Touchez pour continuer',
    controlsHint: 'Espace : pause · 1/2/3 : vitesse · Échap : quitter',
  },
  en: {
    title: 'BALLS FIGHT',
    tagline: 'Pick your ball. Watch it fight.',
    local: 'Local',
    online: 'Online',
    local1v1: '1 vs 1',
    local2v2: '2 vs 2',
    online1v1: 'Online 1V1',
    online2v2: 'Online 2V2',
    privateRoom: 'Private match',
    sound: 'Sound',
    language: 'Language',
    back: 'Back',
    fight: 'FIGHT!',
    random: 'Random',
    randomAll: 'All random',
    team: 'Team',
    blue: 'Blue',
    red: 'Red',
    you: 'You',
    bot: 'AI',
    pickYourBall: 'Pick your ball',
    pickFor: 'Pick for',
    search: 'Search…',
    victory: 'VICTORY!',
    defeat: 'DEFEAT',
    draw: 'DRAW',
    winsTeam: '{team} team wins',
    decision: 'Win on points',
    fightTime: 'Fight over in {t} s',
    rematch: 'Rematch',
    changeFighters: 'Change balls',
    menu: 'Menu',
    playAgainOnline: 'Play online again',
    pause: 'Pause',
    speed: 'Speed',
    quit: 'Quit',
    searching: 'Looking for opponents…',
    playersInQueue: '{n} player(s) in queue',
    cancel: 'Cancel',
    playVsAi: 'Play vs AI while waiting',
    matchFound: 'Match found!',
    pickPhase: 'Pick your ball',
    ready: 'Ready!',
    waiting: 'Waiting…',
    starting: 'Fight starts in {n}…',
    createRoom: 'Create a match',
    joinRoom: 'Join',
    roomCode: 'Match code',
    shareCode: 'Give this code to your friends:',
    copyInvite: 'Copy invite link',
    copied: 'Copied!',
    startWithBots: 'Start (empty slots = AI)',
    mode: 'Mode',
    playersInRoom: 'Players',
    onlineUnavailable: 'Online mode is unavailable (cannot reach the server).',
    connectionLost: 'Connection lost.',
    opponentLeft: 'A player left: replaced by the AI.',
    host: 'host',
    desync: 'desync',
    fighters: 'fighters',
    tapToContinue: 'Tap to continue',
    controlsHint: 'Space: pause · 1/2/3: speed · Esc: quit',
  },
};

let lang = 'en';
const listeners = new Set();

export function detectLanguage(hint) {
  let saved = null;
  try { saved = localStorage.getItem('bf-lang'); } catch { /* stockage indisponible */ }
  const src = (saved || hint || (typeof navigator !== 'undefined' ? navigator.language : '') || 'en').toLowerCase();
  setLanguage(src.startsWith('fr') ? 'fr' : 'en', false);
}

export function setLanguage(l, persist = true) {
  lang = STRINGS[l] ? l : 'en';
  if (persist) try { localStorage.setItem('bf-lang', lang); } catch { /* ignoré */ }
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  for (const f of listeners) f(lang);
}

export function getLanguage() { return lang; }
export function onLanguageChange(f) { listeners.add(f); }

/** Texte traduit, avec remplacement des {variables}. */
export function t(key, vars) {
  let s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}

/** Nom / description d'un combattant dans la langue courante. */
export function fighterName(meta) { return meta.name[lang] || meta.name.en; }
export function fighterDesc(meta) { return meta.desc[lang] || meta.desc.en; }
