'use client';
import { useState } from 'react';
import clsx from 'clsx';
import ChildShell from '@/components/ChildShell';
import { useApp } from '@/components/AppProvider';
import { useDay } from '@/lib/useDay';
import { todayISO, addDaysISO, relativeDay, hhmm, humanDuration, dayShort, dowOf, weekStart } from '@/lib/dates';
import { progressOf } from '@/lib/economy';
import { Loader, Bar, Empty } from '@/components/ui';
import type { Task } from '@/lib/types';

export default function DayPage() { return <ChildShell><Day /></ChildShell>; }

function Day() {
  const { profile, settings } = useApp();
  const [day, setDay] = useState(todayISO());
  const { tasks, loading } = useDay(profile?.id, day);
  const prog = progressOf(tasks);
  const week = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart(day), i));

  return (
    <main className="mx-auto max-w-lg px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <h1 className="text-3xl font-black capitalize text-ink">{relativeDay(day)}</h1>

      <div className="mt-4 flex gap-2">
        {week.map((d) => {
          const active = d === day;
          const isToday = d === todayISO();
          return (
            <button key={d} onClick={() => setDay(d)}
                    className={clsx('flex flex-1 flex-col items-center rounded-3xl border-2 py-2.5 no-select transition',
                      active ? 'border-grape bg-grape text-white' : isToday ? 'border-grape bg-card text-grape' : 'border-line bg-card text-muted')}>
              <span className="text-[10px] font-black uppercase">{dayShort(dowOf(d))}</span>
              <span className="text-xl font-black leading-tight">{Number(d.slice(-2))}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex justify-between">
        <button onClick={() => setDay(addDaysISO(day, -7))} className="chip">←</button>
        <button onClick={() => setDay(todayISO())} className="chip !border-grape !text-grape">Aujourd’hui</button>
        <button onClick={() => setDay(addDaysISO(day, 7))} className="chip">→</button>
      </div>

      {!!prog.total && (
        <div className="mt-5">
          <div className="mb-2 flex justify-between text-sm font-extrabold text-ink">
            <span>✅ {prog.done} / {prog.total}</span><span>{prog.pct}%</span>
          </div>
          <Bar pct={prog.pct} color={prog.pct === 100 ? '#1FC08A' : '#7C4DEE'} />
        </div>
      )}

      {loading ? <Loader /> : tasks.length === 0 ? (
        <div className="mt-6"><Empty emoji="🍃" title="Journée libre" /></div>
      ) : (
        <ul className="stagger mt-5 space-y-3">
          {tasks.map((t) => <li key={t.id}><Row task={t} currency={settings?.currency_emoji ?? '🪙'} /></li>)}
        </ul>
      )}
    </main>
  );
}

function Row({ task, currency }: { task: Task; currency: string }) {
  const done = task.status === 'done';
  const submitted = task.status === 'submitted';
  const doing = task.status === 'doing';
  return (
    <div className={clsx('card flex items-center gap-3 p-4', done && 'opacity-60')}>
      <div className="w-14 shrink-0 text-center">
        <div className="text-sm font-black tabular-nums text-ink">{task.start_time ? hhmm(task.start_time) : '—'}</div>
        <div className="mx-auto mt-1.5 h-2 w-2 rounded-full" style={{ background: task.subject?.color ?? '#7C4DEE' }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={clsx('font-extrabold text-ink', done && 'line-through')}>{task.title}</p>
        <p className="mt-0.5 text-xs font-bold text-muted">
          {task.subject ? `${task.subject.emoji} ` : ''}{humanDuration(task.duration_min)}
        </p>
      </div>
      <div className="shrink-0 text-center">
        {done ? <span className="text-2xl">✅</span>
          : submitted ? <span className="text-2xl">⏳</span>
          : doing ? <span className="text-2xl">▶️</span>
          : <span className="text-sm font-black text-grape">+{task.coins} {currency}</span>}
      </div>
    </div>
  );
}
