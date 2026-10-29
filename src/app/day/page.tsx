'use client';
import { useState } from 'react';
import clsx from 'clsx';
import ChildShell from '@/components/ChildShell';
import { useApp } from '@/components/AppProvider';
import { useDay } from '@/lib/useDay';
import { useLive } from '@/lib/useLive';
import { todayISO, relativeDay, longDate, hhmm, humanDuration } from '@/lib/dates';
import { progressOf } from '@/lib/economy';
import { Loader, Bar, Empty, PageHeader } from '@/components/ui';
import WeekStrip from '@/components/WeekStrip';
import type { Task } from '@/lib/types';

export default function DayPage() { return <ChildShell><Day /></ChildShell>; }

function Day() {
  const { profile, settings } = useApp();
  const [day, setDay] = useState(todayISO());
  const { tasks, loading, reload } = useDay(profile?.id, day);
  useLive(['subjects'], reload, 'child-day');
  const prog = progressOf(tasks);
  const minutes = tasks.reduce((n, t) => n + (t.status === 'skipped' ? 0 : t.duration_min), 0);

  return (
    <main className="mx-auto max-w-lg px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <PageHeader title={relativeDay(day).replace(/^./, (c) => c.toUpperCase())}
                  subtitle={relativeDay(day) === longDate(day) ? 'Ma semaine' : longDate(day)} />

      <div className="mt-4">
        <WeekStrip childId={profile?.id} day={day} onChange={setDay} refreshKey={tasks} />
      </div>

      {!!prog.total && (
        <div className="card mt-4 p-4">
          <div className="mb-2 flex justify-between text-sm font-extrabold text-ink">
            <span>✅ {prog.done} / {prog.total} tâches</span>
            <span className="text-muted">⏳ {humanDuration(minutes)}</span>
          </div>
          <Bar pct={prog.pct} color={prog.pct === 100 ? '#1FC08A' : '#7C4DEE'} height={10} />
        </div>
      )}

      {loading ? <Loader /> : tasks.length === 0 ? (
        <div className="mt-4"><Empty emoji="🍃" title="Journée libre" hint="Rien de prévu ce jour-là." /></div>
      ) : (
        <ul className="stagger mt-4 space-y-2.5">
          {tasks.map((t) => <li key={t.id}><Row task={t} currency={settings?.currency_emoji ?? '🪙'} /></li>)}
        </ul>
      )}
    </main>
  );
}

const STATUS: Partial<Record<Task['status'], { icon: string; label: string; cls: string }>> = {
  done:      { icon: '✅', label: 'Fait',        cls: 'text-leaf-dark' },
  submitted: { icon: '⏳', label: 'À valider',   cls: 'text-sun-dark' },
  doing:     { icon: '▶️', label: 'En cours',    cls: 'text-grape' },
  missed:    { icon: '⌛', label: 'Manquée',     cls: 'text-flame' },
  skipped:   { icon: '⤼', label: 'Annulée',     cls: 'text-muted' },
};

function Row({ task, currency }: { task: Task; currency: string }) {
  const st = STATUS[task.status];
  const done = task.status === 'done';
  return (
    <div className={clsx('card flex items-center gap-3 p-4', (done || task.status === 'skipped') && 'opacity-60')}>
      <div className="w-12 shrink-0 text-center">
        <div className="text-sm font-black tabular-nums text-ink">{task.start_time ? hhmm(task.start_time) : 'libre'}</div>
        <div className="mx-auto mt-1.5 h-2 w-2 rounded-full" style={{ background: task.subject?.color ?? '#7C4DEE' }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={clsx('font-extrabold leading-snug text-ink', done && 'line-through')}>{task.title}</p>
        <p className="mt-0.5 truncate text-xs font-bold text-muted">
          {task.subject ? `${task.subject.emoji} ${task.subject.name} · ` : ''}{humanDuration(task.duration_min)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {st ? (
          <span className={clsx('flex flex-col items-center text-[10px] font-black', st.cls)}>
            <span className="text-xl leading-6">{st.icon}</span>{st.label}
          </span>
        ) : <span className="rounded-full bg-grape-light px-2.5 py-1 text-xs font-black text-grape">+{task.coins} {currency}</span>}
      </div>
    </div>
  );
}
