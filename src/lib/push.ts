import webpush from 'web-push';
import type { admin } from '@/lib/admin';
import type { Profile } from '@/lib/types';
import { subscriptionsOf } from '@/lib/push-subs';

let ready = false;
function init() {
  if (ready) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  ready = true;
}

export interface PushPayload { title: string; body: string; url?: string; tag?: string; kind?: string; }

/** Envoie une notification. Renvoie `gone: true` si l'abonnement est mort (à nettoyer). */
export async function sendPush(sub: any, payload: PushPayload): Promise<{ ok: boolean; gone: boolean; error?: string }> {
  if (!sub) return { ok: false, gone: false, error: 'pas d’abonnement' };
  init();
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600, urgency: 'high' as any });
    return { ok: true, gone: false };
  } catch (e: any) {
    const code = e?.statusCode;
    return { ok: false, gone: code === 404 || code === 410, error: `${code ?? ''} ${e?.message ?? e}`.trim() };
  }
}

/**
 * Envoie à tous les appareils du profil et oublie ceux dont l'abonnement est
 * mort. La liste est relue avant l'écriture pour ne pas effacer un appareil
 * ajouté pendant l'envoi.
 */
export async function pushToProfile(db: ReturnType<typeof admin>, p: Profile, payload: PushPayload): Promise<boolean> {
  const subs = subscriptionsOf(p.push_subscription);
  if (!subs.length) return false;
  const results = await Promise.all(subs.map((s) => sendPush(s, payload)));
  const gone = new Set(subs.filter((_, i) => results[i].gone).map((s) => s.endpoint));
  if (gone.size) {
    const { data } = await db.from('profiles').select('push_subscription').eq('id', p.id).maybeSingle();
    const left = subscriptionsOf(data?.push_subscription).filter((s) => !gone.has(s.endpoint));
    await db.from('profiles').update({ push_subscription: left.length ? left : null, push_enabled: left.length > 0 }).eq('id', p.id);
  }
  return results.some((r) => r.ok);
}
