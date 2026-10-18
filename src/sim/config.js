/* Réglages globaux de la simulation.
 * Les réglages propres à chaque combattant sont dans son fichier (src/fighters/*.js),
 * et le multiplicateur d'équilibrage auto dans src/sim/balance.js. */
export const CONFIG = {
  arena: { size: 550 },        // 11 × 11 carrés de 50
  hz: 120,                  // pas fixe de la simulation
  physics: {
    speedRelax: 2.0,        // retour à la vitesse de croisière après un recul (1/s)
    maxSpeed: 1400,
    wallJitter: 0.02,       // micro-variation d'angle au rebond (évite les trajectoires figées)
  },
  contact: {
    damage: 3,              // dégâts quand deux ennemis se percutent (chacun les subit)
    cooldown: 0.4,
  },
  defaults: { radius: 38, hp: 100, speed: 280 },
  // Multiplicateur global de tous les dégâts : règle la durée moyenne des combats.
  damageScale: 0.76,
  // Rayon des balles selon le nombre de combattants par équipe (2V2 = balles plus petites)
  teamScale: { 1: 1, 2: 0.8 },
  // Garde-fou technique : au-delà, victoire aux points (% de PV restants).
  maxTime: 240,
};

export const STEP = 1 / CONFIG.hz;
