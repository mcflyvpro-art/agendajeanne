'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { supabase } from '@/lib/supabase';
import { todayISO, addDaysISO, weekStart, dayShort, dowOf } from '@/lib/dates';

type Mark = 'done' | 'todo' | 'late';

/**
 * Bandeau de la semaine, commun à l'enfant et au parent. Un point sous chaque
 * jour indique s'il reste du travail, s'il est fini ou s'il a été manqué :
 * on voit la semaine d'un coup d'œil sans ouvrir chaque jour.
 */
export default function WeekStrip({ childId, day, onChange, refreshKey }: {
  childId?: string; day: string; onChange: (d: string) => void; refreshKey?: unknown;
}) {
  const start = weekStart(day);
  const week = Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const today = todayISO();

  useEffect(() => {
    if (!childId) return;
    supabase.from('tasks').select('day,status').eq('child_id', childId)
      .gte('day', start).lte('day', addDaysISO(start, 6)).neq('status', 'skipped')
      .then(({ data }) => {
        const by: Record<string, { open: number; missed: number; total: number }> = {};
        for (const t of (data ?? []) as { day: string; status: string }[]) {
          const d = (by[t.day] ??= { open: 0, missed: 0, total: 0 });
          d.total++;
          if (t.status === 'missed') d.missed++;
          else if (t.status !== 'done' && t.status !== 'submitted') d.open++;
        }
        const next: Record<string, Mark> = {};
        for (const [d, v] of Object.entries(by)) {
          next[d] = v.missed || (v.open && d < today) ? 'late' : v.open ? 'todo' : 'done';
        }
        setMarks(next);
      });
  }, [childId, start, refreshKey, today]);

  return (
    <div>
      <div className="flex gap-1.5">
        {week.map((d) => {
          const active = d === day;
          const isToday = d === today;
          const mark = marks[d];
          return (
            <button key={d} onClick={() => onChange(d)} aria-pressed={active}
                    className={clsx('flex flex-1 flex-col items-center rounded-3xl border-2 pb-2 pt-2.5 no-select transition active:scale-95',
                      active ? 'border-grape bg-grape text-white shadow-float' : isToday ? 'border-grape/60 bg-card text-grape' : 'border-line bg-card text-muted')}>
              <span className="text-[10px] font-black uppercase">{dayShort(dowOf(d))}</span>
              <span className="text-xl font-black leading-tight">{Number(d.slice(-2))}</span>
              <span className={clsx('mt-1 h-1.5 w-1.5 rounded-full',
                !mark ? 'bg-transparent'
                  : mark === 'done' ? (active ? 'bg-white' : 'bg-leaf')
                  : mark === 'late' ? (active ? 'bg-white/70' : 'bg-flame')
                  : active ? 'bg-white/70' : 'bg-grape/50')} />
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button onClick={() => onChange(addDaysISO(day, -7))} className="chip" aria-label="Semaine précédente">← Sem. préc.</button>
        {day !== today
          ? <button onClick={() => onChange(today)} className="chip !border-grape !text-grape">Aujourd’hui</button>
          : <span />}
        <button onClick={() => onChange(addDaysISO(day, 7))} className="chip" aria-label="Semaine suivante">Sem. suiv. →</button>
      </div>
    </div>
  );
}
