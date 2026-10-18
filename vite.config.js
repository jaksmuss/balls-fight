import { defineConfig } from 'vite';

// base './' : chemins relatifs, indispensable pour CrazyGames (le jeu est servi dans un sous-dossier).
export default defineConfig({
  base: './',
  // identifiant de build : seuls les joueurs ayant exactement la même version se rencontrent en ligne
  define: { __BUILD_ID__: JSON.stringify(process.env.BUILD_ID || Date.now().toString(36)) },
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
});
