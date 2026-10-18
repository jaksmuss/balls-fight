/* Registre de tous les combattants jouables.
 * Pour ajouter un combattant : écris sa classe (voir src/fighters/README.md),
 * puis ajoute-la à la liste ALL ci-dessous. L'ordre est celui de l'écran de sélection. */
import { CLASSICS } from './classics.js';
import { ELEMENTS } from './elements.js';
import { PROJECTILES } from './projectiles.js';
import { MOVEMENT } from './movement.js';
import { SUMMONERS } from './summoners.js';
import { CONTROL } from './control.js';
import { WILD } from './wild.js';
import { MISC } from './misc.js';

const ALL = [...CLASSICS, ...ELEMENTS, ...PROJECTILES, ...MOVEMENT, ...SUMMONERS, ...CONTROL, ...WILD, ...MISC];

const BY_ID = new Map();
for (const C of ALL) {
  if (BY_ID.has(C.meta.id)) throw new Error(`Identifiant de combattant en double : ${C.meta.id}`);
  BY_ID.set(C.meta.id, C);
}

export const FIGHTER_IDS = ALL.map(C => C.meta.id);
export const FIGHTERS = ALL;

export function getFighter(id) {
  const C = BY_ID.get(id);
  if (!C) throw new Error(`Combattant inconnu : ${id}`);
  return C;
}

export function hasFighter(id) { return BY_ID.has(id); }
