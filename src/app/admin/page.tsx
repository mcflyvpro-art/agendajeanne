'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { useDay } from '@/lib/useDay';
import { useLive } from '@/lib/useLive';
import { useAllPresence, useSyncState, resync } from '@/lib/sync';
import { elapsedOf, isTimerLive } from '@/lib/actions';
import { todayISO, hhmm, humanDuration, longDate } from '@/lib/dates';
import { moodEmoji } from '@/lib/mood';
import { reactionEmoji } from '@/lib/reactions';
import { Loader, Toaster } from '@/components/ui';
import LoadFailure from '@/components/LoadFailure';
import type { Profile, Task, Message, LedgerRow, Redemption, Mood } from '@/lib/types';

/**
 * Compte observateur.
 *
 * Lecture seule, de bout en bout : cette page ne pose jamais d'`update`,
 * d'`insert` ni de `delete`. Ce n'est pas qu'une discipline de code — la base
 * refuse d'elle-même toute écriture à un compte qui n'a pas le rôle `parent`
 * (`is_parent()` dans les politiques RLS). Même une page mal écrite ne
 * pourrait rien changer.
 *
 * Pensée pour un coup d'œil rapide depuis un téléphone : ce qui se passe côté
 * parent et côté enfant, en un seul écran, à jour en direct.
 */
export default function AdminPage() {
  const { session, profile, ready, loadError, child, signOut } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!ready || loadError) return;
    if (!session) router.replace('/login');
    else if (profile && profile.role !== 'admin') {
      router.replace(profile.role === 'parent' ? '/parent' : '/now');
    }
  }, [session, profile, ready, loadError, router]);

  if (loadError) return <LoadFailure message={loadError} />;
  if (!ready || !profile) return <Loader />;
  if (profile.role !== 'admin') return <Loader />;

  return <Observatory child={child} signOut={signOut} />;
}

function Observatory({ child, signOut }: { child: Profile | null; signOut: () => Promise<void> }) {
  const today = todayISO();
  const { tasks, loading: tasksLoading } = useDay(child?.id, today);
  const [parents, setParents] = useState<Profile[]>([]);
  const presence = useAllPresence();
  const syncState = useSyncState();

  const loadParents = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('role', 'parent').order('display_name');
    setParents((data ?? []) as Profile[]);
  }, []);
  useEffect(() => { loadParents(); }, [loadParents]);
  useLive(['profiles'], loadParents, 'admin-parents');

  const people = useMemo(() => {
    const map = new Map<string, Profile>();
    if (child) map.set(child.id, child);
    for (const p of parents) map.set(p.id, p);
    return map;
  }, [child, parents]);

  const current = tasks.find((t) => t.status === 'doing') ?? null;

  return (
    <div className="min-h-dvh pb-16" style={{ background: '#12101A' }}>
      <Toaster />
      <main className="mx-auto max-w-2xl px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.25rem)' }}>
        <Header syncState={syncState} onRefresh={() => resync(true)} onSignOut={signOut} />

        <Connected presence={presence} />

        {child && <NowWorking task={current} child={child} />}

        {child && <ChildDay tasks={tasks} loading={tasksLoading} child={child} />}

        {child && <Economy child={child} />}

        <Feed people={people} childId={child?.id} />
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ entête */
function Header({ syncState, onRefresh, onSignOut }: {
  syncState: string; onRefresh: () => void; onSignOut: () => Promise<void>;
}) {
  const dot = syncState === 'live' ? 'bg-emerald-400' : syncState === 'offline' ? 'bg-rose-400' : 'bg-amber-400 animate-pulse';
  const label = syncState === 'live' ? 'Synchronisé' : syncState === 'offline' ? 'Hors ligne'
    : syncState === 'reconnecting' ? 'Reconnexion…' : 'Connexion…';

  return (
    <header className="flex items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-black text-white">🔭 Observateur</h1>
        <button onClick={onRefresh} className="mt-1 flex items-center gap-1.5">
          <span className={clsx('h-2 w-2 rounded-full', dot)} />
          <span className="text-xs font-bold text-white/50">{label}</span>
        </button>
      </div>
      <button onClick={onSignOut}
              className="rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-black text-white/70">
        Se déconnecter
      </button>
    </header>
  );
}

/* --------------------------------------------------------------- présence */
function Connected({ presence }: { presence: ReturnType<typeof useAllPresence> }) {
  return (
    <section className="mt-5 rounded-3xl border border-white/10 bg-white/[.04] p-4">
      <p className="text-xs font-black uppercase tracking-wide text-white/40">Connectés maintenant</p>
      {presence.length === 0 ? (
        <p className="mt-2 text-sm font-bold text-white/40">Personne pour le moment</p>
      ) : (
        <ul className="mt-2.5 flex flex-wrap gap-2">
          {presence.map((p) => (
            <li key={p.device} className="flex items-center gap-1.5 rounded-2xl bg-white/[.06] px-3 py-1.5">
              <span className="text-base">{p.emoji}</span>
              <span className="text-sm font-bold text-white">{p.name}</span>
              <span className="text-xs font-semibold text-white/40">{p.label}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------- en direct */
function NowWorking({ task, child }: { task: Task | null; child: Profile }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, []);

  if (!task) {
    return (
      <section className="mt-3 rounded-3xl border border-white/10 bg-white/[.04] p-4">
        <p className="text-sm font-bold text-white/50">{child.display_name} n'a rien en cours</p>
      </section>
    );
  }

  const sec = elapsedOf(task);
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  const live = isTimerLive(task) && !task.timer_paused;
  const onComputer = task.timer_device_kind === 'desktop';

  const label = task.timer_paused ? 'En pause — pause volontaire'
    : live ? 'Travaille en ce moment'
    : task.work_on_phone ? 'Arrêtée'
    : onComputer ? 'Arrêtée — app fermée sur l’ordinateur'
    : 'En pause — a quitté l’app';

  return (
    <section className={clsx('mt-3 rounded-3xl border p-4',
      live ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-amber-400/25 bg-amber-400/10')}>
      <div className="flex items-center gap-3">
        <span className="text-2xl">{live ? '▶️' : '⏸️'}</span>
        <div className="min-w-0 flex-1">
          <p className={clsx('text-xs font-black', live ? 'text-emerald-300' : 'text-amber-300')}>{label}</p>
          <p className="truncate font-extrabold text-white">{task.title}</p>
          <p className="mt-0.5 text-xs font-bold text-white/40">
            {onComputer ? '💻 sur ordinateur' : '📱 sur téléphone'}
            {task.work_on_phone && ' · devoir hors de l’app'}
          </p>
        </div>
        <span className="shrink-0 text-xl font-black tabular-nums text-white">{mm}:{ss}</span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- la journée */
function ChildDay({ tasks, loading, child }: { tasks: Task[]; loading: boolean; child: Profile }) {
  if (loading) return null;
  const done = tasks.filter((t) => t.status === 'done' || t.status === 'submitted').length;
  const total = tasks.filter((t) => t.status !== 'skipped').length;

  return (
    <section className="mt-3 rounded-3xl border border-white/10 bg-white/[.04] p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-wide text-white/40">Journée de {child.display_name}</p>
        <p className="text-xs font-bold text-white/40">{done} / {total} · {longDate(todayISO())}</p>
      </div>
      {tasks.length === 0 ? (
        <p className="mt-2 text-sm font-bold text-white/40">Rien de prévu aujourd’hui</p>
      ) : (
        <ul className="mt-2.5 space-y-1.5">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-2xl bg-white/[.03] px-3 py-2.5">
              <span className="w-12 shrink-0 text-xs font-black tabular-nums text-white/50">
                {t.start_time ? hhmm(t.start_time) : '—'}
              </span>
              <span className={clsx('min-w-0 flex-1 truncate text-sm font-bold',
                t.status === 'done' ? 'text-white/40 line-through' : 'text-white')}>
                {t.title}
              </span>
              <span className="shrink-0 text-base">
                {t.status === 'done' ? '✅' : t.status === 'doing' ? '▶️' : t.status === 'submitted' ? '⏳'
                  : t.status === 'skipped' ? '➖' : t.status === 'missed' ? '❌' : '⬜'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------- économie */
function Economy({ child }: { child: Profile }) {
  return (
    <section className="mt-3 grid grid-cols-4 gap-2">
      {[
        { v: child.coins, l: 'solde', e: '🪙' },
        { v: child.xp, l: 'xp', e: '⚡' },
        { v: child.streak_current, l: 'série', e: '🔥' },
        { v: child.level_reached, l: 'niveau', e: '⭐' },
      ].map((s) => (
        <div key={s.l} className="rounded-2xl border border-white/10 bg-white/[.04] px-2 py-3 text-center">
          <div className="text-lg leading-none">{s.e}</div>
          <div className="mt-1 text-lg font-black tabular-nums text-white">{s.v}</div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-white/40">{s.l}</div>
        </div>
      ))}
    </section>
  );
}

/* --------------------------------------------------------------- le fil */
type FeedItem = { id: string; at: string; icon: string; text: string; who: string };

function Feed({ people, childId }: { people: Map<string, Profile>; childId: string | undefined }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const nameOf = useCallback((id: string | null) => (id && people.get(id)?.display_name) || '—', [people]);

  const load = useCallback(async () => {
    const [msgs, ledger, redeem, moods] = await Promise.all([
      supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('ledger').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('redemptions').select('*').order('created_at', { ascending: false }).limit(15),
      supabase.from('moods').select('*').order('created_at', { ascending: false }).limit(10),
    ]);

    const rows: FeedItem[] = [];
    for (const m of (msgs.data ?? []) as Message[]) {
      const icon = m.kind === 'kudos' ? '💜' : m.kind === 'blocked' ? '🆘' : m.kind === 'alert' ? '⚠️' : '💬';
      rows.push({ id: `m-${m.id}`, at: m.created_at, icon, text: `${m.emoji ?? ''} ${m.body}`.trim(), who: nameOf(m.from_id) });
      if (m.reaction) {
        rows.push({ id: `mr-${m.id}`, at: m.created_at, icon: reactionEmoji(m.reaction) ?? '↩️', text: `réaction à « ${m.body.slice(0, 40)} »`, who: nameOf(m.to_id) });
      }
    }
    for (const l of (ledger.data ?? []) as LedgerRow[]) {
      rows.push({
        id: `l-${l.id}`, at: l.created_at,
        icon: l.amount >= 0 ? '➕' : '➖',
        text: `${l.amount >= 0 ? '+' : ''}${l.amount} · ${l.reason}`,
        who: nameOf(l.child_id),
      });
    }
    for (const r of (redeem.data ?? []) as Redemption[]) {
      rows.push({
        id: `r-${r.id}`, at: r.created_at, icon: '🎁',
        text: `${r.reward_emoji ?? '🎁'} ${r.reward_name} — ${r.status}`,
        who: nameOf(r.child_id),
      });
    }
    for (const mo of (moods.data ?? []) as Mood[]) {
      rows.push({ id: `mo-${mo.id}`, at: mo.created_at ?? mo.day, icon: moodEmoji(mo.code, mo.mood), text: 'a partagé son humeur', who: nameOf(childId ?? null) });
    }

    rows.sort((a, b) => b.at.localeCompare(a.at));
    setItems(rows.slice(0, 40));
  }, [nameOf, childId]);

  useEffect(() => { load(); }, [load]);
  useLive(['messages', 'ledger', 'redemptions', 'moods'], load, 'admin-feed');

  return (
    <section className="mt-3 rounded-3xl border border-white/10 bg-white/[.04] p-4">
      <p className="text-xs font-black uppercase tracking-wide text-white/40">Fil d’activité</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm font-bold text-white/40">Rien encore</p>
      ) : (
        <ul className="mt-2.5 space-y-2">
          {items.map((it) => (
            <li key={it.id} className="flex items-start gap-2.5 rounded-2xl bg-white/[.03] px-3 py-2.5">
              <span className="mt-0.5 shrink-0 text-base">{it.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">
                  <span className="text-white/60">{it.who}</span> · {it.text}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-white/35">
                  {new Date(it.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
