'use client';
import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { serverNow, syncClock } from '@/lib/clock';
import {
  isTimerLive, isPresent, worksInBackground,
  timerTouch, timerRelease, releaseOnUnload,
  HEARTBEAT_MS, STALE_MS, BACKFILL_CAP_S,
} from '@/lib/timer';
import type { Task } from '@/lib/types';

/**
 * L'agent de présence : le seul endroit de l'app qui dit au serveur
 * « je suis là ». Il est monté une fois pour toutes dans l'interface enfant,
 * pas dans l'écran du minuteur — sans quoi passer à la Boutique ou aux Quiz
 * couperait le chronomètre, alors que l'app n'a pas bougé.
 *
 * Ce qu'il fait, et rien d'autre :
 *  · il annonce sa présence toutes les quinze secondes ;
 *  · il annonce son départ quand l'appareil quitte pour de bon ;
 *  · il reprend la main quand le chrono s'arrête alors qu'il est présent —
 *    c'est ce qui fait qu'ouvrir l'app sur le téléphone relance le temps.
 */
export function useTimerAgent(task: Task | null, enabled: boolean) {
  const taskRef = useRef<Task | null>(task);
  taskRef.current = task;

  /** Dernier instant où cet appareil s'est su présent ET joignable. */
  const lastBeat = useRef(0);
  /** Secondes de présence non transmises (réseau coupé, onglet gelé). */
  const owed = useRef(0);

  const active = enabled && task?.status === 'doing';

  useEffect(() => { if (enabled) syncClock(); }, [enabled]);

  const beat = useCallback(async () => {
    const t = taskRef.current;
    if (!t || t.status !== 'doing' || t.timer_paused) return;
    if (!isPresent(t)) return;

    const now = serverNow();
    const gap = lastBeat.current ? Math.max(0, Math.floor((now - lastBeat.current) / 1000)) : 0;
    // Un trou plus long que la tolérance du serveur veut dire que le segment
    // a été coupé alors qu'on était là : ces secondes sont dues. Elles restent
    // bornées par le temps réellement écoulé, côté SQL — rien à inventer.
    const backfill = Math.min(BACKFILL_CAP_S, (gap > STALE_MS / 1000 ? gap : 0) + owed.current);

    const row = await timerTouch(t.id, backfill);
    if (row) { lastBeat.current = now; owed.current = 0; }
    else { owed.current = Math.min(BACKFILL_CAP_S, owed.current + gap); }
  }, []);

  /* Battement régulier. Au premier plan toutes les 15 s ; en arrière-plan, le
     navigateur ralentit ce minuteur à une fois par minute — c'est prévu, le
     serveur tolère 150 s de silence avant de considérer l'appareil parti. */
  useEffect(() => {
    if (!active) return;
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [active, task?.id, beat]);

  /* Reprise immédiate : le chrono vient de s'arrêter (l'autre appareil s'est
     fermé) alors que celui-ci est présent. On ne fait pas attendre l'enfant
     jusqu'au prochain battement. Le petit délai aléatoire évite que deux
     appareils se disputent la reprise à la milliseconde près. */
  useEffect(() => {
    const t = taskRef.current;
    if (!active || !t || t.timer_paused || !isPresent(t) || isTimerLive(t)) return;
    const id = setTimeout(beat, 300 + Math.random() * 500);
    return () => clearTimeout(id);
  }, [active, task?.id, task?.timer_running, task?.timer_heartbeat_at, task?.timer_paused, beat]);

  /* Départs et retours. */
  useEffect(() => {
    if (!active || !task) return;
    const id = task.id;

    const onVisibility = () => {
      const t = taskRef.current;
      if (!t) return;
      if (document.visibilityState === 'visible') { lastBeat.current = serverNow(); beat(); }
      else if (!worksInBackground(t)) { lastBeat.current = 0; owed.current = 0; timerRelease(id); }
      else beat();
    };

    /* Fermeture de la fenêtre ou de l'app : une requête ordinaire mourrait
       avec la page, celle-ci survit. */
    const onPageHide = () => {
      const t = taskRef.current;
      if (!t || t.work_on_phone) return;
      lastBeat.current = 0;
      supabase.auth.getSession().then(({ data }) => releaseOnUnload(id, data.session?.access_token ?? null));
    };

    /* Le navigateur gèle l'onglet : plus aucun minuteur ne tournera. */
    const onFreeze = () => {
      const t = taskRef.current;
      lastBeat.current = 0;
      if (t && !t.work_on_phone) timerRelease(id);
    };
    const onWake = () => { lastBeat.current = serverNow(); syncClock().then(beat); };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('freeze', onFreeze);
    document.addEventListener('resume', onWake);
    window.addEventListener('online', onWake);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('freeze', onFreeze);
      document.removeEventListener('resume', onWake);
      window.removeEventListener('online', onWake);
    };
  }, [active, task?.id, beat]);
}
