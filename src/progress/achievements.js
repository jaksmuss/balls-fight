/* Liste des succès.
 * Un succès a soit un compteur (`counter` + `goal`, valeur lue dans la progression),
 * soit une condition `check(ctx)` évaluée à la fin de chaque combat.
 *
 * ctx = {
 *   world,        // le monde à la fin du combat (world.stats, world.mainBalls...)
 *   online,       // combat en ligne ?
 *   teamSize,     // 1 ou 2
 *   subjectTeam,  // équipe « du joueur » : la sienne en ligne, le vainqueur en local
 *   won,          // l'équipe du joueur a gagné
 *   privateMatch,
 * }
 * Pour ajouter un succès : ajouter une entrée ici (id unique, ne plus le changer). */

export const RARITY_XP = { common: 50, rare: 120, epic: 300 };

const SUMMONERS = new Set(['necro', 'swarm', 'engineer', 'slime', 'illusion']);
const winners = ctx => ctx.world.mainBalls.filter(b => b.team === ctx.world.winnerTeam);
const teamHp = ctx => winners(ctx).reduce((s, b) => s + Math.max(0, b.hp), 0);

export const ACHIEVEMENTS = [
  // ------------------------------------------------------------ parcours
  { id: 'first_fight', icon: '🥊', rarity: 'common', counter: 'fights', goal: 1,
    name: { fr: 'Premier round', en: 'First round' }, desc: { fr: 'Termine ton premier combat.', en: 'Finish your first fight.' } },
  { id: 'fights_25', icon: '⚔️', rarity: 'common', counter: 'fights', goal: 25,
    name: { fr: 'Habitué', en: 'Regular' }, desc: { fr: 'Termine 25 combats.', en: 'Finish 25 fights.' } },
  { id: 'fights_100', icon: '🏟️', rarity: 'rare', counter: 'fights', goal: 100,
    name: { fr: 'Pilier de l\'arène', en: 'Arena regular' }, desc: { fr: 'Termine 100 combats.', en: 'Finish 100 fights.' } },
  { id: 'fights_500', icon: '👑', rarity: 'epic', counter: 'fights', goal: 500, title: 'veteran',
    name: { fr: 'Vétéran', en: 'Veteran' }, desc: { fr: 'Termine 500 combats.', en: 'Finish 500 fights.' } },
  { id: 'variety_10', icon: '🎨', rarity: 'common', counter: 'variety', goal: 10,
    name: { fr: 'Curieux', en: 'Curious' }, desc: { fr: 'Fais combattre 10 balles différentes.', en: 'Fight with 10 different balls.' } },
  { id: 'variety_32', icon: '🌈', rarity: 'rare', counter: 'variety', goal: 32,
    name: { fr: 'Touche-à-tout', en: 'Jack of all trades' }, desc: { fr: 'Fais combattre 32 balles différentes.', en: 'Fight with 32 different balls.' } },
  { id: 'variety_64', icon: '📚', rarity: 'epic', counter: 'variety', goal: 64, title: 'collector',
    name: { fr: 'Collectionneur', en: 'Collector' }, desc: { fr: 'Fais combattre les 64 balles.', en: 'Fight with all 64 balls.' } },
  { id: 'online_first', icon: '🌐', rarity: 'common', counter: 'onlineFights', goal: 1,
    name: { fr: 'Connecté', en: 'Connected' }, desc: { fr: 'Joue un combat en ligne.', en: 'Play an online fight.' } },
  { id: 'online_win', icon: '🏆', rarity: 'common', counter: 'onlineWins', goal: 1,
    name: { fr: 'Première victoire', en: 'First win' }, desc: { fr: 'Gagne un combat en ligne.', en: 'Win an online fight.' } },
  { id: 'online_wins_10', icon: '🥇', rarity: 'rare', counter: 'onlineWins', goal: 10,
    name: { fr: 'Redoutable', en: 'Formidable' }, desc: { fr: 'Gagne 10 combats en ligne.', en: 'Win 10 online fights.' } },
  { id: 'online_wins_50', icon: '💎', rarity: 'epic', counter: 'onlineWins', goal: 50, title: 'terror',
    name: { fr: 'Terreur en ligne', en: 'Online terror' }, desc: { fr: 'Gagne 50 combats en ligne.', en: 'Win 50 online fights.' } },
  { id: 'duo', icon: '🤝', rarity: 'rare',
    name: { fr: 'Esprit d\'équipe', en: 'Team spirit' }, desc: { fr: 'Gagne un 2V2 en ligne.', en: 'Win an online 2V2.' },
    check: c => c.online && c.teamSize === 2 && c.won },
  { id: 'private', icon: '✉️', rarity: 'common',
    name: { fr: 'Entre amis', en: 'Among friends' }, desc: { fr: 'Joue une partie privée.', en: 'Play a private match.' },
    check: c => c.privateMatch },

  // ------------------------------------------------------------ moments
  { id: 'comeback', icon: '😰', rarity: 'rare', title: 'comeback',
    name: { fr: 'Remontada', en: 'Comeback' }, desc: { fr: 'Gagne avec moins de 5 PV au total.', en: 'Win with less than 5 HP left in total.' },
    check: c => c.won && teamHp(c) < 5 },
  { id: 'flawless', icon: '✨', rarity: 'epic', title: 'untouchable',
    name: { fr: 'K.O. parfait', en: 'Flawless' }, desc: { fr: 'Gagne avec une balle qui n\'a pris aucun dégât.', en: 'Win with a ball that took no damage at all.' },
    check: c => c.won && winners(c).some(b => !b.dmgTaken) },
  { id: 'dominant', icon: '💪', rarity: 'common',
    name: { fr: 'Écrasant', en: 'Crushing' }, desc: { fr: 'Gagne en gardant au moins 75 % de PV.', en: 'Win with at least 75% HP left.' },
    check: c => c.won && winners(c).every(b => b.hp / b.maxHp >= 0.75) },
  { id: 'blitz', icon: '⚡', rarity: 'common',
    name: { fr: 'Éclair', en: 'Blitz' }, desc: { fr: 'Un combat qui se termine en moins de 20 s.', en: 'A fight that ends in under 20 s.' },
    check: c => c.world.endTime < 20 },
  { id: 'marathon', icon: '🐢', rarity: 'rare',
    name: { fr: 'Marathon', en: 'Marathon' }, desc: { fr: 'Un combat qui dure plus de 2 minutes.', en: 'A fight that lasts over 2 minutes.' },
    check: c => c.world.endTime > 120 },
  { id: 'decision', icon: '📋', rarity: 'rare',
    name: { fr: 'Aux points', en: 'On points' }, desc: { fr: 'Un combat décidé aux points.', en: 'A fight decided on points.' },
    check: c => c.world.decision },
  { id: 'draw', icon: '🤷', rarity: 'rare',
    name: { fr: 'Match nul', en: 'Dead heat' }, desc: { fr: 'Les deux camps tombent en même temps.', en: 'Both sides fall at the same time.' },
    check: c => c.world.winnerTeam === null && !c.world.decision },
  { id: 'self_destruct', icon: '🧨', rarity: 'rare',
    name: { fr: 'Pétard mouillé', en: 'Own goal' }, desc: { fr: 'Une balle s\'élimine elle-même.', en: 'A ball knocks itself out.' },
    check: c => c.world.stats.kills.some(k => k.src === k.victim) },
  { id: 'mirror_kill', icon: '🪞', rarity: 'epic', title: 'mirror',
    name: { fr: 'Retour à l\'envoyeur', en: 'Return to sender' }, desc: { fr: 'Élimine une balle avec ses propres dégâts renvoyés.', en: 'Knock out a ball with its own reflected damage.' },
    check: c => c.world.stats.kills.some(k => k.kind === 'reflect' || k.reflected) },
  { id: 'slam_kill', icon: '🧱', rarity: 'rare',
    name: { fr: 'Dans le mur', en: 'Into the wall' }, desc: { fr: 'Élimine une balle en l\'écrasant contre un mur.', en: 'Knock out a ball by slamming it into a wall.' },
    check: c => c.world.stats.kills.some(k => k.kind === 'slam') },
  { id: 'dot_kill', icon: '🔥', rarity: 'common',
    name: { fr: 'À petit feu', en: 'Slow burn' }, desc: { fr: 'Élimine une balle avec des dégâts sur la durée.', en: 'Knock out a ball with damage over time.' },
    check: c => c.world.stats.kills.some(k => k.kind === 'dot' && !k.victim.summon) },
  { id: 'summon_kill', icon: '💀', rarity: 'rare',
    name: { fr: 'Armée des ombres', en: 'Army of shadows' }, desc: { fr: 'Une invocation porte le coup fatal.', en: 'A summon lands the final blow.' },
    check: c => c.world.stats.kills.some(k => k.src?.summon && !k.victim.summon) },
  { id: 'angel', icon: '😇', rarity: 'rare',
    name: { fr: 'Miracle', en: 'Miracle' }, desc: { fr: 'L\'Ange ressuscite… et gagne.', en: 'The Angel revives… and wins.' },
    check: c => winners(c).some(b => b.fighterId === 'angel' && b.tags.revived) },
  { id: 'big_hit', icon: '💥', rarity: 'rare',
    name: { fr: 'Coup de massue', en: 'Sledgehammer' }, desc: { fr: 'Un seul coup de 20 dégâts ou plus.', en: 'A single hit of 20 damage or more.' },
    check: c => c.world.stats.maxHit >= 20 },
  { id: 'chaos', icon: '🌪️', rarity: 'common',
    name: { fr: 'Chaos total', en: 'Total chaos' }, desc: { fr: 'Plus de 120 coups dans un seul combat.', en: 'Over 120 hits in a single fight.' },
    check: c => c.world.stats.hits >= 120 },
  { id: 'mirror_match', icon: '👯', rarity: 'common',
    name: { fr: 'Duel de jumeaux', en: 'Twin duel' }, desc: { fr: 'Un 1V1 entre deux balles identiques.', en: 'A 1V1 between two identical balls.' },
    check: c => c.teamSize === 1 && c.world.mainBalls[0].fighterId === c.world.mainBalls[1].fighterId },
  { id: 'snowball', icon: '☃️', rarity: 'rare',
    name: { fr: 'Avalanche', en: 'Avalanche' }, desc: { fr: 'La Boule de neige atteint sa taille maximale.', en: 'The Snowball reaches its maximum size.' },
    check: c => c.world.mainBalls.some(b => b.fighterId === 'snowball' && b.r >= b.baseR * 1.7) },
  { id: 'summoners', icon: '🧙', rarity: 'epic',
    name: { fr: 'Invocation suprême', en: 'Grand summoning' }, desc: { fr: 'Gagne un 2V2 avec deux invocateurs.', en: 'Win a 2V2 with two summoners.' },
    check: c => c.won && c.teamSize === 2 && winners(c).every(b => SUMMONERS.has(b.fighterId)) },
];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map(a => [a.id, a]));
