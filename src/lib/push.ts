import webpush from 'web-push';

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
