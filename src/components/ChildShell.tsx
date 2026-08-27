'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import clsx from 'clsx';
import { Target, CalendarDays, ShoppingBag, Brain, User } from 'lucide-react';
import { useApp } from '@/components/AppProvider';
import { Loader, Toaster } from '@/components/ui';

const TABS = [
  { href: '/now', label: 'Maintenant', Icon: Target },
  { href: '/day', label: 'Journée', Icon: CalendarDays },
  { href: '/quiz', label: 'Quiz', Icon: Brain },
  { href: '/shop', label: 'Boutique', Icon: ShoppingBag },
  { href: '/me', label: 'Moi', Icon: User },
];

export default function ChildShell({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useApp();
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace('/login');
    else if (profile?.role === 'parent') router.replace('/parent');
  }, [session, profile, loading, router]);

  if (loading || !profile) return <Loader />;

  return (
    <div className="min-h-dvh pb-24">
      <Toaster />
      {children}
      <nav className="tabbar fixed inset-x-0 bottom-0 z-40 border-t border-line">
        <div className="mx-auto flex max-w-lg">
          {TABS.map(({ href, label, Icon }) => {
            const active = path === href || path.startsWith(href + '/');
            return (
              <Link key={href} href={href}
                    className={clsx('flex flex-1 flex-col items-center gap-1 py-2.5 no-select transition',
                      active ? 'text-brand' : 'text-muted')}>
                <Icon size={21} strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-semibold">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
