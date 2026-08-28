import { NextResponse } from 'next/server';
import { admin } from '@/lib/admin';
import { sendPush } from '@/lib/push';
import { whoami } from '@/lib/auth-api';
import type { Profile, Settings } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface Copy { title: string; body: string; url: string; }

/** Ce que le parent reçoit quand l'enfant agit. */
function fromChild(kind: string, name: string, b: any): { copy: Copy; pref: string } | null {
  switch (kind) {
    case 'task_submitted':
      return { pref: 'task_submitted', copy: { title: `👁️ ${name} a terminé`, body: `${b.taskTitle ?? 'Une tâche'} attend ta validation`, url: '/parent' } };
    case 'blocked':
      return { pref: 'blocked', copy: { title: `🆘 ${name} bloque`, body: String(b.note || 'Sans précision'), url: '/parent' } };
    case 'purchase':
      return { pref: 'purchase', copy: { title: `🎁 ${name} veut une récompense`, body: `${b.reward} · ${b.cost} points`, url: '/parent/rewards' } };
    case 'quiz_done':
      return { pref: 'quiz_done', copy: { title: `🧠 ${name} a fait un quiz`, body: `${b.title} · ${b.score}/${b.total}`, url: '/parent/stats' } };
    case 'badge':
      return { pref: 'badge', copy: { title: `🏆 Nouveau badge`, body: `${name} vient d'en débloquer un`, url: '/parent' } };
    case 'level_up':
      return { pref: 'level_up', copy: { title: `⭐ Niveau ${b.level} !`, body: `${name} vient de monter de niveau`, url: '/parent' } };
    case 'mood':
      return { pref: 'mood', copy: { title: `💭 Humeur du jour`, body: `${name} se sent : ${b.emoji ?? ''}`.trim(), url: '/parent' } };
    case 'message_reaction':
      return { pref: 'message_reaction', copy: { title: `${b.emoji ?? ''} Réaction de ${name}`.trim(), body: String(b.body ?? '').slice(0, 80), url: '/parent' } };
    default: return null;
  }
}

/** Ce que l'enfant reçoit quand le parent agit. */
function fromParent(kind: string, b: any): { copy: Copy; pref: string } | null {
  switch (kind) {
    case 'kudos':
      return { pref: 'kudos', copy: { title: `${b.emoji ?? '💜'} Message`, body: String(b.body ?? ''), url: '/me' } };
    case 'message':
      return { pref: 'message', copy: { title: '✉️ Nouveau message', body: String(b.body ?? ''), url: '/me' } };
    case 'quiz_assigned':
      return { pref: 'quiz_assigned', copy: { title: '🧠 Nouveau quiz', body: `Tes parents t'ont préparé « ${b.title} »`, url: '/quiz' } };
    case 'task_created':
      return { pref: 'task_created', copy: { title: '📝 Nouvelle tâche', body: `${b.title}${b.time ? ` · ${String(b.time).slice(0, 5)}` : ''}`, url: '/day' } };
    case 'reward_created':
      return { pref: 'reward_created', copy: { title: '🎁 Nouvelle récompense', body: `${b.emoji ?? ''} ${b.name} · ${b.cost} points`.trim(), url: '/shop' } };
    case 'contract_created':
      return { pref: 'contract_created', copy: { title: '🤝 Contrat de la semaine', body: `${b.title} → ${b.reward}`, url: '/me' } };
    case 'level_up':
      return { pref: 'level_up', copy: { title: `⭐ Niveau ${b.level} !`, body: 'Tu viens de monter de niveau', url: '/me' } };
    case 'validation':
      return b.ok
        ? { pref: 'validation', copy: { title: '✅ Validé !', body: `${b.title} · +${b.coins} points`, url: '/now' } }
        : { pref: 'validation', copy: { title: '↩️ À refaire', body: String(b.title ?? ''), url: '/now' } };
    default: return null;
  }
}

export async function POST(req: Request) {
  const me = await whoami(req);
  if (!me) return NextResponse.json({ error: 'non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const db = admin();
  const [{ data: profiles }, { data: st }] = await Promise.all([
    db.from('profiles').select('*'),
    db.from('settings').select('*').eq('id', 1).maybeSingle(),
  ]);
  const settings = st as Settings | null;
  const all = (profiles ?? []) as Profile[];
  const parents = all.filter((p) => p.role === 'parent');
  const child = all.find((p) => p.role === 'child');

  const deliver = async (targets: Profile[], c: Copy, kind: string) => {
    const res = await Promise.all(targets.map(async (p) => {
      const r = await sendPush(p.push_subscription, { title: c.title, body: c.body, url: c.url, kind, tag: kind });
      if (r.gone) await db.from('profiles').update({ push_enabled: false, push_subscription: null }).eq('id', p.id);
      return r.ok;
    }));
    return res.filter(Boolean).length;
  };

  if (me.role === 'child') {
    // Les titres de tâche ne sont pas transmis par le client : on les résout ici.
    if (body.taskId) {
      const { data: t } = await db.from('tasks').select('title').eq('id', body.taskId).maybeSingle();
      body.taskTitle = t?.title;
    }
    const m = fromChild(body.kind, me.display_name, body);
    if (!m) return NextResponse.json({ ok: true, sent: 0 });
    if (settings?.notif_parent && settings.notif_parent[m.pref as keyof typeof settings.notif_parent] === false) {
      return NextResponse.json({ ok: true, sent: 0, skipped: 'préférence' });
    }
    return NextResponse.json({ ok: true, sent: await deliver(parents, m.copy, body.kind) });
  }

  if (!child) return NextResponse.json({ error: 'aucun enfant' }, { status: 400 });
  const m = fromParent(body.kind, body);
  if (!m) return NextResponse.json({ ok: true, sent: 0 });
  if (settings?.notif_child && settings.notif_child[m.pref as keyof typeof settings.notif_child] === false) {
    return NextResponse.json({ ok: true, sent: 0, skipped: 'préférence' });
  }
  return NextResponse.json({ ok: true, sent: await deliver([child], m.copy, body.kind) });
}
