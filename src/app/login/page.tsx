'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/components/AppProvider';
import { Toaster, toast } from '@/components/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const { session, loading } = useApp();
  const router = useRouter();

  useEffect(() => { if (!loading && session) router.replace('/'); }, [session, loading, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) toast(error.message === 'Invalid login credentials' ? 'Email ou mot de passe incorrect' : error.message, 'err');
    else router.replace('/');
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 py-10">
      <Toaster />
      <div className="mx-auto w-full max-w-sm animate-rise">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-[26px] bg-gradient-to-b from-brand to-mint text-4xl shadow-2xl shadow-brand/30">
            📓
          </div>
          <h1 className="text-2xl font-black tracking-tight">Agenda Jeanne</h1>
          <p className="mt-1 text-sm text-muted">Connecte-toi pour continuer</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-5">
          <div>
            <label className="label">Email</label>
            <input className="field" type="email" inputMode="email" autoCapitalize="none" autoComplete="username"
                   value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jeanne@gmail.com" required />
          </div>
          <div>
            <label className="label">Mot de passe</label>
            <input className="field" type="password" autoComplete="current-password"
                   value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" required />
          </div>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p className="mt-6 px-4 text-center text-xs leading-relaxed text-muted">
          Pour recevoir les rappels, ajoute l’app à ton écran d’accueil :<br />
          <span className="text-white/70">Partager <span className="text-base">􀈂</span> → « Sur l’écran d’accueil »</span>
        </p>
      </div>
    </main>
  );
}
