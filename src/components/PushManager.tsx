'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/components/AppProvider';
import { toast } from '@/components/ui';
import { subscriptionsOf, withSubscription, type StoredSubscription } from '@/lib/push-subs';

function urlB64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true);

const isIOS = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;

/** Ajoute cet appareil à la liste du profil, relue juste avant pour ne rien écraser. */
async function register(profileId: string, sub: PushSubscription) {
  const { data } = await supabase.from('profiles').select('push_subscription').eq('id', profileId).single();
  await supabase.from('profiles').update({
    push_subscription: withSubscription(data?.push_subscription, sub.toJSON() as StoredSubscription),
    push_enabled: true,
    push_checked_at: new Date().toISOString(),
  }).eq('id', profileId);
}

/**
 * État des notifications de CET appareil. Un même compte peut être ouvert sur
 * plusieurs téléphones (la PWA de Jeanne sur celui du parent, par exemple) :
 * chacun s'inscrit à côté des autres. Un appareil sans notifications ne touche
 * plus à rien — il désactivait auparavant les rappels du compte entier.
 */
export default function PushManager() {
  const { profile } = useApp();
  const [state, setState] = useState<'unknown' | 'ok' | 'need-install' | 'need-permission' | 'denied'>('unknown');
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (!profile) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState(isIOS() && !isStandalone() ? 'need-install' : 'denied'); return;
    }
    if (isIOS() && !isStandalone()) { setState('need-install'); return; }
    if (Notification.permission === 'denied') { setState('denied'); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub || Notification.permission !== 'granted') { setState('need-permission'); return; }
    setState('ok');
    // Abonnement local inconnu du profil (purgé, renouvelé par le navigateur) ou
    // compte marqué injoignable à tort par l'ancienne version : on le réinscrit.
    if (!profile.push_enabled || !subscriptionsOf(profile.push_subscription).some((s) => s.endpoint === sub.endpoint)) {
      await register(profile.id, sub);
    }
  }, [profile?.id, profile?.push_subscription, profile?.push_enabled]);

  useEffect(() => { check(); }, [check]);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState('denied'); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      await register(profile!.id, sub);
      setState('ok');
      toast('Notifications activées');
    } catch {
      toast('Échec de l’activation', 'err');
    } finally { setBusy(false); }
  };

  if (state === 'ok' || state === 'unknown') return null;

  if (state === 'need-permission') {
    return (
      <div className="card flex items-center gap-3 border-sun/60 bg-sun-light p-3.5">
        <span className="text-2xl">🔔</span>
        <p className="flex-1 text-sm font-extrabold leading-snug text-ink">Active les rappels sur cet appareil</p>
        <button onClick={enable} disabled={busy} className="btn-sun shrink-0 !px-4 !py-2.5 text-sm">
          {busy ? '…' : 'Activer'}
        </button>
      </div>
    );
  }

  return (
    <div className="card flex items-start gap-3 border-sun/60 bg-sun-light p-3.5">
      <span className="text-2xl">{state === 'need-install' ? '📲' : '🔕'}</span>
      <p className="flex-1 text-sm font-bold leading-snug text-ink">
        {state === 'need-install'
          ? <>Pour recevoir les rappels : <b>Partager → Sur l’écran d’accueil</b>, puis ouvre l’app depuis l’icône.</>
          : <>Notifications bloquées sur cet appareil. {isIOS() ? <b>Réglages → Notifications → Agenda</b> : <b>Paramètres du site → Notifications</b>}</>}
      </p>
    </div>
  );
}
