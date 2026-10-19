import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// base './' : chemins relatifs, indispensable pour CrazyGames (le jeu est servi dans un sous-dossier).
export default defineConfig({
  base: './',
  // version du jeu (package.json), affichée dans le menu et utilisée pour séparer les versions en ligne
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // npm run preview : accepte n'importe quel nom d'hôte (tests du sitelock en local)
  preview: { allowedHosts: true },
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
});
