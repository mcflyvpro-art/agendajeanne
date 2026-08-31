'use client';
import { useEffect, useRef } from 'react';
import { subscribeTables } from '@/lib/sync';

/**
 * Abonne un écran aux changements de plusieurs tables d'un coup.
 *
 * Tout passe par le canal unique de `lib/sync` : un seul abonnement temps réel
 * pour toute l'app, avec reconnexion, relecture au réveil et propagation entre
 * les fenêtres du même appareil. Le paramètre `key` n'a plus d'utilité
 * technique, il est conservé pour ne rien casser aux appels existants.
 */
export function useLive(tables: string[], reload: () => void, key = 'live') {
  const fn = useRef(reload);
  fn.current = reload;

  useEffect(() => subscribeTables(tables, () => fn.current()), [tables.join(',')]);
}
