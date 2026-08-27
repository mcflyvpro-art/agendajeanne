'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import clsx from 'clsx';
import { LayoutDashboard, CalendarRange, Gift, SlidersHorizontal, BarChart3 } from 'lucide-react';
import { useApp } from '@/components/AppProvider';
import { Loader, Toaster } from '@/components/ui';

const TABS = [
  { href: '/parent', label: 'Bord', Icon: LayoutDashboard },
  { href: '/parent/agenda', label: 'Agenda', Icon: CalendarRange },
  { href: '/parent/rewards', label: 'Récompenses', Icon: Gift },
  { href: '/parent/stats', label: 'Suivi', Icon: BarChart3 },
  { href: '/parent/rules', label: 'Règles', Icon: SlidersHorizontal },
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
    <div className="min-h-dvh pb-24">
      <Toaster />
      {children}
      <nav className="tabbar fixed inset-x-0 bottom-0 z-40 border-t border-line">
        <div className="mx-auto flex max-w-lg">
          {TABS.map(({ href, label, Icon }) => {
            const active = href === '/parent' ? path === '/parent' : path.startsWith(href);
            return (
              <Link key={href} href={href}
                    className={clsx('flex flex-1 flex-col items-center gap-1 py-2.5 no-select transition',
                      active ? 'text-brand' : 'text-muted')}>
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-semibold">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
