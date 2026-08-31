'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { pauseTimer, resumeTimer, elapsedOf, pausesWhenHidden, ownsTimer } from '@/lib/actions';
import type { Task } from '@/lib/types';

export interface TimerState {
  seconds: number;
  running: boolean;
  /** Vrai si sortir de l'app met le chrono en pause (téléphone, tâche normale). */
  pausesOnHide: boolean;
  /** Mise en pause volontaire, disponible quand la pause automatique ne s'applique pas. */
  paused: boolean;
  toggle: () => void;
}

/**
 * Chronomètre de la tâche en cours.
 *
 * Le temps se calcule sur des horodatages, jamais sur un compteur de ticks :
 * un navigateur en arrière-plan ralentit ses minuteurs, et l'app peut être
 * fermée puis rouverte — le total reste juste dans tous les cas.
 *
 * Quand le chrono s'arrête, c'est une décision, pas un effet de bord :
 *  · téléphone + tâche normale → sortir de l'app met en pause ;
 *  · ordinateur → le chrono continue, changer de fenêtre fait partie du travail ;
 *  · tâche « travail sur téléphone » → le chrono continue, le devoir se fait
 *    hors de l'app ;
 *  · dans ces deux derniers cas, un bouton Pause explicite reste disponible.
 */
export function useTaskTimer(task: Task | null): TimerState {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);

  const secRef = useRef(0);        // secondes affichées
  const baseRef = useRef(0);       // ancre : total au dernier changement d'état
  const anchorRef = useRef<number | null>(null); // horodatage du départ du segment
  const savedRef = useRef(0);      // dernier total écrit en base

  const pausesOnHide = task ? pausesWhenHidden(task) : true;
  const doing = task?.status === 'doing';

  /* Reprise depuis la ligne en base : changement de tâche, ou état modifié
     depuis un autre appareil. On ne recule jamais, pour qu'un écho tardif
     n'efface pas des secondes déjà comptées ici. */
  const stamp = task ? `${task.id}|${task.timer_running}|${task.timer_segment_at}|${task.active_seconds}` : '';
  useEffect(() => {
    if (!task) return;
    const wasRunning = anchorRef.current !== null;
    const next = Math.max(elapsedOf(task), secRef.current);
    secRef.current = next;
    baseRef.current = next;
    savedRef.current = next;
    // Une ré-ancre, pas un arrêt : le chrono en cours ne doit pas se figer
    // parce que la ligne est revenue du serveur.
    anchorRef.current = wasRunning ? Date.now() : null;
    setSeconds(next);
  }, [stamp]);

  /* Reset complet au changement de tâche. */
  useEffect(() => {
    if (!task) return;
    const start = elapsedOf(task);
    secRef.current = start; baseRef.current = start; savedRef.current = start;
    anchorRef.current = null;
    setSeconds(start);
    setPaused(false);
  }, [task?.id]);

  // Référence vivante : le moteur ci-dessous ne doit pas se relancer à chaque
  // aller-retour de la ligne en base.
  const taskRef = useRef<Task | null>(task);
  taskRef.current = task;

  const write = useCallback((run: boolean, sec: number) => {
    const t = taskRef.current;
    if (!t) return;
    // Un appareil ne pilote que le minuteur qu'il a lancé : le téléphone resté
    // ouvert en poche ne doit pas mettre en pause le travail commencé sur le PC.
    if (t.timer_running && !ownsTimer(t)) return;
    savedRef.current = sec;
    if (run) resumeTimer(t.id, sec);
    else pauseTimer(t.id, sec);
  }, []);

  /* Moteur : décide si le chrono tourne, et tient l'ancre à jour. */
  useEffect(() => {
    if (!task || !doing) { setRunning(false); return; }

    const shouldRun = () => {
      if (paused) return false;
      if (!pausesOnHide) return true;
      return document.visibilityState === 'visible';
    };

    const settle = (persist: boolean) => {
      const run = shouldRun();
      const now = Date.now();
      if (anchorRef.current !== null) {
        secRef.current = baseRef.current + Math.floor((now - anchorRef.current) / 1000);
      }
      if (run && anchorRef.current === null) {
        baseRef.current = secRef.current;
        anchorRef.current = now;
      } else if (!run && anchorRef.current !== null) {
        anchorRef.current = null;
        baseRef.current = secRef.current;
      }
      setRunning(run);
      setSeconds(secRef.current);
      if (persist) write(run, secRef.current);
    };

    settle(true);

    const tick = setInterval(() => {
      if (anchorRef.current === null) return;
      secRef.current = baseRef.current + Math.floor((Date.now() - anchorRef.current) / 1000);
      setSeconds(secRef.current);
      // Écriture régulière : le parent voit le compteur avancer en direct, et
      // rien n'est perdu si l'appareil s'éteint brutalement.
      if (secRef.current - savedRef.current >= 20) write(true, secRef.current);
    }, 1000);

    const onVisibility = () => settle(true);
    const onHide = () => {
      if (anchorRef.current !== null) {
        secRef.current = baseRef.current + Math.floor((Date.now() - anchorRef.current) / 1000);
      }
      if (pausesOnHide) write(false, secRef.current);
      else write(true, secRef.current);
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);

    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      if (anchorRef.current !== null) {
        secRef.current = baseRef.current + Math.floor((Date.now() - anchorRef.current) / 1000);
        anchorRef.current = null;
      }
      // Quitter l'écran ne fige le chrono que si la pause automatique s'applique.
      if (pausesOnHide) write(false, secRef.current);
    };
  }, [task?.id, doing, pausesOnHide, paused, write]);

  const toggle = useCallback(() => setPaused((p) => !p), []);

  return { seconds, running, pausesOnHide, paused, toggle };
}
