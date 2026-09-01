'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/components/AppProvider';
import { useLive } from '@/lib/useLive';
import { useTimerAgent } from '@/lib/useTimerAgent';
import type { Task } from '@/lib/types';

/**
 * Monté une seule fois dans l'interface enfant, sur tous les écrans.
 *
 * Tant que cette page-là est ouverte, l'appareil compte comme présent : le
 * chronomètre de la tâche en cours continue, qu'on soit sur « Aujourd'hui »,
 * dans la Boutique ou sur un Quiz. Il ne s'arrête que quand l'app est
 * réellement quittée — et, sur téléphone, dès qu'elle passe en arrière-plan.
 *
 * Un compte observateur qui regarde cette même interface ne doit surtout
 * pas participer à ce battement : son navigateur enverrait sinon de faux
 * signes de présence pour la vraie tâche de l'enfant, capables de faire
 * croire au serveur que quelqu'un y travaille encore après que l'enfant a
 * réellement fermé l'app.
 *
 * Ne dessine rien.
 */
export default function TimerPresence() {
  const { profile, isObserving } = useApp();
  const [task, setTask] = useState<Task | null>(null);
  const isChild = profile?.role === 'child' && !isObserving;

  const load = useCallback(async () => {
    if (!isChild || !profile) { setTask(null); return; }
    const { data } = await supabase.from('tasks').select('*')
      .eq('child_id', profile.id).eq('status', 'doing')
      .order('started_at', { ascending: false }).limit(1);
    setTask(((data ?? [])[0] as Task) ?? null);
  }, [isChild, profile?.id]);

  useEffect(() => { load(); }, [load]);
  useLive(['tasks'], load, 'timer-presence');

  useTimerAgent(task, !!isChild);
  return null;
}
