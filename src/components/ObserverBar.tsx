'use client';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import type { ObserveAs } from '@/components/AppProvider';
import type { Profile } from '@/lib/types';

/**
 * Bandeau du compte observateur — toujours visible, quelle que soit la page.
 *
 * Il fait deux choses : rappeler sans ambiguïté qu'on regarde une interface
 * qui n'est pas la sienne, et permettre de basculer entre les deux vues ou de
 * revenir au choix sans avoir à retaper une URL. Il ne bloque rien en dessous
 * — l'app en dessous reste cliquable, pour qu'on puisse vraiment naviguer et
 * ouvrir les écrans — la garantie « rien ne s'enregistre » vient de la base
 * de données (policies RLS), pas de ce bandeau.
 */
export default function ObserverBar({ profile, observeAs, startObserving, stopObserving }: {
  profile: Profile | null;
  observeAs: ObserveAs;
  startObserving: (as: 'parent' | 'child') => void;
  stopObserving: () => void;
}) {
  const router = useRouter();

  const go = (as: 'parent' | 'child') => {
    startObserving(as);
    router.push(as === 'parent' ? '/parent' : '/now');
  };

  const quit = () => {
    stopObserving();
    router.push('/admin');
  };

  return (
    // S'empile au-dessus de la barre d'onglets du téléphone (hauteur mesurée
    // en direct par NavShell) au lieu de la recouvrir — sinon impossible de
    // changer d'onglet en mode observateur. Sur ordinateur (colonne latérale,
    // pas de barre d'onglets en bas), la variable vaut 0 et le bandeau
    // reprend sa place tout en bas de l'écran.
    <div className="fixed inset-x-0 z-[999] flex justify-center px-3 pb-2"
         style={{ pointerEvents: 'none', bottom: 'calc(max(var(--tabbar-height, 0px), env(safe-area-inset-bottom)) + .5rem)' }}>
      <div className="pointer-events-auto flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-[#181622]/95 px-2 py-1.5 shadow-[0_8px_30px_-8px_rgba(0,0,0,.6)] backdrop-blur">
        <span className="ml-1.5 flex items-center gap-1.5 whitespace-nowrap text-xs font-black text-white/70">
          🔭 {observeAs ? `Vue ${observeAs === 'parent' ? 'parent' : 'enfant'} — ${profile?.display_name ?? '…'}` : 'Observateur'}
        </span>
        <button onClick={() => go('parent')}
                className={clsx('rounded-full px-2.5 py-1.5 text-xs font-black whitespace-nowrap transition',
                  observeAs === 'parent' ? 'bg-white text-[#181622]' : 'text-white/60 hover:text-white')}>
          👨‍👩 Parent
        </button>
        <button onClick={() => go('child')}
                className={clsx('rounded-full px-2.5 py-1.5 text-xs font-black whitespace-nowrap transition',
                  observeAs === 'child' ? 'bg-white text-[#181622]' : 'text-white/60 hover:text-white')}>
          👧 Enfant
        </button>
        <button onClick={quit}
                className="rounded-full bg-white/10 px-2.5 py-1.5 text-xs font-black text-white/70 hover:bg-white/15">
          Quitter
        </button>
      </div>
    </div>
  );
}
