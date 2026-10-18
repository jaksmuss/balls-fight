/* Connexion Supabase Realtime (mode en ligne).
 * La clé « publishable » est faite pour être publique : elle est incluse dans le jeu
 * et ne donne accès qu'aux canaux temps réel publics (aucune table n'est utilisée).
 * Pour utiliser un autre projet : définir VITE_SUPABASE_URL et VITE_SUPABASE_KEY
 * (fichier .env, voir .env.example) puis relancer le build. */
export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || 'https://lomcuptsmqhaugktznep.supabase.co';
export const SUPABASE_KEY = import.meta.env?.VITE_SUPABASE_KEY || 'sb_publishable__57xQCpxuG67bNwDWuXHAw_1PrTj55U';

/** Préfixe des canaux : à changer si le protocole réseau évolue (versions incompatibles). */
export const PROTOCOL = 'bf1';
