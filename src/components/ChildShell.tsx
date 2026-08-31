'use client';
import NavShell, { type NavTab } from '@/components/NavShell';

const TABS: readonly NavTab[] = [
  { href: '/now',   label: 'Aujourd’hui', short: 'Aujourd’hui', emoji: '🎯' },
  { href: '/day',   label: 'Semaine',     emoji: '🗓️' },
  { href: '/quiz',  label: 'Quiz',        emoji: '🧠' },
  { href: '/shop',  label: 'Boutique',    emoji: '🎁' },
  { href: '/me',    label: 'Moi',         emoji: '⭐' },
];

export default function ChildShell({ children }: { children: React.ReactNode }) {
  return <NavShell role="child" tabs={TABS}>{children}</NavShell>;
}
