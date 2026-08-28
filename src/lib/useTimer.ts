'use client';
import { useEffect, useRef, useState } from 'react';
import { pauseTimer, resumeTimer, elapsedOf } from '@/lib/actions';
import type { Task } from '@/lib/types';

/**
 * Chronomètre qui n'avance que si la page est réellement affichée.
 * Quitter l'app fige le compteur ; y revenir le relance. L'état est écrit en
 * base pour que le parent voie en direct si le travail est en cours ou en pause.
 */
export function useTaskTimer(task: Task | null) {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const secRef = useRef(0);
  const savedRef = useRef(0);

  // (Ré)initialise au changement de tâche
  useEffect(() => {
    if (!task) return;
    const start = elapsedOf(task);
    secRef.current = start;
    savedRef.current = start;
    setSeconds(start);
    setRunning(task.timer_running && document.visibilityState === 'visible');
  }, [task?.id]);

  // Tic-tac, uniquement page visible
  useEffect(() => {
    if (!task || task.status !== 'doing') return;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      secRef.current += 1;
      setSeconds(secRef.current);
      if (secRef.current - savedRef.current >= 20) {
        savedRef.current = secRef.current;
        resumeTimer(task.id, secRef.current);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [task?.id, task?.status]);

  // Pause quand l'enfant quitte l'app, reprise à son retour
  useEffect(() => {
    if (!task || task.status !== 'doing') return;

    const onVisibility = () => {
      const visible = document.visibilityState === 'visible';
      setRunning(visible);
      savedRef.current = secRef.current;
      if (visible) resumeTimer(task.id, secRef.current);
      else pauseTimer(task.id, secRef.current);
    };
    const onHide = () => { pauseTimer(task.id, secRef.current); };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    setRunning(document.visibilityState === 'visible');
    if (document.visibilityState === 'visible') resumeTimer(task.id, secRef.current);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      pauseTimer(task.id, secRef.current);
    };
  }, [task?.id, task?.status]);

  return { seconds, running };
}
