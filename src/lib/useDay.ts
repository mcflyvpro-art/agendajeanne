'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { subscribeTables } from '@/lib/sync';
import type { Task, Subtask } from '@/lib/types';
import { toMinutes } from '@/lib/dates';

/** Tâches d'un jour, triées, avec sous-tâches, rafraîchies en temps réel. */
export function useDay(childId: string | undefined, day: string) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!childId) return;
    const { data } = await supabase
      .from('tasks')
      .select('*, subject:subjects(*), subtasks(*)')
      .eq('child_id', childId).eq('day', day);

    const rows = ((data ?? []) as Task[]).map((t) => ({
      ...t,
      subtasks: (t.subtasks ?? []).slice().sort((a: Subtask, b: Subtask) => a.position - b.position),
    }));
    rows.sort((a, b) => {
      const am = toMinutes(a.start_time), bm = toMinutes(b.start_time);
      if (am === null && bm === null) return a.created_at.localeCompare(b.created_at);
      if (am === null) return 1;
      if (bm === null) return -1;
      return am - bm;
    });
    setTasks(rows);
    setLoading(false);
  }, [childId, day]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  useEffect(() => {
    if (!childId) return;
    return subscribeTables(['tasks', 'subtasks', 'subjects'], load);
  }, [childId, day, load]);

  return { tasks, loading, reload: load };
}
