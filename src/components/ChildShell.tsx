'use client';
import NavShell, { type NavTab } from '@/components/NavShell';
import TimerPresence from '@/components/TimerPresence';

const TABS: readonly NavTab[] = [
  { href: '/now',   label: 'Aujourd’hui', short: 'Aujourd’hui', emoji: '🎯' },
  { href: '/day',   label: 'Semaine',     emoji: '🗓️' },
  { href: '/quiz',  label: 'Quiz',        emoji: '🧠' },
  { href: '/shop',  label: 'Boutique',    emoji: '🎁' },
  { href: '/me',    label: 'Moi',         emoji: '⭐' },
];

export default function ChildShell({ children }: { children: React.ReactNode }) {
  return (
    <NavShell role="child" tabs={TABS}>
      {/* Tant que l'app est ouverte, cet appareil compte comme présent : le
          chronomètre de la tâche en cours suit l'enfant d'un écran à l'autre. */}
      <TimerPresence />
      {children}
    </NavShell>
  );
}
