'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import ParentShell from '@/components/ParentShell';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { todayISO, addDaysISO, dayShort, dowOf, longDate } from '@/lib/dates';
import { Loader, Stat, Bar, Empty } from '@/components/ui';
import type { Task, Mood } from '@/lib/types';

export default function StatsPage() { return <ParentShell><Stats /></ParentShell>; }

function Stats() {
  const { child, settings } = useApp();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [moods, setMoods] = useState<Mood[]>([]);
  const [range, setRange] = useState(14);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!child) return;
    const from = addDaysISO(todayISO(), -(range - 1));
    (async () => {
      const [t, m] = await Promise.all([
        supabase.from('tasks').select('*, subject:subjects(*)').eq('child_id', child.id).gte('day', from).lte('day', todayISO()),
        supabase.from('moods').select('*').eq('child_id', child.id).gte('day', from),
      ]);
      setTasks((t.data ?? []) as Task[]);
      setMoods((m.data ?? []) as Mood[]);
      setLoading(false);
    })();
  }, [child?.id, range]);

  if (loading || !child || !settings) return <Loader />;

  const days = Array.from({ length: range }, (_, i) => addDaysISO(todayISO(), -(range - 1 - i)));
  const byDay = days.map((d) => {
    const list = tasks.filter((t) => t.day === d && t.status !== 'skipped');
    const done = list.filter((t) => t.status === 'done' || t.status === 'submitted').length;
    return { day: d, total: list.length, done, pct: list.length ? Math.round((done / list.length) * 100) : -1 };
  });

  const total = tasks.filter((t) => t.status !== 'skipped').length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const minutes = tasks.filter((t) => t.status === 'done').reduce((n, t) => n + Math.round(t.active_seconds / 60), 0);
  const late = tasks.filter((t) => t.status === 'missed').length;
  const rate = total ? Math.round((done / total) * 100) : 0;

  // Par matière
  const subjects = [...new Set(tasks.map((t) => t.subject?.name).filter(Boolean))] as string[];
  const bySubject = subjects.map((name) => {
    const list = tasks.filter((t) => t.subject?.name === name && t.status !== 'skipped');
    const d = list.filter((t) => t.status === 'done').length;
    return { name, color: list[0]?.subject?.color ?? '#7C5CFF', emoji: list[0]?.subject?.emoji ?? '📘',
             total: list.length, done: d, pct: list.length ? Math.round((d / list.length) * 100) : 0 };
  }).sort((a, b) => a.pct - b.pct);

  // Heures de meilleure réussite
  const byHour: Record<number, { d: number; t: number }> = {};
  tasks.filter((t) => t.start_time).forEach((t) => {
    const h = Number(t.start_time!.slice(0, 2));
    byHour[h] ??= { d: 0, t: 0 };
    byHour[h].t++;
    if (t.status === 'done') byHour[h].d++;
  });
  const bestHours = Object.entries(byHour)
    .filter(([, v]) => v.t >= 2)
    .map(([h, v]) => ({ h: Number(h), pct: Math.round((v.d / v.t) * 100), n: v.t }))
    .sort((a, b) => b.pct - a.pct);

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 pb-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight">Suivi</h1>
        <div className="flex gap-1.5">
          {[7, 14, 30].map((n) => (
            <button key={n} onClick={() => setRange(n)}
                    className={clsx('chip', range === n && '!border-brand !bg-brand/20 !text-white')}>{n} j</button>
          ))}
        </div>
      </div>

      <div className="flex gap-2.5">
        <Stat emoji="✅" value={`${rate} %`} label="réussite" color={rate >= 70 ? '#2FD8A5' : rate >= 40 ? '#FFC44D' : '#FF6B6B'} />
        <Stat emoji="📋" value={`${done}/${total}`} label="tâches" />
        <Stat emoji="⏱️" value={`${Math.round(minutes / 60)} h`} label="travail" />
        <Stat emoji="🔥" value={child.streak_current} label="série" color="#FFC44D" />
      </div>

      <section className="card p-4">
        <p className="label !mb-3">Jour par jour</p>
        <div className="flex items-end gap-1" style={{ height: 110 }}>
          {byDay.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-1 items-end">
                <div className="w-full rounded-t-md transition-all"
                     style={{
                       height: d.pct < 0 ? '3px' : `${Math.max(6, d.pct)}%`,
                       background: d.pct < 0 ? '#2A2A3C' : d.pct === 100 ? '#2FD8A5' : d.pct >= 50 ? '#7C5CFF' : '#FF6B6B',
                       opacity: d.pct < 0 ? 0.5 : 1,
                     }} />
              </div>
              <span className="text-[8px] text-muted">{dayShort(dowOf(d.day)).slice(0, 1)}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">Hauteur = pourcentage de tâches terminées ce jour-là.</p>
      </section>

      {!!bySubject.length && (
        <section className="card p-4">
          <p className="label !mb-3">Par matière</p>
          <ul className="space-y-3">
            {bySubject.map((s) => (
              <li key={s.name}>
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="font-semibold">{s.emoji} {s.name}</span>
                  <span className={clsx('font-bold', s.pct >= 70 ? 'text-mint' : s.pct >= 40 ? 'text-sun' : 'text-coral')}>
                    {s.done}/{s.total} · {s.pct} %
                  </span>
                </div>
                <Bar pct={s.pct} color={s.color} />
              </li>
            ))}
          </ul>
          {bySubject[0] && bySubject[0].pct < 50 && (
            <p className="mt-3 rounded-2xl border border-sun/25 bg-sun/[.07] px-3 py-2.5 text-[11px] leading-relaxed text-sun">
              💡 {bySubject[0].emoji} {bySubject[0].name} bloque nettement plus que le reste. Souvent le signe que les
              tâches y sont trop grosses ou trop floues — essaie de les découper davantage.
            </p>
          )}
        </section>
      )}

      {!!bestHours.length && (
        <section className="card p-4">
          <p className="label !mb-3">Ses meilleures heures</p>
          <ul className="space-y-2">
            {bestHours.slice(0, 5).map((h) => (
              <li key={h.h} className="flex items-center gap-3">
                <span className="w-12 shrink-0 font-mono text-xs text-white/70">{String(h.h).padStart(2, '0')}:00</span>
                <div className="flex-1"><Bar pct={h.pct} color={h.pct >= 70 ? '#2FD8A5' : '#7C5CFF'} /></div>
                <span className="w-14 shrink-0 text-right text-[11px] text-muted">{h.pct} % · {h.n}×</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Programme les matières les plus difficiles sur ses créneaux les plus fiables.
          </p>
        </section>
      )}

      {!!moods.length && (
        <section className="card p-4">
          <p className="label !mb-3">Humeur</p>
          <div className="flex gap-1.5">
            {moods.slice(-14).map((m) => (
              <div key={m.id} className="flex-1 text-center">
                <div className="text-lg">{['', '😞', '😕', '😐', '🙂', '😄'][m.mood]}</div>
                <div className="text-[8px] text-muted">{m.day.slice(-2)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {total === 0 && <Empty emoji="📊" title="Pas encore de données" hint="Les statistiques apparaîtront après quelques jours." />}
    </main>
  );
}
