'use client';
import { supabase } from '@/lib/supabase';
import { dayIsComplete, badgesToUnlock, levelOf } from '@/lib/economy';
import { todayISO, addDaysISO, toMinutes, nowMinutes, fromMinutes } from '@/lib/dates';
import { compressToJpeg } from '@/lib/image';
import { PROOF_BUCKET, proofPath } from '@/lib/proofs';
import type { Profile, Redemption, Settings, Task } from '@/lib/types';

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

export async function reportBlocked(task: Task, note: string, childId: string) {
  await supabase.from('tasks').update({ blocked_note: note }).eq('id', task.id);
  // L'écran enfant ne connaît pas l'identifiant du parent : sans cette
  // recherche, le message n'était jamais écrit et n'apparaissait pas côté parent.
  const { data: parents } = await supabase.from('profiles').select('id').eq('role', 'parent');
  if (parents?.length) {
    await supabase.from('messages').insert(parents.map((p) => ({
      from_id: childId, to_id: p.id, task_id: task.id, kind: 'blocked',
      body: `${task.title} — ${note.trim() || 'je bloque sur cette tâche'}`, emoji: '🆘',
    })));
  }
  await notify('blocked', { taskId: task.id, note });
}

/* ------------------------------------------------------------ validation -- */

/** Démarrée dans les 5 minutes suivant l'heure prévue (créneau libre : toujours à l'heure). */
export function wasOnTime(task: Task): boolean {
  const planned = toMinutes(task.start_time);
  if (planned === null || !task.started_at) return true;
  return nowMinutes(new Date(task.started_at)) <= planned + 5;
}

/**
 * L'enfant a fini : la tâche part chez le parent avec sa photo. Les points
 * sont crédités à la validation. La garde d'état évite un double envoi
 * (double appui, ou le même compte ouvert sur deux appareils).
 */
export async function completeTask(task: Task, proofUrl: string): Promise<void> {
  const { data, error } = await supabase.from('tasks').update({
    status: 'submitted',
    completed_at: new Date().toISOString(),
    proof_url: proofUrl,
    timer_running: false,
    timer_segment_at: null,
  }).eq('id', task.id).not('status', 'in', '(done,submitted)').select('id');
  if (error) throw error;
  if (data?.length) await notify('task_submitted', { taskId: task.id });
}

/** Supprime une photo de preuve qui a servi. Un échec est rattrapé par le ménage quotidien. */
export async function removeProof(url: string | null | undefined) {
  const path = proofPath(url);
  if (path) await supabase.storage.from(PROOF_BUCKET).remove([path]).catch(() => {});
}

/* ---------------------------------------------------------------- solde -- */

/**
 * Ajoute (ou retire) des pièces et de l'XP sans écraser un mouvement fait
 * entre-temps depuis l'autre appareil. Le nouveau solde était calculé à partir
 * du profil gardé en mémoire : si l'enfant achetait pendant que le parent
 * validait, la dernière écriture effaçait la première. On écrit donc en
 * « compare-and-set » : la mise à jour n'aboutit que si le solde relu n'a pas
 * bougé, sinon on relit et on recommence.
 *
 * Renvoie le profil à jour, ou `null` si `requireFunds` et solde insuffisant.
 */
export async function creditChild(
  childId: string, coins: number, xp = 0,
  opts: { requireFunds?: boolean; set?: Partial<Profile> } = {}
): Promise<Profile | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: cur, error } = await supabase.from('profiles').select('*').eq('id', childId).single();
    if (error) throw error;
    const p = cur as Profile;
    if (opts.requireFunds && p.coins + coins < 0) return null;
    const { data: next, error: err } = await supabase.from('profiles')
      .update({ ...opts.set, coins: Math.max(0, p.coins + coins), xp: Math.max(0, p.xp + xp) })
      .eq('id', childId).eq('coins', p.coins).eq('xp', p.xp)
      .select().maybeSingle();
    if (err) throw err;
    if (next) return next as Profile;
  }
  throw new Error('Solde modifié en même temps, réessaie');
}

/** Crédite, met à jour série, journée parfaite, niveau et badges. */
export async function settleDay(
  task: Task, s: Settings, child: Profile,
  coins: number, xp: number, reason: string, refId: string
): Promise<{ badges: string[]; perfectDay: boolean; levelUp: number | null }> {
  let totalCoins = coins;
  const today = todayISO();

  // Profil relu : celui en mémoire peut dater d'avant un mouvement fait sur
  // l'autre appareil (série, XP, journée parfaite déjà comptée…).
  const { data: row } = await supabase.from('profiles').select('*').eq('id', child.id).maybeSingle();
  const fresh = (row as Profile | null) ?? child;

  await supabase.from('ledger').insert({ child_id: child.id, amount: coins, reason, kind: 'task', ref_id: refId });

  const { data: dayTasks } = await supabase.from('tasks').select('*').eq('child_id', child.id).eq('day', task.day);
  const complete = dayIsComplete((dayTasks ?? []) as Task[]);

  let streak = fresh.streak_current;
  let perfectDay = false;
  // Le jour compte au moment de la validation, même si elle arrive le
  // lendemain matin : toutes les tâches passent désormais par le parent, et
  // une journée finie le soir ne doit pas perdre sa série pour autant.
  // Un jour plus ancien que le dernier compté ne compte plus (pas de double).
  if (complete && task.day <= today && task.day > (fresh.last_streak_day ?? '')) {
    perfectDay = true;
    streak = fresh.last_streak_day === addDaysISO(task.day, -1) ? fresh.streak_current + 1 : 1;
    totalCoins += s.perfect_day_bonus;
    await supabase.from('ledger').insert({
      child_id: child.id, amount: s.perfect_day_bonus, reason: 'Journée parfaite 💎', kind: 'bonus',
    });
  }

  // Montée de niveau
  const before = levelOf(fresh.xp, s.xp_per_level).level;
  const after = levelOf(fresh.xp + xp, s.xp_per_level).level;
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

  await creditChild(child.id, totalCoins, xp, {
    set: {
      level_reached: after,
      streak_current: streak,
      streak_best: Math.max(fresh.streak_best, streak),
      ...(perfectDay ? { last_streak_day: task.day } : {}),
    },
  });

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

  // Seuls les badges réellement enregistrés rapportent. Sans cette
  // vérification, une écriture refusée (ou déjà faite depuis l'autre appareil)
  // recréditait le bonus et renvoyait la notification à chaque tâche.
  const { data: inserted } = await supabase.from('earned_badges')
    .upsert(unlocked.map((code) => ({ child_id: childId, code })), { onConflict: 'child_id,code', ignoreDuplicates: true })
    .select('code');
  const got = ((inserted ?? []) as { code: string }[]).map((b) => b.code);
  if (!got.length) return [];

  const bonus = (all ?? []).filter((b: any) => got.includes(b.code)).reduce((n: number, b: any) => n + b.coins_reward, 0);
  if (bonus > 0) {
    await creditChild(childId, bonus);
    await supabase.from('ledger').insert({ child_id: childId, amount: bonus, reason: 'Badge débloqué', kind: 'bonus' });
  }
  notify('badge', { codes: got });
  return got;
}

/* ------------------------------------------------------------- parent ---- */

/** Ajustement manuel du solde : le parent garde toujours la main. */
export async function adjustBalance(child: Profile, amount: number, reason: string) {
  await creditChild(child.id, amount);
  await supabase.from('ledger').insert({
    child_id: child.id, amount, kind: 'manual',
    reason: reason.trim() || (amount >= 0 ? 'Ajout du parent' : 'Retrait du parent'),
  });
}

/**
 * Accorde ou refuse une demande de récompense. La garde sur `pending` empêche
 * qu'une même demande, ouverte sur deux écrans, soit traitée deux fois et ses
 * points rendus en double. Renvoie faux si elle était déjà traitée.
 */
export async function resolveRedemption(r: Redemption, approve: boolean, parentId: string): Promise<boolean> {
  const { data } = await supabase.from('redemptions')
    .update({ status: approve ? 'approved' : 'refused', resolved_at: new Date().toISOString() })
    .eq('id', r.id).eq('status', 'pending').select('id');
  if (!data?.length) return false;

  if (!approve) {
    await creditChild(r.child_id, r.cost_paid);
    await supabase.from('ledger').insert({
      child_id: r.child_id, amount: r.cost_paid, reason: `Annulé : ${r.reward_name}`, kind: 'reward',
    });
  }
  await supabase.from('messages').insert({
    from_id: parentId, to_id: r.child_id, kind: 'system',
    body: approve ? `${r.reward_name} accordée !` : `${r.reward_name} refusée, points rendus.`,
    emoji: approve ? '🎁' : '↩️',
  });
  notify('kudos', { body: approve ? `${r.reward_name} accordée ! 🎁` : `${r.reward_name} refusée`, emoji: approve ? '🎁' : '↩️' });
  return true;
}

/**
 * Téléverse une photo de preuve dans le bucket public `proofs`.
 * Une photo d'iPhone pèse 3 à 5 Mo : réduite à 1600 px elle part en quelques
 * centaines de Ko, ce qui fiabilise l'envoi en 4G et l'affichage côté parent.
 */
export async function uploadProof(file: File, childId: string): Promise<string> {
  const jpeg = await compressToJpeg(file).catch(() => null);
  const ext = jpeg ? 'jpg' : file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${childId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(PROOF_BUCKET)
    .upload(path, jpeg ?? file, { upsert: true, contentType: jpeg ? 'image/jpeg' : file.type });
  if (error) throw error;
  return supabase.storage.from(PROOF_BUCKET).getPublicUrl(path).data.publicUrl;
}
