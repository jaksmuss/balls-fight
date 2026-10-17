# Combat de balles

Simulation passive de « ball battle » : deux balles s'affrontent automatiquement dans une arène fermée.
Un seul fichier `index.html` (HTML + CSS + JavaScript, Canvas 2D), sans dépendance ni build :
ouvre-le directement dans le navigateur.

## Contrôles
- **Espace** : pause / reprise
- **R** : recommencer (ou toucher l'écran de victoire)
- **1 / 2 / 3** : vitesse x1 / x2 / x4
- URL `index.html?a=hammer&b=web` : choisir les combattants

## Combattants
- **Balle Toile** : lance un fil toutes les ~2 s. Sur un mur, c'est un grappin ; sur l'adversaire, il le ralentit 1,5 s et lui inflige des dégâts.
- **Balle Marteau** : un marteau tourne en permanence autour d'elle (8 dégâts, gros recul), et chaque coup accélère la rotation.

## Équilibrage
Tous les réglages sont dans l'objet `CONFIG` en haut de `index.html`.
Pour vérifier un réglage, ouvre la console du navigateur et tape `BallBattle.simulate(300)` :
cela lance 300 combats sans rendu et affiche les victoires et les durées.

Pour ajouter un nouveau type de balle, suis le commentaire au-dessus de la classe `Ball`.
