'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useApp } from '@/components/AppProvider';
import { Loader, Toaster } from '@/components/ui';
import LoadFailure from '@/components/LoadFailure';
import SyncBadge from '@/components/SyncBadge';
import InstallHint from '@/components/InstallHint';
import { useSwipeTabs } from '@/lib/useSwipeTabs';
import { useDevice } from '@/lib/device';
import { levelOf } from '@/lib/economy';

export interface NavTab {
  href: string;
  label: string;
  /** Version courte, pour la barre d'onglets du téléphone. */
  short?: string;
  emoji?: string;
  Icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}

/**
 * Ossature commune aux deux interfaces.
 *
 * Sur téléphone, rien ne change : barre d'onglets en bas, glissement latéral,
 * zones tactiles larges. Sur Mac et PC, la même app prend la forme attendue
 * d'un logiciel de bureau : colonne de navigation à gauche, contenu centré et
 * plus large, raccourcis clavier ⌘1…⌘5 (Ctrl sous Windows), état de la
 * synchronisation toujours visible. Aucune fonction n'est retirée d'un côté
 * ou de l'autre — c'est la même application, présentée autrement.
 */
export default function NavShell({ role, tabs, children }: {
  role: 'parent' | 'child';
  tabs: readonly NavTab[];
  children: React.ReactNode;
}) {
  const { session, profile, ready, loadError } = useApp();
  const path = usePathname();
  const router = useRouter();
  const device = useDevice();
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!ready || loadError) return;
    if (!session) router.replace('/login');
    else if (profile && profile.role !== role) router.replace(profile.role === 'parent' ? '/parent' : '/now');
  }, [session, profile, ready, loadError, role, router]);

  // Barre latérale seulement quand la fenêtre est assez large : une PWA Mac
  // réduite à un tiers d'écran retrouve la disposition compacte.
  const sidebar = device.desktop && wide;

  useEffect(() => {
    document.documentElement.classList.toggle('is-desktop', device.desktop);
    document.documentElement.classList.toggle('has-sidebar', sidebar);
  }, [device.desktop, sidebar]);

  /**
   * Deux applications installables plutôt qu'une : « Agenda — Parent » et
   * « Agenda — Jeanne ». Le manifeste servi dépend de l'interface affichée, si
   * bien que l'icône posée sur le Dock du Mac ou la barre des tâches du PC
   * porte le bon nom et s'ouvre sur le bon écran. Même code, même compte,
   * même synchronisation — seule l'identité de l'app installée change.
   */
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (link) link.href = role === 'parent' ? '/parent.webmanifest' : '/enfant.webmanifest';
  }, [role]);

  /* Raccourcis clavier : ⌘1…⌘5 sur Mac, Ctrl+1…5 ailleurs. */
  useEffect(() => {
    if (!device.desktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const n = Number(e.key);
      if (!n || n < 1 || n > tabs.length) return;
      e.preventDefault();
      router.push(tabs[n - 1].href);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [device.desktop, tabs, router]);

  const swipe = useSwipeTabs(tabs);

  if (loadError) return <LoadFailure message={loadError} />;
  if (!ready || !profile) return <Loader />;

  const isActive = (href: string) =>
    href === '/parent' ? path === '/parent' : path === href || path.startsWith(href + '/');

  if (sidebar) {
    return (
      <div className="min-h-dvh">
        <Toaster />
        <Sidebar tabs={tabs} isActive={isActive} mac={device.mac} />
        <div className="pl-[268px]">
          <div className="pb-16">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh pb-28" onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd}>
      <Toaster />
      {children}
      <nav className="tabbar fixed inset-x-0 bottom-0 z-40">
        <div className="mx-auto flex max-w-lg px-2 pt-2">
          {tabs.map(({ href, label, short, emoji, Icon }) => {
            const active = isActive(href);
            return (
              <Link key={href} href={href}
                    className={clsx('flex flex-1 flex-col items-center gap-1 rounded-2xl py-2 no-select transition',
                      active ? 'bg-grape-light text-grape' : 'text-muted')}>
                {Icon
                  ? <Icon size={21} strokeWidth={active ? 2.6 : 2} />
                  : <span className={clsx('text-2xl transition', active && 'scale-110')}>{emoji}</span>}
                <span className="text-[10px] font-extrabold">{short ?? label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/* ------------------------------------------------------ colonne de gauche */

function Sidebar({ tabs, isActive, mac }: {
  tabs: readonly NavTab[];
  isActive: (href: string) => boolean;
  mac: boolean;
}) {
  const { profile, settings, child, isParent, signOut } = useApp();
  if (!profile) return null;
  const lvl = settings ? levelOf(profile.xp, settings.xp_per_level) : null;

  return (
    <aside className="sidebar fixed inset-y-0 left-0 z-40 flex w-[268px] flex-col">
      {/* Zone de titre : sur une PWA de bureau, on y déplace la fenêtre. */}
      <div className="drag-region px-5 pb-4" style={{ paddingTop: 'max(env(titlebar-area-y, 0px), 1.25rem)' }}>
        <div className="flex items-center gap-2.5">
          <img src="/icons/icon-192.png" alt="" className="h-9 w-9 rounded-[11px] shadow-float" />
          <div className="min-w-0">
            <p className="truncate text-sm font-black leading-tight text-ink">Agenda Jeanne</p>
            <p className="text-[11px] font-bold text-muted">{isParent ? 'Espace parent' : 'Mon agenda'}</p>
          </div>
        </div>
      </div>

      <div className="px-4">
        <div className="card flex items-center gap-3 p-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-grape-light text-2xl">
            {isParent ? (child?.avatar_emoji ?? '👧') : profile.avatar_emoji}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-ink">
              {isParent ? (child?.display_name ?? 'Enfant') : profile.display_name}
            </p>
            <p className="truncate text-[11px] font-bold text-grape">
              {isParent
                ? `${child?.coins ?? 0} ${settings?.currency_emoji ?? '🪙'} · niveau ${child?.level_reached ?? 1}`
                : lvl ? `Niveau ${lvl.level} · ${lvl.title}` : ''}
            </p>
          </div>
        </div>
      </div>

      <nav className="mt-4 flex-1 space-y-1 overflow-y-auto px-3">
        {tabs.map(({ href, label, emoji, Icon }, i) => {
          const active = isActive(href);
          return (
            <Link key={href} href={href}
                  className={clsx('group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition no-select',
                    active ? 'bg-grape text-white shadow-float' : 'text-ink hover:bg-grape-light')}>
              <span className="grid w-6 shrink-0 place-items-center">
                {Icon ? <Icon size={19} strokeWidth={active ? 2.6 : 2} /> : <span className="text-lg">{emoji}</span>}
              </span>
              <span className="flex-1 truncate text-sm font-extrabold">{label}</span>
              <kbd className={clsx('rounded-md px-1.5 py-0.5 text-[10px] font-black',
                active ? 'bg-white/20 text-white' : 'bg-soft text-muted')}>
                {mac ? '⌘' : '^'}{i + 1}
              </kbd>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 px-4 pb-5 pt-3">
        <InstallHint />
        <SyncBadge />
        <button onClick={signOut} className="btn-plain w-full !py-2.5 text-sm">Se déconnecter</button>
      </div>
    </aside>
  );
}
