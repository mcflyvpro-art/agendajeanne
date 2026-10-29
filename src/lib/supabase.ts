'use client';
import { createClient } from '@supabase/supabase-js';

/** Tolérance de PostgREST sur la date d'émission (`iat`) d'un jeton, en secondes. */
const IAT_LEEWAY_S = 30;
/** Au-delà de cette attente, mieux vaut afficher l'erreur que bloquer l'écran. */
const MAX_WAIT_S = 90;

/** Date d'émission d'un jeton JWT, en secondes Unix. */
export function jwtIat(token: string | null | undefined): number | null {
  try {
    const part = token!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const iat = JSON.parse(atob(part)).iat;
    return typeof iat === 'number' ? iat : null;
  } catch {
    return null;
  }
}

/**
 * « JWT issued at future » : l'horloge du serveur d'authentification avance sur
 * celle de l'API, qui refuse un jeton tout neuf tant qu'elle n'a pas rattrapé
 * l'écart (moins sa tolérance de 30 s). Plutôt que d'échouer, on attend le
 * temps nécessaire — calculé d'après la date du jeton et l'horloge du
 * téléphone — puis on renvoie la même requête.
 */
async function patientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let res = await fetch(input, init);
  // Une Request a déjà consommé son corps : impossible de la rejouer.
  if (input instanceof Request) return res;

  const iat = jwtIat(new Headers(init?.headers).get('Authorization')?.replace(/^Bearer\s+/i, ''));
  for (let attempt = 1; attempt <= 3 && !res.ok; attempt++) {
    const body = await res.clone().text().catch(() => '');
    if (!/issued at future/i.test(body)) return res;
    const needed = iat === null ? 0 : iat - IAT_LEEWAY_S - Date.now() / 1000 + 1;
    if (needed > MAX_WAIT_S) return res;
    await new Promise((r) => setTimeout(r, Math.max(needed, 3 * attempt) * 1000));
    res = await fetch(input, init);
  }
  return res;
}

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'agenda-jeanne-auth',
    },
    global: { fetch: patientFetch },
    realtime: { params: { eventsPerSecond: 5 } },
  }
);
