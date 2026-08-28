'use client';
import { useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * Change d'onglet en glissant horizontalement, comme entre deux pages d'un
 * carnet. Ignoré si le geste démarre dans une zone à défilement horizontal
 * propre (ex. le sélecteur de jour) ou si une feuille modale est ouverte
 * (elle gère déjà son propre glissement, vertical, vers la fermeture).
 */
export function useSwipeTabs(tabs: readonly { href: string }[]) {
  const router = useRouter();
  const path = usePathname();
  const start = useRef<{ x: number; y: number } | null>(null);
  const skip = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.target as HTMLElement;
    skip.current = !!t.closest('.scroll-x') || !!document.querySelector('.sheet');
    start.current = skip.current ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (skip.current || !start.current) return;
    const dx = e.changedTouches[0].clientX - start.current.x;
    const dy = e.changedTouches[0].clientY - start.current.y;
    start.current = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return;

    const i = tabs.findIndex((t) => path === t.href || path.startsWith(t.href + '/'));
    if (i === -1) return;
    const next = dx < 0 ? i + 1 : i - 1;
    if (next >= 0 && next < tabs.length) router.push(tabs[next].href);
  };

  return { onTouchStart, onTouchEnd };
}
