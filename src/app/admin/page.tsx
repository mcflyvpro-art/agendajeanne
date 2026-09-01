'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/AppProvider';
import { Loader, Toaster } from '@/components/ui';
import LoadFailure from '@/components/LoadFailure';

/**
 * Choix de vue du compte observateur.
 *
 * Volontairement minimal : deux portes d'entrée vers les *vraies* interfaces
 * — `/parent` et `/now`, les mêmes pages que le parent et l'enfant ouvrent
 * chaque jour, avec les mêmes données en direct. Rien n'est reconstruit ni
 * résumé ici ; ce choix ne fait que dire à l'app quel profil afficher.
 *
 * La garantie « rien ne s'enregistre » n'est pas ici non plus : elle vient
 * des politiques de la base de données, qui ignorent toute écriture tentée
 * par un compte qui n'a pas le rôle `parent` — voir supabase/v9.sql.
 */
export default function AdminChooser() {
  const { session, profile, ready, loadError, isAdmin, child, parents, startObserving } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!ready || loadError) return;
    if (!session) router.replace('/login');
    else if (profile && !isAdmin) router.replace(profile.role === 'parent' ? '/parent' : '/now');
  }, [session, profile, ready, loadError, isAdmin, router]);

  if (loadError) return <LoadFailure message={loadError} />;
  if (!ready || !profile) return <Loader />;
  if (!isAdmin) return <Loader />;

  const go = (as: 'parent' | 'child') => {
    startObserving(as);
    router.push(as === 'parent' ? '/parent' : '/now');
  };

  const parent = parents[0] ?? null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <Toaster />
      <div className="mb-8 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-grape-light text-4xl">🔭</div>
        <h1 className="mt-4 text-2xl font-black text-ink">Mode observateur</h1>
        <p className="mt-1.5 text-sm font-bold text-muted">
          Les vraies interfaces, en lecture seule. Rien de ce que tu fais ici ne s’enregistre.
        </p>
      </div>

      <div className="space-y-3">
        <button onClick={() => go('parent')} disabled={!parent}
                className="card flex w-full items-center gap-4 p-4 text-left no-select transition active:scale-[.99] disabled:opacity-40">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-3xl bg-grape-light text-3xl">
            {parent?.avatar_emoji ?? '👤'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-black text-ink">Interface Parent</p>
            <p className="truncate text-sm font-bold text-muted">
              {parent ? `Comme ${parent.display_name} la voit` : 'Aucun compte parent trouvé'}
            </p>
          </div>
          <span className="text-2xl text-muted">›</span>
        </button>

        <button onClick={() => go('child')} disabled={!child}
                className="card flex w-full items-center gap-4 p-4 text-left no-select transition active:scale-[.99] disabled:opacity-40">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-3xl bg-grape-light text-3xl">
            {child?.avatar_emoji ?? '👤'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-black text-ink">Interface Enfant</p>
            <p className="truncate text-sm font-bold text-muted">
              {child ? `Comme ${child.display_name} la voit` : 'Aucun compte enfant trouvé'}
            </p>
          </div>
          <span className="text-2xl text-muted">›</span>
        </button>
      </div>

      <p className="mt-8 text-center text-xs font-bold text-muted">
        Tu peux basculer entre les deux à tout moment depuis le bandeau en bas de l’écran.
      </p>
    </main>
  );
}
