'use client';
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Abonne un écran aux changements de plusieurs tables d'un coup.
 * Recharge aussi au retour au premier plan et au retour du réseau : le temps
 * réel peut manquer des événements pendant que l'appareil dort.
 */
export function useLive(tables: string[], reload: () => void, key = 'live') {
  const fn = useRef(reload);
  fn.current = reload;

  useEffect(() => {
    const ch = supabase.channel(`${key}-${tables.join('-')}`);
    for (const table of tables) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => fn.current());
    }
    ch.subscribe();

    const wake = () => { if (document.visibilityState === 'visible') fn.current(); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);

    return () => {
      supabase.removeChannel(ch);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
    };
  }, [key, tables.join(',')]);
}
