'use client';
import { supabase } from '@/lib/supabase';
import { computeAward, dayIsComplete, badgesToUnlock, levelOf } from '@/lib/economy';
import { todayISO, addDaysISO, toMinutes, nowMinutes, fromMinutes } from '@/lib/dates';
import { timerStart, timerFinalize } from '@/lib/timer';
import { announceLocalChange } from '@/lib/sync';
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
/**
 * Le chronomètre vit dans `lib/timer.ts` et dans les fonctions SQL de `v8.sql`.
 * On le réexporte ici : les écrans continuent d'appeler `A.startTask(...)` et
 * `A.elapsedOf(...)` comme avant.
 */
export {
  elapsedOf, segmentSeconds, isTimerLive, isPresent, worksInBackground,
  runawayCapSeconds, timerPause, timerResume, timerRelease, timerTouch, timerFinalize,
} from '@/lib/timer';

export async function startTask(task: Task) {
  await timerStart(task.id);
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
  // Le segment ouvert est refermé par le serveur : c'est lui qui sait combien
  // de secondes créditer, et son horloge fait foi.
  const finalized = await timerFinalize(task.id);
  if (finalized) task = { ...task, ...finalized };

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

  if (levelUp) await grantLevelItems(child.id, after);
  const badges = await checkBadges(child.id, streak, after);
  return { badges, perfectDay, levelUp };
}

/**
 * Attribue les avatars associés aux paliers atteints.
 * Un avatar dont `unlock_level` est renseigné ne s'achète pas : il s'obtient
 * en montant de niveau, et disparaît donc de la boutique.
 */
export async function grantLevelItems(childId: string, level: number): Promise<string[]> {
  const [{ data: unlockable }, { data: owned }] = await Promise.all([
    supabase.from('rewards').select('id,item_type,item_value,unlock_level')
      .eq('kind', 'item').not('unlock_level', 'is', null).lte('unlock_level', level),
    supabase.from('child_items').select('item_type,item_value').eq('child_id', childId),
  ]);
  const have = new Set((owned ?? []).map((o: any) => `${o.item_type}|${o.item_value}`));
  const rows = (unlockable ?? []).filter((r: any) => !have.has(`${r.item_type}|${r.item_value}`));
  if (!rows.length) return [];

  await supabase.from('child_items').insert(rows.map((r: any) => ({
    child_id: childId, reward_id: r.id, item_type: r.item_type, item_value: r.item_value,
  })));
  return rows.map((r: any) => r.item_value as string);
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
