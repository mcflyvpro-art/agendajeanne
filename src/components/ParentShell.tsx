'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import clsx from 'clsx';
import { LayoutDashboard, CalendarRange, Gift, BarChart3, SlidersHorizontal } from 'lucide-react';
import { useApp } from '@/components/AppProvider';
import { Loader, Toaster } from '@/components/ui';
import LoadFailure from '@/components/LoadFailure';
import { useSwipeTabs } from '@/lib/useSwipeTabs';

const TABS = [
  { href: '/parent',          label: 'Bord',    Icon: LayoutDashboard },
  { href: '/parent/agenda',   label: 'Agenda',  Icon: CalendarRange },
  { href: '/parent/rewards',  label: 'Boutique',Icon: Gift },
  { href: '/parent/stats',    label: 'Suivi',   Icon: BarChart3 },
  { href: '/parent/rules',    label: 'Réglages',Icon: SlidersHorizontal },
];

export default function ParentShell({ children }: { children: React.ReactNode }) {
  const { session, profile, ready, loadError } = useApp();
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!ready || loadError) return;
    if (!session) router.replace('/login');
    else if (profile?.role === 'child') router.replace('/now');
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
          {TABS.map(({ href, label, Icon }) => {
            const active = href === '/parent' ? path === '/parent' : path.startsWith(href);
            return (
              <Link key={href} href={href} aria-current={active ? 'page' : undefined}
                    className={clsx('flex flex-1 flex-col items-center gap-1 rounded-[22px] py-2 no-select transition',
                      active ? 'bg-grape-light text-grape' : 'text-muted active:bg-soft')}>
                <Icon size={21} strokeWidth={active ? 2.6 : 2} />
                <span className="text-[10px] font-extrabold">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
