'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/components/AppProvider';
import { deviceId, deviceKind, deviceLabel, isStandalone as standalone } from '@/lib/device';
import { toast } from '@/components/ui';

function urlB64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const isStandalone = () => typeof window !== 'undefined' && standalone();

const isIOS = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;

/**
 * Un abonnement push appartient à un navigateur. Chaque appareil garde donc sa
 * propre ligne : le téléphone et l'ordinateur reçoivent tous les deux, au lieu
 * que le dernier connecté efface l'autre.
 */
async function saveSubscription(profileId: string, sub: PushSubscription) {
  const json: any = sub.toJSON();
  await supabase.from('push_devices').upsert({
    profile_id: profileId,
    device_id: deviceId(),
    kind: deviceKind(),
    label: deviceLabel(),
    endpoint: json.endpoint,
    subscription: json,
    user_agent: navigator.userAgent.slice(0, 300),
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'profile_id,device_id' });

  await supabase.from('profiles')
    .update({ push_subscription: json, push_enabled: true, push_checked_at: new Date().toISOString() })
    .eq('id', profileId);
}

export default function PushManager() {
  const { profile, refresh } = useApp();
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
    if (sub && Notification.permission === 'granted') {
      // Cet appareil est bien abonné : on tient sa ligne à jour. Les navigateurs
      // renouvellent parfois l'abonnement tout seuls.
      await saveSubscription(profile.id, sub);
      setState('ok');
      return;
    }
    setState('need-permission');
  }, [profile?.id]);

  useEffect(() => { check(); }, [check]);

  /**
   * On ne marque plus le profil « injoignable » depuis un appareil.
   * Avec un téléphone et un ordinateur, le Mac sans notifications éteignait
   * les rappels du téléphone. Seul le serveur, qui voit tous les appareils,
   * peut conclure que plus personne n'est joignable.
   */
  useEffect(() => {
    if (!profile || state !== 'ok' || profile.push_enabled) return;
    supabase.from('profiles')
      .update({ push_enabled: true, push_checked_at: new Date().toISOString() })
      .eq('id', profile.id).then(() => refresh());
  }, [state, profile?.id, profile?.push_enabled]);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState('denied'); return; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
        });
      }
      await saveSubscription(profile!.id, sub);
      setState('ok');
      await refresh();
      toast('Notifications activées');
    } catch (e: any) {
      toast('Échec de l’activation', 'err');
    } finally { setBusy(false); }
  };

  if (state === 'ok' || state === 'unknown') return null;

  return (
    <div className="card border-2 border-sun bg-sun-light p-4">
      {state === 'need-install' ? (
        <p className="text-sm font-extrabold text-ink">
          📲 Partager → « Sur l’écran d’accueil », puis rouvrir depuis l’icône
        </p>
      ) : state === 'denied' ? (
        <p className="text-sm font-extrabold text-ink">
          🔕 Notifications bloquées {isIOS() ? '— Réglages → Notifications → Agenda' : '— paramètres du site → Notifications'}
        </p>
      ) : (
        <>
          <p className="text-center text-sm font-extrabold text-ink">🔔 Rappels désactivés</p>
          <button onClick={enable} disabled={busy} className="btn-sun mt-3 w-full">Activer</button>
        </>
      )}
    </div>
  );
}
