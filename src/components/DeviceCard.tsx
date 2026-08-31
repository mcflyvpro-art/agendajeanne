'use client';
import clsx from 'clsx';
import { useDevice, setDeviceOverride, deviceOverride, detectKind } from '@/lib/device';
import { usePresence, useSyncState, resync } from '@/lib/sync';
import { toast } from '@/components/ui';

/**
 * « Cet appareil ». Deux informations qui comptent dès qu'on utilise l'app sur
 * quatre appareils : d'où l'on est connecté, et qui d'autre l'est en ce moment.
 *
 * Le type d'appareil est reconnu tout seul, mais reste modifiable à la main :
 * c'est lui qui décide si sortir de l'app met le minuteur en pause. Sur un
 * ordinateur, non ; sur un téléphone, oui.
 */
export default function DeviceCard() {
  const device = useDevice();
  const others = usePresence();
  const state = useSyncState();
  const forced = typeof window === 'undefined' ? null : deviceOverride();

  const choose = (kind: 'desktop' | 'mobile' | null) => {
    setDeviceOverride(kind);
    toast(kind === null ? `Détection automatique : ${detectKind() === 'desktop' ? 'ordinateur' : 'téléphone'}`
      : kind === 'desktop' ? 'Traité comme un ordinateur' : 'Traité comme un téléphone');
  };

  const dot = state === 'live' ? 'bg-leaf' : state === 'offline' ? 'bg-flame' : 'bg-sun animate-pulse';
  const label = state === 'live' ? 'Synchronisé' : state === 'offline' ? 'Hors ligne'
    : state === 'reconnecting' ? 'Reconnexion…' : 'Connexion…';

  return (
    <section className="card p-4">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{device.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-ink">{device.label}</p>
          <button onClick={() => resync(true)} className="mt-0.5 flex items-center gap-1.5">
            <span className={clsx('h-2 w-2 rounded-full', dot)} />
            <span className="text-xs font-bold text-muted">{label}</span>
          </button>
        </div>
      </div>

      {others.length > 0 && (
        <p className="mt-3 rounded-2xl bg-soft px-3 py-2 text-xs font-bold text-muted">
          Aussi connecté : {others.map((o) => `${o.emoji} ${o.name}`).join(' · ')}
        </p>
      )}

      <p className="mt-4 text-xs font-bold text-muted">
        Le chronomètre se met en pause quand on quitte l’app <b className="text-ink">sur téléphone</b>,
        et continue <b className="text-ink">sur ordinateur</b>.
      </p>
      <div className="mt-2 flex gap-2">
        {([['Auto', null], ['Ordinateur', 'desktop'], ['Téléphone', 'mobile']] as const).map(([lbl, val]) => (
          <button key={lbl} onClick={() => choose(val as any)}
                  className={clsx('flex-1 rounded-2xl border-2 py-2.5 text-sm font-extrabold transition',
                    forced === val || (val === null && forced === null)
                      ? 'border-grape bg-grape-light text-grape'
                      : 'border-line bg-card text-muted')}>
            {lbl}
          </button>
        ))}
      </div>
    </section>
  );
}
