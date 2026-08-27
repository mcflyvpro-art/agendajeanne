'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/components/AppProvider';
import { toast } from '@/components/ui';

function urlB64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true);

/** iOS Safari exige l'installation sur l'écran d'accueil pour le push. Android/Chrome/desktop n'en ont pas besoin. */
const isIOS = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;

/**
 * Bannière d'activation des notifications.
 * Sur iOS, le push ne fonctionne QUE si la PWA est installée sur l'écran d'accueil :
 * on le dit explicitement plutôt que d'échouer en silence. Sur Android et desktop,
 * l'installation n'est pas requise — la permission peut être demandée directement.
 */
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
    if (sub && profile.push_enabled) { setState('ok'); return; }
    setState(sub ? 'need-permission' : 'need-permission');
  }, [profile]);

  useEffect(() => { check(); }, [check]);

  // Détecte une désactivation côté iOS et prévient le parent (via push_enabled = false).
  useEffect(() => {
    if (!profile || state === 'unknown') return;
    const enabled = state === 'ok';
    if (profile.push_enabled !== enabled) {
      supabase.from('profiles')
        .update({ push_enabled: enabled, push_checked_at: new Date().toISOString() })
        .eq('id', profile.id).then(() => refresh());
    }
  }, [state, profile?.id]);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState('denied'); toast('Notifications refusées', 'err'); return; }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
        });
      }
      const { error } = await supabase.from('profiles')
        .update({ push_subscription: sub.toJSON(), push_enabled: true, push_checked_at: new Date().toISOString() })
        .eq('id', profile!.id);
      if (error) throw error;
      setState('ok');
      await refresh();
      toast('Notifications activées ✅');
    } catch (e: any) {
      toast(e.message ?? 'Échec de l’activation', 'err');
    } finally { setBusy(false); }
  };

  if (state === 'ok' || state === 'unknown') return null;

  return (
    <div className="card border-sun/30 bg-sun/[.08] p-4">
      {state === 'need-install' ? (
        <>
          <p className="text-sm font-bold text-sun">📲 Ajoute l’app à ton écran d’accueil</p>
          <p className="mt-1.5 text-xs leading-relaxed text-white/70">
            Sur iPhone, les rappels ne fonctionnent que si l’app est installée.
            Appuie sur <b>Partager</b> en bas de Safari, puis <b>« Sur l’écran d’accueil »</b>.
            Rouvre ensuite l’app depuis l’icône.
          </p>
        </>
      ) : state === 'denied' ? (
        <>
          <p className="text-sm font-bold text-coral">🔕 Notifications bloquées</p>
          <p className="mt-1.5 text-xs leading-relaxed text-white/70">
            {isIOS()
              ? <>Va dans <b>Réglages iPhone → Notifications → Agenda</b> et autorise-les, sinon aucun rappel n’arrivera.</>
              : <>Ouvre les paramètres du site (icône 🔒 ou ⓘ à côté de l’adresse) → <b>Notifications → Autoriser</b>, sinon aucun rappel n’arrivera.</>}
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-bold text-sun">🔔 Active les rappels</p>
          <p className="mt-1.5 text-xs leading-relaxed text-white/70">Sans ça, tu ne recevras aucune notification.</p>
          <button onClick={enable} disabled={busy} className="btn-primary mt-3 w-full">
            {busy ? 'Activation…' : 'Activer les notifications'}
          </button>
        </>
      )}
    </div>
  );
}
