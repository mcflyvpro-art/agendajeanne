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

/**
 * Envoi à *tous* les appareils d'une personne : téléphone et ordinateur à la
 * fois. Les abonnements morts sont nettoyés au passage, et le profil n'est
 * marqué « injoignable » que s'il ne reste plus aucun appareil valide.
 *
 * `profiles.push_subscription` reste pris en charge : un appareil enregistré
 * avant cette table continue de recevoir jusqu'à sa prochaine visite.
 */
export async function sendToProfile(db: any, profile: any, payload: PushPayload): Promise<number> {
  const { data: devices } = await db.from('push_devices').select('*').eq('profile_id', profile.id);
  const rows = (devices ?? []) as any[];

  const targets: { sub: any; id: string | null }[] = rows.map((d) => ({ sub: d.subscription, id: d.id }));
  const known = new Set(rows.map((d) => JSON.stringify(d.subscription?.endpoint ?? '')));
  if (profile.push_subscription && !known.has(JSON.stringify((profile.push_subscription as any)?.endpoint ?? ''))) {
    targets.push({ sub: profile.push_subscription, id: null });
  }

  let sent = 0;
  let alive = 0;
  for (const t of targets) {
    const r = await sendPush(t.sub, payload);
    if (r.ok) { sent += 1; alive += 1; continue; }
    if (r.gone) {
      if (t.id) await db.from('push_devices').delete().eq('id', t.id);
      else await db.from('profiles').update({ push_subscription: null }).eq('id', profile.id);
    } else {
      alive += 1;  // erreur passagère : on ne supprime rien
    }
  }
  if (targets.length && alive === 0) {
    await db.from('profiles').update({ push_enabled: false }).eq('id', profile.id);
  }
  return sent;
}
