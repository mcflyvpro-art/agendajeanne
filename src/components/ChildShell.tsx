'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import clsx from 'clsx';
import { useApp } from '@/components/AppProvider';
import { Loader, Toaster } from '@/components/ui';
import LoadFailure from '@/components/LoadFailure';

const TABS = [
  { href: '/now',   label: 'Aujourd’hui', emoji: '🎯' },
  { href: '/day',   label: 'Semaine',     emoji: '🗓️' },
  { href: '/quiz',  label: 'Quiz',        emoji: '🧠' },
  { href: '/shop',  label: 'Boutique',    emoji: '🎁' },
  { href: '/me',    label: 'Moi',         emoji: '⭐' },
];

export default function ChildShell({ children }: { children: React.ReactNode }) {
  const { session, profile, ready, loadError } = useApp();
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!ready || loadError) return;
    if (!session) router.replace('/login');
    else if (profile?.role === 'parent') router.replace('/parent');
  }, [session, profile, ready, loadError, router]);

  if (loadError) return <LoadFailure message={loadError} />;
  if (!ready || !profile) return <Loader />;

  return (
    <div className="min-h-dvh pb-28">
      <Toaster />
      {children}
      <nav className="tabbar fixed inset-x-0 bottom-0 z-40">
        <div className="mx-auto flex max-w-lg px-2 pt-2">
          {TABS.map(({ href, label, emoji }) => {
            const active = path === href || path.startsWith(href + '/');
            return (
              <Link key={href} href={href}
                    className={clsx('flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 no-select transition',
                      active ? 'bg-grape-light' : '')}>
                <span className={clsx('text-2xl transition', active && 'scale-110')}>{emoji}</span>
                <span className={clsx('text-[10px] font-extrabold', active ? 'text-grape' : 'text-muted')}>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
