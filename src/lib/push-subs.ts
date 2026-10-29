/** Au-delà, les plus anciens appareils sont oubliés (téléphones changés, PWA réinstallées…). */
const MAX_DEVICES = 6;

export interface StoredSubscription { endpoint: string; keys?: Record<string, string>; [k: string]: unknown; }

/**
 * Abonnements push d'un profil, un par appareil. Une seule colonne en contenait
 * un seul : le dernier appareil activé évinçait les autres, et un appareil sans
 * notifications coupait les rappels partout. L'ancien format (un objet) est lu.
 */
export function subscriptionsOf(raw: unknown): StoredSubscription[] {
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw])
    .filter((s): s is StoredSubscription => !!s && typeof s === 'object' && typeof (s as any).endpoint === 'string');
}

/** Ajoute (ou rafraîchit) l'abonnement d'un appareil sans toucher aux autres. */
export function withSubscription(raw: unknown, sub: StoredSubscription): StoredSubscription[] {
  return [...subscriptionsOf(raw).filter((s) => s.endpoint !== sub.endpoint), sub].slice(-MAX_DEVICES);
}
