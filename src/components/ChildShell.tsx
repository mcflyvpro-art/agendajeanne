'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import clsx from 'clsx';
import { useApp } from '@/components/AppProvider';
import { Loader, Toaster } from '@/components/ui';
import LoadFailure from '@/components/LoadFailure';
import { useSwipeTabs } from '@/lib/useSwipeTabs';

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

  const swipe = useSwipeTabs(TABS);

  if (loadError) return <LoadFailure message={loadError} />;
  if (!ready || !profile) return <Loader />;

  return (
    <div className="min-h-dvh pb-tabbar" onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd}>
      <Toaster />
      {children}
      <nav className="tabbar fixed inset-x-3 z-40 mx-auto max-w-[500px] rounded-[28px]">
        <div className="flex p-1.5">
          {TABS.map(({ href, label, emoji }) => {
            const active = path === href || path.startsWith(href + '/');
            return (
              <Link key={href} href={href} aria-current={active ? 'page' : undefined}
                    className={clsx('flex flex-1 flex-col items-center gap-0.5 rounded-[22px] py-2 no-select transition',
                      active ? 'bg-grape-light' : 'active:bg-soft')}>
                <span className={clsx('text-[22px] leading-7 transition', active ? 'scale-110' : 'opacity-80 grayscale-[35%]')}>{emoji}</span>
                <span className={clsx('text-[10px] font-extrabold', active ? 'text-grape' : 'text-muted')}>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
