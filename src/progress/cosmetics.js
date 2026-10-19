/* Récompenses visuelles : titres, traînées, effets de victoire, thèmes d'arène.
 * `unlock` : { level: n } (niveau de joueur) ou { achievement: id } ; absent = disponible d'office.
 * Tout est purement visuel : aucun effet sur les combats. */

export const COSMETICS = {
  title: [
    { id: 'none', name: { fr: 'Aucun', en: 'None' } },
    { id: 'rookie', name: { fr: 'Débutant', en: 'Rookie' }, unlock: { level: 2 } },
    { id: 'brawler', name: { fr: 'Bagarreur', en: 'Brawler' }, unlock: { level: 6 } },
    { id: 'champion', name: { fr: 'Champion de l\'arène', en: 'Arena champion' }, unlock: { level: 10 } },
    { id: 'legend', name: { fr: 'Légende des balles', en: 'Ball legend' }, unlock: { level: 20 } },
    { id: 'chaos', name: { fr: 'Maître du chaos', en: 'Master of chaos' }, unlock: { level: 30 } },
    { id: 'comeback', name: { fr: 'Roi de la remontada', en: 'Comeback king' }, unlock: { achievement: 'comeback' } },
    { id: 'untouchable', name: { fr: 'Intouchable', en: 'Untouchable' }, unlock: { achievement: 'flawless' } },
    { id: 'mirror', name: { fr: 'Miroir, mon beau miroir', en: 'Mirror, mirror' }, unlock: { achievement: 'mirror_kill' } },
    { id: 'collector', name: { fr: 'Collectionneur', en: 'Collector' }, unlock: { achievement: 'variety_64' } },
    { id: 'veteran', name: { fr: 'Vétéran', en: 'Veteran' }, unlock: { achievement: 'fights_500' } },
    { id: 'terror', name: { fr: 'Terreur en ligne', en: 'Online terror' }, unlock: { achievement: 'online_wins_50' } },
  ],
  trail: [
    { id: 'none', name: { fr: 'Aucune', en: 'None' } },
    { id: 'stars', name: { fr: 'Étoiles', en: 'Stars' }, unlock: { level: 3 } },
    { id: 'fire', name: { fr: 'Flammes', en: 'Flames' }, unlock: { level: 7 } },
    { id: 'bubbles', name: { fr: 'Bulles', en: 'Bubbles' }, unlock: { level: 12 } },
    { id: 'rainbow', name: { fr: 'Arc-en-ciel', en: 'Rainbow' }, unlock: { level: 18 } },
    { id: 'lightning', name: { fr: 'Étincelles', en: 'Sparks' }, unlock: { level: 23 } },
    { id: 'hearts', name: { fr: 'Cœurs', en: 'Hearts' }, unlock: { level: 28 } },
    { id: 'pixels', name: { fr: 'Pixels', en: 'Pixels' }, unlock: { level: 35 } },
  ],
  victory: [
    { id: 'none', name: { fr: 'Aucun', en: 'None' } },
    { id: 'confetti', name: { fr: 'Confettis', en: 'Confetti' }, unlock: { level: 4 } },
    { id: 'fireworks', name: { fr: 'Feu d\'artifice', en: 'Fireworks' }, unlock: { level: 9 } },
    { id: 'lightning', name: { fr: 'Orage', en: 'Thunderstorm' }, unlock: { level: 16 } },
    { id: 'gold', name: { fr: 'Pluie d\'or', en: 'Gold rain' }, unlock: { level: 26 } },
  ],
  theme: [
    { id: 'classic', name: { fr: 'Nuit', en: 'Night' } },
    { id: 'lava', name: { fr: 'Lave', en: 'Lava' }, unlock: { level: 5 } },
    { id: 'ice', name: { fr: 'Glace', en: 'Ice' }, unlock: { level: 8 } },
    { id: 'neon', name: { fr: 'Néon', en: 'Neon' }, unlock: { level: 14 } },
    { id: 'space', name: { fr: 'Espace', en: 'Space' }, unlock: { level: 20 } },
    { id: 'candy', name: { fr: 'Bonbons', en: 'Candy' }, unlock: { level: 30 } },
    { id: 'gold', name: { fr: 'Arène dorée', en: 'Golden arena' }, unlock: { achievement: 'fights_500' } },
  ],
};

export const SLOTS = ['title', 'trail', 'victory', 'theme'];

export function findCosmetic(slot, id) {
  return COSMETICS[slot].find(c => c.id === id) || COSMETICS[slot][0];
}
