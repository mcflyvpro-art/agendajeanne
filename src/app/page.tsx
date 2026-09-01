'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/AppProvider';
import { Loader } from '@/components/ui';
import LoadFailure from '@/components/LoadFailure';

export default function Home() {
  const { session, profile, ready, loadError } = useApp();
  const router = useRouter();

  useEffect(() => {
    // On attend que le profil soit résolu : router sur un profil encore nul
    // envoyait le parent vers l'interface enfant, bloquée sur un chargement.
    if (!ready || loadError) return;
    if (!session) router.replace('/login');
    else if (profile?.role === 'parent') router.replace('/parent');
    else if (profile?.role === 'child') router.replace('/now');
    else if (profile?.role === 'admin') router.replace('/admin');
  }, [session, profile, ready, loadError, router]);

  if (loadError) return <LoadFailure message={loadError} />;
  return <Loader />;
}
