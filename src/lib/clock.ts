'use client';
import { supabase } from '@/lib/supabase';

/**
 * Horloge commune.
 *
 * Le chronomètre se calcule sur des horodatages écrits par le serveur. Si un
 * appareil affichait ces horodatages avec sa propre pendule — décalée d'un
 * quart d'heure, ou restée à l'heure d'hiver — le compteur sauterait d'autant.
 * On mesure donc une fois l'écart entre l'heure du serveur et celle de la
 * machine, et tout l'affichage passe par `serverNow()`.
 */

let offset = 0;          // millisecondes à ajouter à l'heure locale
let synced = false;
let inflight: Promise<void> | null = null;

export function serverNow(): number {
  return Date.now() + offset;
}

export const clockOffset = () => offset;
export const clockSynced = () => synced;

export async function syncClock(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const before = Date.now();
      const { data, error } = await supabase.rpc('server_now');
      if (error || !data) return;
      const after = Date.now();
      // La réponse a mis (after - before) à faire l'aller-retour : on suppose
      // le trajet symétrique et on vise le milieu.
      const server = new Date(data as string).getTime();
      // Une réponse inattendue (page d'erreur d'un proxy, mandataire capté par
      // un portail wifi) ne doit surtout pas empoisonner l'horloge : sans ce
      // garde-fou, un `NaN` se propageait jusqu'au chronomètre affiché.
      if (!Number.isFinite(server)) return;
      offset = server - (before + after) / 2;
      synced = true;
    } catch {
      /* pas de réseau : on garde l'heure locale, c'est déjà une bonne approximation */
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
