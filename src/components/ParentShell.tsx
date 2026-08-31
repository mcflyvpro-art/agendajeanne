'use client';
import { LayoutDashboard, CalendarRange, Gift, BarChart3, SlidersHorizontal } from 'lucide-react';
import NavShell, { type NavTab } from '@/components/NavShell';

const TABS: readonly NavTab[] = [
  { href: '/parent',         label: 'Tableau de bord', short: 'Bord',     Icon: LayoutDashboard },
  { href: '/parent/agenda',  label: 'Agenda',          short: 'Agenda',   Icon: CalendarRange },
  { href: '/parent/rewards', label: 'Boutique',        short: 'Boutique', Icon: Gift },
  { href: '/parent/stats',   label: 'Suivi',           short: 'Suivi',    Icon: BarChart3 },
  { href: '/parent/rules',   label: 'Réglages',        short: 'Réglages', Icon: SlidersHorizontal },
];

export default function ParentShell({ children }: { children: React.ReactNode }) {
  return <NavShell role="parent" tabs={TABS}>{children}</NavShell>;
}
