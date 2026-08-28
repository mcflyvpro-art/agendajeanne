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
    if (error) toast('Email ou mot de passe incorrect', 'err');
    else router.replace('/');
  }

  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 py-10">
      <Toaster />
      <div className="mx-auto w-full max-w-sm animate-rise">
        <div className="mb-8 text-center">
          <img src="/icons/icon-192.png" alt="" className="mx-auto h-24 w-24 animate-bob rounded-[26px] shadow-lift" />
          <h1 className="mt-5 text-3xl font-black text-ink">Agenda Jeanne</h1>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-5">
          <div>
            <label className="label">Email</label>
            <input className="field" type="email" inputMode="email" autoCapitalize="none" autoComplete="username"
                   value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Mot de passe</label>
            <input className="field" type="password" autoComplete="current-password"
                   value={pw} onChange={(e) => setPw(e.target.value)} required />
          </div>
          <button className="btn-grape btn-lg w-full" disabled={busy}>
            {busy ? '…' : 'C’est parti'}
          </button>
        </form>
      </div>
    </main>
  );
}
