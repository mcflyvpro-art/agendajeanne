'use client';
import clsx from 'clsx';
import { useSyncState, usePresence, resync } from '@/lib/sync';

/**
 * État de la synchronisation, et qui d'autre est connecté en ce moment.
 * Sur quatre appareils, savoir que la liaison est vivante — ou qu'elle ne
 * l'est pas — vaut mieux que de recharger la page au hasard.
 */
export default function SyncBadge({ compact = false }: { compact?: boolean }) {
  const state = useSyncState();
  const others = usePresence();

  const label =
    state === 'live' ? 'Synchronisé'
    : state === 'offline' ? 'Hors ligne'
    : state === 'reconnecting' ? 'Reconnexion…'
    : 'Connexion…';

  const dot =
    state === 'live' ? 'bg-leaf'
    : state === 'offline' ? 'bg-flame'
    : 'bg-sun animate-pulse';

  if (compact) {
    return (
      <button onClick={() => resync(true)} className="chip" title={label}>
        <span className={clsx('h-2 w-2 rounded-full', dot)} />
        {label}
      </button>
    );
  }

  return (
    <button onClick={() => resync(true)}
            className="flex w-full items-center gap-2 rounded-2xl bg-soft px-3 py-2 text-left no-select">
      <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', dot)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-extrabold text-ink">{label}</span>
        {others.length > 0 && (
          <span className="block truncate text-[10px] font-bold text-muted">
            {others.map((o) => `${o.emoji} ${o.name}`).join(' · ')}
          </span>
        )}
      </span>
    </button>
  );
}
