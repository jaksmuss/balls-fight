# Créer un combattant

Chaque combattant est une classe qui étend `Ball` (`src/sim/ball.js`). Les fichiers de ce dossier regroupent les combattants par familles. Ajoute le tien dans le fichier le plus proche, ou dans un nouveau fichier.

## 1. La classe

```js
import { Ball } from '../sim/ball.js';
import * as M from '../sim/dmath.js';
import { shoot, aim, circle } from './helpers.js';

export class EtoileBall extends Ball {
  static meta = {
    id: 'etoile',                    // identifiant unique (sert en ligne : ne plus le changer)
    color: '#ffcc00',
    name: { fr: 'Étoile', en: 'Star' },
    desc: { fr: 'Description en une phrase.', en: 'One-sentence description.' },
    // optionnel : radius, hp, speed, mass
  };

  // Capacité : appelée à chaque pas de simulation (120 fois par seconde)
  update(dt) {
    if (this.timer('tir', 2, dt)) {          // toutes les 2 s (ralenti/bloqué par les statuts)
      const t = this.target();               // ennemi le plus proche
      if (t) shoot(this, aim(this, t, 0.1), 500, { damage: 5, color: '#fff' });
    }
  }

  // Motif dessiné sur la balle (aussi utilisé pour la vignette de sélection)
  drawIcon(ctx, r) {
    ctx.fillStyle = '#fff';
    circle(ctx, 0, 0, r * 0.4);
    ctx.fill();
  }
}
```

## 2. L'enregistrer

Ajoute la classe à la liste exportée en bas de son fichier (par exemple `MISC`), ou importe-la dans `registry.js`.

## 3. Vérifier et équilibrer

```bash
npm test          # aucun crash + déterminisme
npm run balance   # calcule son multiplicateur de puissance
```

## La règle d'or : le déterminisme

Le mode en ligne repose sur le fait que **tous les navigateurs calculent le même combat**. Tout ce qui influence la simulation (`update`, `onContact`, `onWall`, `modifyIncoming`…) doit donc respecter trois règles :

- utiliser `M.sin`, `M.cos`, `M.atan2`, `M.hypot`… de `src/sim/dmath.js`, **jamais** `Math.sin`, `Math.cos`, etc. ;
- utiliser `this.world.rng` pour l'aléatoire, **jamais** `Math.random` ;
- ne pas dépendre de l'heure ni de l'affichage.

`npm test` fait échouer tout appel interdit pendant la simulation. Les méthodes `draw*` ne servent qu'à l'affichage : elles peuvent utiliser `Math` librement.

## Outils disponibles

| Outil | Rôle |
|---|---|
| `this.timer(nom, période, dt, premier?)` | renvoie `true` à intervalle régulier |
| `this.target({ mainOnly })` | ennemi le plus proche |
| `shoot(this, angle, vitesse, options)` | projectile (`damage`, `bounces`, `homing`, `pierce`, `onHit`, `onWall`…) |
| `this.world.damage(cible, n, this, { color, big })` | dégâts |
| `this.world.heal(cible, n)` | soin |
| `this.world.explode(x, y, rayon, dégâts, this)` | explosion |
| `this.world.ray(x, y, angle, équipe)` | rayon jusqu'au mur + ennemis touchés |
| `this.world.spawn(entité)` | entités (`Projectile`, `Zone`, `Delayed`, ou classe dérivée d'`Entity`) |
| `this.world.summon(Classe, this, opts)` | invocation (balle qui ne compte pas pour la victoire) |
| `cible.applySlow / stun / root / silence / addDot / slam` | statuts |
| `this.world.emit('zap' / 'ring' / 'burst' / 'shake' …)` | effets visuels |

Crochets à surcharger : `init`, `update`, `onWall`, `onContact`, `contactBonus`, `modifyIncoming`, `modifyOutgoing`, `onDamaged`, `onDealtDamage`, `preventDeath`, `speedFactor`, `drawIcon`, `drawUnder`, `drawOver`.
