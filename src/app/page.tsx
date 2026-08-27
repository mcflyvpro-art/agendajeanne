'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/AppProvider';
import { Loader } from '@/components/ui';

export default function Home() {
  const { session, profile, loading } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
    else if (profile?.role === 'parent') router.replace('/parent');
    else router.replace('/now');
  }, [session, profile, loading, router]);

  return <Loader label="Ouverture…" />;
}
