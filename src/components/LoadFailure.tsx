'use client';
import { supabase } from '@/lib/supabase';

/** Écran d'échec — remplace le chargement sans fin quand le profil ne peut pas être lu. */
export default function LoadFailure({ message }: { message: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
      <span className="text-6xl">😕</span>
      <h1 className="text-2xl font-black text-ink">Connexion impossible</h1>
      <p className="font-medium text-muted">{message}</p>
      <button onClick={() => location.reload()} className="btn-grape mt-2">Réessayer</button>
      <button onClick={async () => { await supabase.auth.signOut(); location.href = '/login'; }}
              className="btn-plain">Se déconnecter</button>
    </main>
  );
}
