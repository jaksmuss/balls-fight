# Balls Fight

Choisis ta balle, regarde-la se battre. Simulation de « combat de balles » (style vidéos TikTok) avec **64 combattants aux capacités uniques**, en **1V1** et **2V2**, en local ou **en ligne**. Conçu pour être publié sur **CrazyGames**.

## Lancer le jeu

```bash
npm install
npm run dev        # serveur de développement
npm run build      # version de production dans dist/
npm run preview    # tester la version de production
```

Le jeu est en **français et en anglais** : la langue est détectée automatiquement et se change depuis le menu.

## Publier sur CrazyGames

1. `npm run build`
2. Zipper **le contenu** du dossier `dist/` (pas le dossier lui-même) : `cd dist && zip -r ../balls-fight.zip .`
3. Envoyer le zip sur le portail développeur CrazyGames (type « HTML5 »).

Ce qui est déjà intégré (`src/platform/crazygames.js`) :

- le SDK v3 est chargé dans `index.html` ;
- `loadingStart` / `loadingStop` au démarrage ;
- `gameplayStart` / `gameplayStop` au début et à la fin de chaque combat ;
- publicité *midgame* tous les 2 combats, au clic sur « Revanche » ou « Rejouer » (le son est coupé pendant la pub) ;
- `happytime` lors d'une victoire en ligne ;
- réglage « couper le son » de la plateforme respecté (aucun contexte audio n'est créé tant que le son est coupé) ;
- pseudo CrazyGames utilisé en ligne s'il est disponible ;
- liens d'invitation vers les parties privées (`inviteLink` / `getInviteParam`).

Hors CrazyGames, toutes ces fonctions sont sans effet.

## Mode en ligne

La simulation est **entièrement déterministe**. Avec la même graine et les mêmes combattants, tous les navigateurs calculent exactement le même combat. Les joueurs n'échangent donc que leurs choix de combattants. L'hôte diffuse ensuite la graine, et chacun calcule le combat chez lui : aucun flux de positions, aucun serveur de jeu à héberger.

- **Matchmaking 1V1 / 2V2** : file d'attente via la *présence* Supabase Realtime. Le plus ancien joueur d'un groupe complet crée le salon.
- **Choix des combattants** : 20 s. Un joueur absent ou parti est remplacé par l'IA.
- **Parties privées** : code à 5 caractères, ou lien d'invitation. L'hôte peut lancer avec des IA aux places vides.
- **Contrôle de désynchronisation** : une empreinte de l'état est échangée toutes les 5 s, et un indicateur s'affiche en cas d'écart.
- **Versions** : seuls les joueurs ayant exactement le même build se rencontrent (identifiant de build dans le nom des canaux).

Serveur : **Supabase Realtime** (canaux publics, aucune table). Le projet et la clé *publishable* sont dans `src/net/config.js`. Pour utiliser un autre projet Supabase, copier `.env.example` en `.env` et le remplir.

### Tester l'en-ligne sans serveur

Ouvre plusieurs onglets sur `http://localhost:5173/?net=local` : ils communiquent entre eux via `BroadcastChannel` (même logique que Supabase).

## Ajouter / équilibrer des combattants

- Créer un combattant : voir [`src/fighters/README.md`](src/fighters/README.md).
- Tests de la simulation : `npm test`. Le script vérifie que les combats tournent sans erreur et que le déterminisme est respecté. Il fait aussi échouer tout appel à `Math.sin`, `Math.random`, etc. pendant la simulation.
- Équilibrage automatique : `npm run balance` (options `--iter`, `--games`, `--k`). Il simule des milliers de combats et ajuste le multiplicateur de puissance de chaque combattant dans `src/sim/balance.js`, pour viser 50 % de victoires.
- Durée des combats : `damageScale` dans `src/sim/config.js`.

État actuel (6 400 combats simulés, avant le passage à une arène de 11 × 11) : tous les combattants sont entre 42 % et 58 % de victoires. En 1V1, la durée médiane est de 51 s, et 90 % des combats durent entre 29 s et 1 min 53.

## Structure

```
index.html              page (canvas + interface + SDK CrazyGames)
src/main.js             écrans et boucle principale
src/match.js            un combat en cours (pas fixe, rattrapage en ligne)
src/sim/                simulation déterministe (maths, aléatoire, monde, balles, entités)
src/fighters/           les 64 combattants, regroupés par familles
src/render/             rendu Canvas 2D et effets (particules, ralenti, zoom…)
src/net/                transport temps réel et logique des parties en ligne
src/platform/           intégration CrazyGames
src/audio.js            sons synthétisés (Web Audio, aucun fichier)
src/i18n.js             textes FR / EN
scripts/                tests et équilibrage
```
