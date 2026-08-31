'use client';
import { supabase } from '@/lib/supabase';
import { serverNow } from '@/lib/clock';
import { deviceId, deviceKind, isDesktopDevice } from '@/lib/device';
import { announceLocalChange } from '@/lib/sync';
import type { Task } from '@/lib/types';

/**
 * Le chronomètre, côté client.
 *
 * Une seule règle : **le temps s'accumule tant qu'au moins un appareil est
 * présent**. Ce fichier ne fait que refléter fidèlement ce que décident les
 * fonctions SQL de `supabase/v8.sql` — même calcul, mêmes constantes — pour
 * que l'affichage n'ait jamais une seconde d'avance sur la vérité en base.
 */

/** Un segment sans battement depuis ce délai est considéré abandonné. */
export const STALE_MS = 150_000;
/** Crédit accordé après le dernier battement : jusqu'au battement suivant. */
export const GRACE_MS = 60_000;
/** Rythme des battements quand la fenêtre est au premier plan. */
export const HEARTBEAT_MS = 15_000;
/** Rattrapage maximal après une coupure réseau ou un onglet gelé. */
export const BACKFILL_CAP_S = 600;

/** Plafond d'un segment : une tâche oubliée ne compte pas la nuit entière. */
export function runawayCapSeconds(task: Task): number {
  return Math.max(3 * 3600, (task.duration_min ?? 45) * 120);
}

/**
 * Ce que « présent » veut dire, appareil par appareil.
 *  · ordinateur → l'app est ouverte, même en arrière-plan, même minimisée ;
 *  · téléphone  → l'app est affichée à l'écran ;
 *  · tâche « travail sur téléphone » → toujours : le devoir se fait hors de
 *    l'app, exiger qu'elle reste affichée bloquerait l'enfant.
 */
export function worksInBackground(task: Task): boolean {
  return !!task.work_on_phone || isDesktopDevice();
}

export function isPresent(task: Task): boolean {
  if (typeof document === 'undefined') return false;
  return worksInBackground(task) || document.visibilityState === 'visible';
}

/** Lecture d'un horodatage : `null` plutôt qu'un `NaN` qui contaminerait tout. */
function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const v = new Date(iso).getTime();
  return Number.isFinite(v) ? v : null;
}

/** Le segment ouvert compte-t-il encore ? (miroir de `timer_is_live` en SQL) */
export function isTimerLive(task: Task, at: number = serverNow()): boolean {
  if (!task.timer_running) return false;
  if (task.work_on_phone) return true;
  const beat = ms(task.timer_heartbeat_at) ?? ms(task.timer_segment_at);
  if (beat === null || !Number.isFinite(at)) return false;
  return beat > at - STALE_MS;
}

/** Secondes du segment ouvert (miroir de `timer_segment_seconds` en SQL). */
export function segmentSeconds(task: Task, at: number = serverNow()): number {
  if (!task.timer_running) return 0;
  const start = ms(task.timer_segment_at);
  if (start === null || !Number.isFinite(at)) return 0;
  const beat = ms(task.timer_heartbeat_at) ?? start;
  const end = task.work_on_phone ? at : Math.min(at, beat + GRACE_MS);
  return Math.max(0, Math.min(Math.floor((end - start) / 1000), runawayCapSeconds(task)));
}

/** Temps de travail total d'une tâche, tel que le voient tous les appareils. */
export function elapsedOf(task: Task, at: number = serverNow()): number {
  const base = Number.isFinite(task.active_seconds) ? task.active_seconds : 0;
  return base + segmentSeconds(task, at);
}

/* ------------------------------------------------------------ commandes -- */

async function call(fn: string, args: Record<string, unknown>): Promise<Task | null> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return null;
  announceLocalChange(['tasks']);
  return (data as Task) ?? null;
}

export const timerStart = (taskId: string) =>
  call('timer_start', { p_task: taskId, p_device: deviceId(), p_kind: deviceKind() });

export const timerTouch = (taskId: string, backfillSeconds = 0) =>
  call('timer_touch', {
    p_task: taskId, p_device: deviceId(), p_kind: deviceKind(),
    p_backfill: Math.max(0, Math.min(BACKFILL_CAP_S, Math.round(backfillSeconds))),
  });

export const timerRelease = (taskId: string) =>
  call('timer_release', { p_task: taskId, p_device: deviceId() });

export const timerPause = (taskId: string) => call('timer_pause', { p_task: taskId });

export const timerResume = (taskId: string) =>
  call('timer_resume', { p_task: taskId, p_device: deviceId(), p_kind: deviceKind() });

export const timerFinalize = (taskId: string) => call('timer_finalize', { p_task: taskId });

/**
 * Départ de l'appareil au moment où la page se ferme.
 *
 * Une requête ordinaire est annulée avec la page : elle n'arriverait pas.
 * `keepalive` la laisse partir malgré la fermeture, et `sendBeacon` sert de
 * dernier recours. Si les deux échouent (plantage, coupure de courant), le
 * battement de cœur reprend la main : le segment sera refermé au dernier
 * signe de vie, jamais plus tard.
 */
export function releaseOnUnload(taskId: string, token: string | null) {
  const body = JSON.stringify({ taskId, device: deviceId(), token });
  try {
    const ok = fetch('/api/timer/release', {
      method: 'POST', body, keepalive: true,
      headers: { 'Content-Type': 'application/json' },
    });
    void ok?.catch(() => {});
    return;
  } catch { /* on tente la balise */ }
  try {
    navigator.sendBeacon?.('/api/timer/release', new Blob([body], { type: 'application/json' }));
  } catch { /* le battement de cœur fera le ménage */ }
}
