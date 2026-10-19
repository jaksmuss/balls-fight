/* Correctifs navigateur recommandés par CrazyGames (« Common fixes ») :
 *  - pas de défilement de la page hôte avec la molette, les flèches, Espace ou Page haut/bas ;
 *  - pas de menu contextuel au clic droit ;
 *  - son coupé quand l'onglet / l'application passe en arrière-plan (ex. application Samsung). */
import { setBackgroundMuted } from '../audio.js';

const SCROLL_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);

const isTyping = el => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

export function installBrowserFixes() {
  // molette : bloquée sauf dans les écrans qui défilent (grilles, listes)
  window.addEventListener('wheel', e => {
    const scroller = e.target.closest?.('.screen');
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight) e.preventDefault();
  }, { passive: false });

  window.addEventListener('keydown', e => {
    if (SCROLL_KEYS.has(e.code) && !isTyping(e.target)) e.preventDefault();
  }, { passive: false });

  window.addEventListener('contextmenu', e => { if (!isTyping(e.target)) e.preventDefault(); });

  const onVisibility = () => setBackgroundMuted(document.visibilityState === 'hidden');
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', () => setBackgroundMuted(true));
  window.addEventListener('pageshow', onVisibility);
}
