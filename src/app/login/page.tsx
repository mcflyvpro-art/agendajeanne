'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/components/AppProvider';
import { Toaster } from '@/components/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { session, ready } = useApp();
  const router = useRouter();

  useEffect(() => { if (ready && session) router.replace('/'); }, [session, ready, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: pw });
    setBusy(false);
    if (!error) { router.replace('/'); return; }
    // Une coupure réseau n'est pas un mauvais mot de passe : on le dit.
    setError(/fetch|network|failed/i.test(error.message)
      ? 'Pas de connexion. Vérifie le Wi-Fi ou la 4G puis réessaie.'
      : 'Email ou mot de passe incorrect.');
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 py-10">
      <Toaster />
      <div className="mx-auto w-full max-w-sm animate-rise">
        <div className="mb-8 text-center">
          <img src="/icons/icon-192.png" alt="" className="mx-auto h-24 w-24 animate-bob rounded-[26px] shadow-lift" />
          <h1 className="mt-5 text-3xl font-black text-ink">Agenda Jeanne</h1>
          <p className="mt-1 font-bold text-muted">Ta journée, tes objectifs, tes récompenses.</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-5">
          <div>
            <label className="label">Email</label>
            <input className="field" type="email" inputMode="email" autoCapitalize="none" autoComplete="username"
                   value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Mot de passe</label>
            <div className="relative">
              <input className="field pr-14" type={show ? 'text' : 'password'} autoComplete="current-password"
                     value={pw} onChange={(e) => setPw(e.target.value)} required />
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Masquer' : 'Afficher'}
                      className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-2xl text-xl text-muted active:bg-soft">
                {show ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          {error && <p className="animate-rise rounded-2xl bg-flame-light px-4 py-3 text-sm font-bold text-flame-dark">{error}</p>}
          <button className="btn-grape btn-lg w-full" disabled={busy}>
            {busy ? 'Connexion…' : 'C’est parti'}
          </button>
        </form>
      </div>
    </main>
  );
}
