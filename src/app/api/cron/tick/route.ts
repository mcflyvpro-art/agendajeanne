import { NextResponse } from 'next/server';
import { admin } from '@/lib/admin';
import { sendPush } from '@/lib/push';
import { notifCopy, parentCopy } from '@/lib/tone';
import { todayISO, addDaysISO, nowMinutes, toMinutes, hhmm, dowOf } from '@/lib/dates';
import type { Profile, Settings, Task, Routine } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MIDWAY = 9999;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const url = new URL(req.url);
  const header = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return header === secret || url.searchParams.get('key') === secret;
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }

async function run(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const db = admin();
  const log: string[] = [];
  const today = todayISO();
  const now = nowMinutes();

  const [{ data: settings }, { data: profiles }] = await Promise.all([
    db.from('settings').select('*').eq('id', 1).maybeSingle(),
    db.from('profiles').select('*'),
  ]);
  const s = settings as Settings | null;
  if (!s) return NextResponse.json({ error: 'settings introuvables' }, { status: 500 });

  const all = (profiles ?? []) as Profile[];
  const child = all.find((p) => p.id === s.child_id) ?? all.find((p) => p.role === 'child');
  const parents = all.filter((p) => p.role === 'parent');
  if (!child) return NextResponse.json({ error: 'aucun profil enfant' }, { status: 500 });

  /** Envoie et nettoie l'abonnement s'il est mort. */
  const push = async (p: Profile, c: { title: string; body: string }, kind: string, url = '/') => {
    const r = await sendPush(p.push_subscription, { ...c, kind, url, tag: kind });
    if (r.gone) await db.from('profiles').update({ push_enabled: false, push_subscription: null }).eq('id', p.id);
    if (r.ok) log.push(`${kind}→${p.display_name}`);
    return r.ok;
  };
  const pushParents = (c: { title: string; body: string }, kind: string, url = '/parent') =>
    Promise.all(parents.map((p) => push(p, c, kind, url)));

  /** Verrou « une fois par jour » basé sur engine_log. */
  const once = async (key: string): Promise<boolean> => {
    const { data } = await db.from('engine_log').select('id').eq('kind', key).limit(1);
    if (data?.length) return false;
    await db.from('engine_log').insert({ kind: key });
    return true;
  };

  // ---------------------------------------------------------------- 1. routines
  if (await once(`routines-${today}`)) {
    const created = await generateRoutines(db, child.id, 14);
    log.push(`routines:${created}`);
  }

  // -------------------------------------------------- 2. tâches passées manquées
  const { data: stale } = await db.from('tasks').select('id')
    .eq('child_id', child.id).lt('day', today).in('status', ['todo', 'doing']);
  if (stale?.length) {
    await db.from('tasks').update({ status: 'missed' }).in('id', stale.map((t: any) => t.id));
    log.push(`missed:${stale.length}`);
  }

  // ------------------------------------------------------- 3. tâches du jour
  const { data: rows } = await db.from('tasks').select('*').eq('child_id', child.id).eq('day', today);
  const tasks = (rows ?? []) as Task[];
  const seed = Number(today.replace(/-/g, '')) % 97;

  for (const t of tasks) {
    const start = toMinutes(t.start_time);
    if (start === null) continue;

    // Chaîne de rappels vers l'enfant
    if (t.status === 'todo' || t.status === 'doing') {
      for (const off of s.reminder_offsets) {
        if (t.reminders_sent.includes(off)) continue;
        if (now < start + off) continue;
        if (now > start + off + 4) {           // trop tard, on ne spamme pas a posteriori
          await db.from('tasks').update({ reminders_sent: [...t.reminders_sent, off] }).eq('id', t.id);
          continue;
        }
        if (off > 0 && t.status !== 'todo') continue;   // déjà démarrée : pas de relance

        const kind = off < 0 ? 'before' : off === 0 ? 'start' : 'nudge';
        const copy = notifCopy(kind, s.notif_tone, {
          task: t.title, minutes: off < 0 ? -off : off, time: hhmm(t.start_time),
        }, seed + Math.abs(off));
        if (child.push_enabled) await push(child, copy, kind, '/now');
        await db.from('tasks').update({ reminders_sent: [...t.reminders_sent, off] }).eq('id', t.id);
        t.reminders_sent.push(off);
      }
    }

    // Encouragement à mi-parcours
    if (t.status === 'doing' && t.started_at && !t.reminders_sent.includes(MIDWAY)) {
      const elapsed = (Date.now() - new Date(t.started_at).getTime()) / 60000;
      if (elapsed >= t.duration_min / 2) {
        const copy = notifCopy('midway', s.notif_tone, { task: t.title, minutes: Math.max(1, Math.round(t.duration_min - elapsed)) }, seed);
        if (child.push_enabled) await push(child, copy, 'midway', '/now');
        await db.from('tasks').update({ reminders_sent: [...t.reminders_sent, MIDWAY] }).eq('id', t.id);
      }
    }

    // Escalade vers le parent
    if (t.status === 'todo' && !t.parent_alerted && now >= start + s.parent_alert_after) {
      await pushParents(parentCopy.notStarted(child.display_name, t.title, now - start), 'alert');
      await db.from('tasks').update({ parent_alerted: true }).eq('id', t.id);
      await db.from('messages').insert({
        to_id: parents[0]?.id, task_id: t.id, kind: 'alert', emoji: '🔴',
        body: `${child.display_name} n'a pas commencé « ${t.title} » (${now - start} min de retard).`,
      });
    }
  }

  // --------------------------------------------------- 4. rendez-vous quotidiens
  const at = (t: string) => toMinutes(String(t).slice(0, 5))!;
  const inWindow = (m: number) => now >= m && now < m + 5;

  // Réveil / début de journée
  if (inWindow(at(s.morning_checkin_time)) && await once(`morning-${today}`)) {
    const todo = tasks.filter((t) => t.status === 'todo');
    if (todo.length && child.push_enabled) {
      const first = todo.slice().sort((a, b) => (toMinutes(a.start_time) ?? 1e9) - (toMinutes(b.start_time) ?? 1e9))[0];
      await push(child, notifCopy('morning', s.notif_tone, {
        count: todo.length, first: first.title, time: hhmm(first.start_time) || 'quand tu veux',
      }, seed), 'morning', '/now');
    }
  }

  // Aperçu de demain
  if (inWindow(at(s.tomorrow_preview_time)) && await once(`preview-${today}`)) {
    const tomorrow = addDaysISO(today, 1);
    const { data: tw } = await db.from('tasks').select('title,start_time')
      .eq('child_id', child.id).eq('day', tomorrow).eq('status', 'todo').order('start_time');
    if (tw?.length && child.push_enabled) {
      await push(child, notifCopy('preview', s.notif_tone, {
        count: tw.length, first: tw[0].title, time: hhmm(tw[0].start_time) || 'libre',
      }, seed), 'preview', '/day');
    }
  }

  // Bilan du soir
  if (inWindow(at(s.evening_recap_time)) && await once(`recap-${today}`)) {
    const done = tasks.filter((t) => t.status === 'done');
    const coins = done.reduce((n, t) => n + (t.coins_awarded ?? 0), 0);
    if (child.push_enabled) {
      await push(child, notifCopy('recap', s.notif_tone, {
        count: done.length, coins, currency: s.currency_emoji, streak: child.streak_current,
      }, seed), 'recap', '/me');
    }
    await pushParents({
      title: `📊 Bilan de ${child.display_name}`,
      body: `${done.length}/${tasks.filter((t) => t.status !== 'skipped').length} tâches · ${coins} ${s.currency_emoji} · série ${child.streak_current} j`,
    }, 'recap');
  }

  // Alerte si l'enfant a coupé ses notifications
  if (!child.push_enabled && await once(`pushoff-${today}`)) {
    await pushParents(parentCopy.pushOff(child.display_name), 'alert');
  }

  return NextResponse.json({ ok: true, at: `${today} ${hhmm(String(Math.floor(now / 60)).padStart(2, '0') + ':' + String(now % 60).padStart(2, '0'))}`, log });
}

/** Crée les tâches manquantes à partir des routines, sur `days` jours. */
export async function generateRoutines(db: ReturnType<typeof admin>, childId: string, days: number): Promise<number> {
  const { data: rs } = await db.from('routines').select('*').eq('active', true);
  const routines = (rs ?? []) as Routine[];
  if (!routines.length) return 0;

  const from = todayISO();
  const to = addDaysISO(from, days - 1);
  const { data: existing } = await db.from('tasks').select('routine_id,day')
    .eq('child_id', childId).gte('day', from).lte('day', to).not('routine_id', 'is', null);
  const has = new Set((existing ?? []).map((t: any) => `${t.routine_id}|${t.day}`));

  const { data: settings } = await db.from('settings').select('*').eq('id', 1).maybeSingle();
  const s = settings as Settings;

  const toInsert: any[] = [];
  const subsFor: { key: string; labels: string[] }[] = [];

  for (let i = 0; i < days; i++) {
    const day = addDaysISO(from, i);
    const dow = dowOf(day);
    for (const r of routines) {
      if (!r.days_of_week.includes(dow)) continue;
      if (r.valid_from && day < r.valid_from) continue;
      if (r.valid_to && day > r.valid_to) continue;
      if (has.has(`${r.id}|${day}`)) continue;

      const mult = s.difficulty_mult?.[String(r.difficulty)] ?? 1;
      const coins = r.coins ?? Math.max(1, Math.round((s.base_coins + (s.coins_per_10min * r.duration_min) / 10) * mult));
      toInsert.push({
        child_id: childId, routine_id: r.id, subject_id: r.subject_id, title: r.title,
        description: r.description, day, start_time: r.is_flexible ? null : r.start_time,
        duration_min: r.duration_min, is_flexible: r.is_flexible, difficulty: r.difficulty, coins,
        require_photo: r.require_photo, require_validation: r.require_validation,
        min_timer_pct: r.min_timer_pct, link_url: r.link_url,
      });
      if (Array.isArray(r.subtasks) && r.subtasks.length) {
        subsFor.push({ key: `${r.id}|${day}`, labels: r.subtasks.map(String) });
      }
    }
  }
  if (!toInsert.length) return 0;

  const { data: created } = await db.from('tasks').insert(toInsert).select('id,routine_id,day');
  const map = new Map((created ?? []).map((t: any) => [`${t.routine_id}|${t.day}`, t.id]));
  const subRows = subsFor.flatMap(({ key, labels }) => {
    const id = map.get(key);
    return id ? labels.map((label, i) => ({ task_id: id, label, position: i })) : [];
  });
  if (subRows.length) await db.from('subtasks').insert(subRows);

  return toInsert.length;
}
