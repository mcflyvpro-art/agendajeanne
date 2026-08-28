'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import clsx from 'clsx';
import { LayoutDashboard, CalendarRange, Gift, BarChart3, SlidersHorizontal } from 'lucide-react';
import { useApp } from '@/components/AppProvider';
import { Loader, Toaster } from '@/components/ui';

const TABS = [
  { href: '/parent',          label: 'Bord',    Icon: LayoutDashboard },
  { href: '/parent/agenda',   label: 'Agenda',  Icon: CalendarRange },
  { href: '/parent/rewards',  label: 'Boutique',Icon: Gift },
  { href: '/parent/stats',    label: 'Suivi',   Icon: BarChart3 },
  { href: '/parent/rules',    label: 'Réglages',Icon: SlidersHorizontal },
];

export default function ParentShell({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useApp();
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
    else if (profile?.role === 'child') router.replace('/now');
  }, [session, profile, loading, router]);

  if (loading || !profile) return <Loader />;

  return (
    <div className="min-h-dvh pb-28">
      <Toaster />
      {children}
      <nav className="tabbar fixed inset-x-0 bottom-0 z-40">
        <div className="mx-auto flex max-w-lg px-2 pt-2">
          {TABS.map(({ href, label, Icon }) => {
            const active = href === '/parent' ? path === '/parent' : path.startsWith(href);
            return (
              <Link key={href} href={href}
                    className={clsx('flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 no-select transition',
                      active ? 'bg-grape-light text-grape' : 'text-muted')}>
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
