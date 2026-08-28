'use client';
import { supabase } from '@/lib/supabase';
import { computeAward, dayIsComplete, badgesToUnlock, levelOf } from '@/lib/economy';
import { todayISO, addDaysISO, toMinutes, nowMinutes, fromMinutes } from '@/lib/dates';
import type { Profile, Settings, Task } from '@/lib/types';

/** Envoie une notification à l'autre membre de la famille. Ne bloque jamais l'action. */
export async function notify(kind: string, payload: Record<string, unknown> = {}) {
  try {
    const { data } = await supabase.auth.getSession();
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify({ kind, ...payload }),
    });
  } catch { /* une notification perdue ne doit pas casser l'action */ }
}

/* ------------------------------------------------------------- minuteur -- */

/** Secondes réellement travaillées : le segment en cours ne compte que s'il tourne. */
export function elapsedOf(task: Task): number {
  const base = task.active_seconds ?? 0;
  if (!task.timer_running || !task.timer_segment_at) return base;
  return base + Math.max(0, Math.floor((Date.now() - new Date(task.timer_segment_at).getTime()) / 1000));
}

export async function startTask(task: Task) {
  await supabase.from('tasks').update({
    status: 'doing',
    started_at: task.started_at ?? new Date().toISOString(),
    timer_running: true,
    timer_segment_at: new Date().toISOString(),
  }).eq('id', task.id);
}

/** Met le chrono en pause et fige le total. Appelé dès que l'enfant quitte la page. */
export async function pauseTimer(taskId: string, seconds: number) {
  await supabase.from('tasks').update({
    timer_running: false, timer_segment_at: null, active_seconds: Math.round(seconds),
  }).eq('id', taskId);
}

export async function resumeTimer(taskId: string, seconds: number) {
  await supabase.from('tasks').update({
    timer_running: true, timer_segment_at: new Date().toISOString(), active_seconds: Math.round(seconds),
  }).eq('id', taskId);
}

export async function toggleSubtask(id: string, done: boolean) {
  await supabase.from('subtasks').update({ done }).eq('id', id);
}

export async function postponeTask(task: Task, s: Settings) {
  const cur = toMinutes(task.start_time) ?? nowMinutes();
  await supabase.from('tasks').update({
    start_time: fromMinutes(cur + s.postpone_minutes),
    postpone_count: task.postpone_count + 1,
    reminders_sent: [], parent_alerted: false,
  }).eq('id', task.id);
}

/** L'enfant place elle-même une tâche libre dans sa journée. */
export async function scheduleTask(taskId: string, time: string) {
  await supabase.from('tasks').update({
    start_time: time, reminders_sent: [], parent_alerted: false,
  }).eq('id', taskId);
}

export async function reportBlocked(task: Task, note: string, childId: string, parentId: string | null) {
  await supabase.from('tasks').update({ blocked_note: note }).eq('id', task.id);
  if (parentId) {
    await supabase.from('messages').insert({
      from_id: childId, to_id: parentId, task_id: task.id, kind: 'blocked',
      body: note || 'Je bloque sur cette tâche', emoji: '🆘',
    });
  }
  await notify('blocked', { taskId: task.id, note });
}

/* ------------------------------------------------------------ validation -- */

export interface AwardResult {
  coins: number; xp: number;
  bonuses: { label: string; pct: number }[];
  badges: string[]; perfectDay: boolean;
  levelUp: number | null;
}

export async function completeTask(
  task: Task, s: Settings, child: Profile,
  opts: { proofUrl?: string | null; note?: string | null; needsValidation: boolean }
): Promise<AwardResult | null> {
  const now = new Date();
  const base = {
    completed_at: now.toISOString(),
    proof_url: opts.proofUrl ?? null,
    child_note: opts.note ?? null,
    timer_running: false,
    timer_segment_at: null,
  };

  if (opts.needsValidation) {
    await supabase.from('tasks').update({ ...base, status: 'submitted' }).eq('id', task.id);
    await notify('task_submitted', { taskId: task.id });
    return null;
  }

  const onTime = (() => {
    const planned = toMinutes(task.start_time);
    if (planned === null || !task.started_at) return true;
    return nowMinutes(new Date(task.started_at)) <= planned + 5;
  })();

  const award = computeAward(s, task, { onTime, streak: child.streak_current });
  await supabase.from('tasks').update({
    ...base, status: 'done', validated_at: now.toISOString(),
    coins_awarded: award.coins, xp_awarded: award.xp,
  }).eq('id', task.id);

  const extra = await settleDay(task, s, child, award.coins, award.xp, `Tâche : ${task.title}`, task.id);
  return { ...award, ...extra };
}

/** Crédite, met à jour série, journée parfaite, niveau et badges. */
export async function settleDay(
  task: Task, s: Settings, child: Profile,
  coins: number, xp: number, reason: string, refId: string
): Promise<{ badges: string[]; perfectDay: boolean; levelUp: number | null }> {
  let totalCoins = coins;
  const today = todayISO();

  await supabase.from('ledger').insert({ child_id: child.id, amount: coins, reason, kind: 'task', ref_id: refId });

  const { data: dayTasks } = await supabase.from('tasks').select('*').eq('child_id', child.id).eq('day', task.day);
  const complete = dayIsComplete((dayTasks ?? []) as Task[]);

  let streak = child.streak_current;
  let perfectDay = false;
  if (complete && task.day === today && child.last_streak_day !== today) {
    perfectDay = true;
    streak = child.last_streak_day === addDaysISO(today, -1) ? child.streak_current + 1 : 1;
    totalCoins += s.perfect_day_bonus;
    await supabase.from('ledger').insert({
      child_id: child.id, amount: s.perfect_day_bonus, reason: 'Journée parfaite 💎', kind: 'bonus',
    });
  }

  // Montée de niveau
  const newXp = child.xp + xp;
  const before = levelOf(child.xp, s.xp_per_level).level;
  const after = levelOf(newXp, s.xp_per_level).level;
  let levelUp: number | null = null;
  if (after > before) {
    levelUp = after;
    const bonus = (s.level_up_coins ?? 0) * (after - before);
    if (bonus > 0) {
      totalCoins += bonus;
      await supabase.from('ledger').insert({
        child_id: child.id, amount: bonus, reason: `Niveau ${after} atteint 🎉`, kind: 'bonus',
      });
    }
    notify('level_up', { level: after });
  }

  await supabase.from('profiles').update({
    coins: child.coins + totalCoins,
    xp: newXp,
    level_reached: after,
    streak_current: streak,
    streak_best: Math.max(child.streak_best, streak),
    ...(perfectDay ? { last_streak_day: today } : {}),
  }).eq('id', child.id);

  const badges = await checkBadges(child.id, streak, after);
  return { badges, perfectDay, levelUp };
}

/** Débloque les badges atteints et crédite leur bonus. */
export async function checkBadges(childId: string, streak: number, level = 1): Promise<string[]> {
  const [{ data: all }, { data: owned }, { count: tasksTotal }, { data: perfect }, { data: attempts }, { count: contractsDone }] =
    await Promise.all([
      supabase.from('badges').select('*'),
      supabase.from('earned_badges').select('code').eq('child_id', childId),
      supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('child_id', childId).eq('status', 'done'),
      supabase.from('ledger').select('id').eq('child_id', childId).eq('kind', 'bonus'),
      supabase.from('quiz_attempts').select('score,total').eq('child_id', childId),
      supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('child_id', childId).eq('status', 'achieved'),
    ]);

  const ownedSet = new Set((owned ?? []).map((b: any) => b.code));
  const bestQuiz = Math.max(0, ...(attempts ?? []).map((a: any) => (a.total ? Math.round((a.score / a.total) * 100) : 0)));

  const unlocked = badgesToUnlock(all ?? [], ownedSet, {
    streak, level,
    tasksTotal: tasksTotal ?? 0,
    perfectDays: (perfect ?? []).length,
    bestQuiz,
    earlyStarts: 0,
    contractsDone: contractsDone ?? 0,
  });
  if (!unlocked.length) return [];

  await supabase.from('earned_badges').insert(unlocked.map((code) => ({ child_id: childId, code })));
  const bonus = (all ?? []).filter((b: any) => unlocked.includes(b.code)).reduce((n: number, b: any) => n + b.coins_reward, 0);
  if (bonus > 0) {
    const { data: p } = await supabase.from('profiles').select('coins').eq('id', childId).maybeSingle();
    await supabase.from('profiles').update({ coins: (p?.coins ?? 0) + bonus }).eq('id', childId);
    await supabase.from('ledger').insert({ child_id: childId, amount: bonus, reason: 'Badge débloqué', kind: 'bonus' });
  }
  notify('badge', { codes: unlocked });
  return unlocked;
}

/* ------------------------------------------------------------- parent ---- */

/** Ajustement manuel du solde : le parent garde toujours la main. */
export async function adjustBalance(child: Profile, amount: number, reason: string) {
  const next = Math.max(0, child.coins + amount);
  await supabase.from('profiles').update({ coins: next }).eq('id', child.id);
  await supabase.from('ledger').insert({
    child_id: child.id, amount, kind: 'manual',
    reason: reason.trim() || (amount >= 0 ? 'Ajout du parent' : 'Retrait du parent'),
  });
}

/** Téléverse une photo de preuve dans le bucket public `proofs`. */
export async function uploadProof(file: File, childId: string): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${childId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('proofs').upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from('proofs').getPublicUrl(path).data.publicUrl;
}
