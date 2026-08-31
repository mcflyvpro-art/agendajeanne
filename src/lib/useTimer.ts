'use client';
import { useCallback, useEffect, useState } from 'react';
import { deviceId } from '@/lib/device';
import { syncClock } from '@/lib/clock';
import {
  elapsedOf, isTimerLive, worksInBackground, timerPause, timerResume,
} from '@/lib/timer';
import type { Task } from '@/lib/types';

export interface TimerState {
  /** Temps de travail affiché, en secondes. */
  seconds: number;
  /** Le chrono tourne réellement en ce moment. */
  running: boolean;
  /** Pause volontaire — la seule qui empêche un autre appareil de relancer. */
  paused: boolean;
  /** Sur cet appareil, le temps continue-t-il hors du premier plan ? */
  background: boolean;
  /** Un autre appareil pilote le chrono (deuxième écran ouvert). */
  otherDevice: boolean;
  pause: () => void;
  resume: () => void;
}

/**
 * Affichage du chronomètre.
 *
 * Ce hook ne compte rien et n'écrit rien de lui-même : il lit la ligne de la
 * tâche, qui est la seule source de vérité, et la rafraîchit à l'écran chaque
 * seconde. La présence de l'appareil est tenue ailleurs, par l'agent monté
 * dans la coquille enfant (`TimerPresence`), pour que passer d'un écran à
 * l'autre n'interrompe jamais le décompte.
 *
 * Seuls les deux boutons — Pause et Reprendre — écrivent, et ce sont des
 * gestes délibérés de l'enfant.
 */
export function useTaskTimer(task: Task | null): TimerState {
  const [, tick] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => { syncClock(); }, []);

  useEffect(() => {
    if (task?.status !== 'doing') return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [task?.status]);

  const pause = useCallback(async () => {
    if (!task || busy) return;
    setBusy(true); await timerPause(task.id); setBusy(false);
  }, [task?.id, busy]);

  const resume = useCallback(async () => {
    if (!task || busy) return;
    setBusy(true); await timerResume(task.id); setBusy(false);
  }, [task?.id, busy]);

  if (!task) {
    return { seconds: 0, running: false, paused: false, background: false, otherDevice: false, pause, resume };
  }

  const live = isTimerLive(task);
  return {
    seconds: elapsedOf(task),
    running: live && !task.timer_paused,
    paused: !!task.timer_paused,
    background: worksInBackground(task),
    otherDevice: live && !!task.timer_device && task.timer_device !== deviceId(),
    pause, resume,
  };
}
