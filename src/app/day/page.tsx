'use client';
import { useState } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Check, Clock, Hourglass } from 'lucide-react';
import ChildShell from '@/components/ChildShell';
import { useApp } from '@/components/AppProvider';
import { useDay } from '@/lib/useDay';
import { todayISO, addDaysISO, relativeDay, hhmm, humanDuration } from '@/lib/dates';
import { progressOf } from '@/lib/economy';
import { Loader, Bar, Empty } from '@/components/ui';
import type { Task } from '@/lib/types';

export default function DayPage() { return <ChildShell><Day /></ChildShell>; }

const STATUS: Record<string, { label: string; cls: string }> = {
  todo:      { label: 'À faire',      cls: 'text-muted' },
  doing:     { label: 'En cours',     cls: 'text-mint' },
  submitted: { label: 'En attente',   cls: 'text-sun' },
  done:      { label: 'Fait',         cls: 'text-mint' },
  skipped:   { label: 'Annulée',      cls: 'text-muted' },
  missed:    { label: 'Manquée',      cls: 'text-coral' },
};

function Day() {
  const { profile, settings } = useApp();
  const [day, setDay] = useState(todayISO());
  const { tasks, loading } = useDay(profile?.id, day);
  const prog = progressOf(tasks);

  return (
    <main className="mx-auto max-w-lg px-4 pb-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setDay(addDaysISO(day, -1))} className="btn-soft h-11 w-11 !rounded-full !p-0">
          <ChevronLeft size={19} />
        </button>
        <div className="text-center">
          <h1 className="text-xl font-black capitalize tracking-tight">{relativeDay(day)}</h1>
          {day !== todayISO() && (
            <button onClick={() => setDay(todayISO())} className="text-[11px] font-semibold text-brand-soft">
              revenir à aujourd’hui
            </button>
          )}
        </div>
        <button onClick={() => setDay(addDaysISO(day, 1))} className="btn-soft h-11 w-11 !rounded-full !p-0">
          <ChevronRight size={19} />
        </button>
      </div>

      {!!prog.total && (
        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-[11px] font-semibold text-muted">
            <span>{prog.done} sur {prog.total}</span>
            <span>{prog.pct} %</span>
          </div>
          <Bar pct={prog.pct} color={prog.pct === 100 ? '#2FD8A5' : '#7C5CFF'} />
        </div>
      )}

      {loading ? <Loader /> : tasks.length === 0 ? (
        <div className="mt-8"><Empty emoji="🍃" title="Journée libre" hint="Aucune tâche prévue ce jour-là." /></div>
      ) : (
        <ul className="stagger mt-5 space-y-2.5">
          {tasks.map((t) => <li key={t.id}><Row task={t} currency={settings?.currency_emoji ?? '🪙'} /></li>)}
        </ul>
      )}
    </main>
  );
}

function Row({ task, currency }: { task: Task; currency: string }) {
  const st = STATUS[task.status] ?? STATUS.todo;
  const finished = task.status === 'done' || task.status === 'submitted';
  return (
    <div className={clsx('card flex gap-3 p-3.5 transition', finished && 'opacity-60')}>
      <div className="flex w-12 shrink-0 flex-col items-center pt-0.5">
        <span className="font-mono text-xs font-bold text-white/80">{task.start_time ? hhmm(task.start_time) : '~'}</span>
        <span className="mt-1 h-1.5 w-1.5 rounded-full" style={{ background: task.subject?.color ?? '#7C5CFF' }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={clsx('font-bold leading-snug', finished && 'line-through')}>{task.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          {task.subject && <span>{task.subject.emoji} {task.subject.name}</span>}
          <span className="inline-flex items-center gap-1"><Clock size={11} />{humanDuration(task.duration_min)}</span>
          <span className={clsx('font-semibold', st.cls)}>{st.label}</span>
        </div>
        {!!task.subtasks?.length && (
          <p className="mt-1 text-[11px] text-muted">
            {task.subtasks.filter((s) => s.done).length}/{task.subtasks.length} étapes
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end justify-center">
        {task.status === 'done' ? (
          <>
            <span className="grid h-7 w-7 place-items-center rounded-full bg-mint/15 text-mint"><Check size={15} strokeWidth={3} /></span>
            <span className="mt-1 text-[10px] font-bold text-mint">+{task.coins_awarded ?? task.coins}</span>
          </>
        ) : task.status === 'submitted' ? (
          <span className="grid h-7 w-7 place-items-center rounded-full bg-sun/15 text-sun"><Hourglass size={14} /></span>
        ) : (
          <span className="text-[11px] font-bold text-brand-soft">+{task.coins} {currency}</span>
        )}
      </div>
    </div>
  );
}
