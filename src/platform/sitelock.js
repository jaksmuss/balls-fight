/* Sitelock : le jeu ne tourne que sur CrazyGames (et en développement local), pour
 * éviter qu'il soit copié et hébergé ailleurs. Recommandé par la doc HTML5 de CrazyGames.
 *
 * Domaines autorisés :
 *  - crazygames.com et ses sous-domaines (y compris l'application app.crazygames.com) ;
 *  - les autres domaines CrazyGames (crazygames.fr, .nl...) ;
 *  - localhost / adresses du réseau local (tests avec npm run dev / preview) ;
 *  - les domaines listés dans VITE_ALLOWED_HOSTS (séparés par des virgules), pour
 *    héberger le jeu sur ton propre site si besoin.
 * Le sitelock n'est actif que dans la version de production (npm run build). */

const EXTRA = (import.meta.env?.VITE_ALLOWED_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

export function isAllowedHost(hostname) {
  const h = (hostname || '').toLowerCase();
  if (!h) return false;
  if (h === 'crazygames.com' || h.endsWith('.crazygames.com')) return true;
  // autres extensions CrazyGames (crazygames.fr, crazygames.co.uk...) — pas « crazygames.com.autre-site.com »
  if (/(^|\.)crazygames\.[a-z]{2,3}(\.[a-z]{2})?$/.test(h)) return true;
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost')) return true;
  if (/^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(h)) return true;
  return EXTRA.some(d => h === d || h.endsWith('.' + d));
}

/** Renvoie true si le jeu peut démarrer ; sinon affiche un message et renvoie false. */
export function checkSitelock() {
  if (!import.meta.env?.PROD) return true;
  if (isAllowedHost(location.hostname)) return true;
  document.body.innerHTML = '';
  const msg = document.createElement('div');
  msg.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;font:600 20px system-ui,sans-serif;color:#eef1ff;background:#070a20';
  msg.textContent = 'Balls Fight is only available on CrazyGames.';
  document.body.append(msg);
  return false;
}
