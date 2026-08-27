import { NextResponse } from 'next/server';
import { admin } from '@/lib/admin';
import { sendPush } from '@/lib/push';
import { parentCopy } from '@/lib/tone';
import { whoami } from '@/lib/auth-api';
import type { Profile } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const me = await whoami(req);
  if (!me) return NextResponse.json({ error: 'non authentifié' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const db = admin();
  const { data: profiles } = await db.from('profiles').select('*');
  const all = (profiles ?? []) as Profile[];
  const parents = all.filter((p) => p.role === 'parent');
  const child = all.find((p) => p.role === 'child');

  const deliver = async (targets: Profile[], copy: { title: string; body: string }, kind: string, url: string) => {
    const results = await Promise.all(targets.map(async (p) => {
      const r = await sendPush(p.push_subscription, { ...copy, kind, url, tag: kind });
      if (r.gone) await db.from('profiles').update({ push_enabled: false, push_subscription: null }).eq('id', p.id);
      return r.ok;
    }));
    return results.filter(Boolean).length;
  };

  // Enfant → parents
  if (me.role === 'child') {
    let copy: { title: string; body: string } | null = null;
    if (body.kind === 'blocked') {
      const { data: t } = await db.from('tasks').select('title').eq('id', body.taskId).maybeSingle();
      copy = parentCopy.blocked(me.display_name, t?.title ?? 'une tâche', String(body.note ?? ''));
    } else if (body.kind === 'submitted') {
      const { data: t } = await db.from('tasks').select('title').eq('id', body.taskId).maybeSingle();
      copy = parentCopy.submitted(me.display_name, t?.title ?? 'une tâche');
    } else if (body.kind === 'redemption') {
      copy = parentCopy.redemption(me.display_name, String(body.reward), Number(body.cost) || 0);
    } else if (body.kind === 'mood') {
      copy = parentCopy.moodLow(me.display_name);
    }
    if (!copy) return NextResponse.json({ ok: true, sent: 0 });
    const sent = await deliver(parents, copy, body.kind, '/parent');
    return NextResponse.json({ ok: true, sent });
  }

  // Parent → enfant
  if (!child) return NextResponse.json({ error: 'aucun enfant' }, { status: 400 });
  const copy = {
    title: body.kind === 'kudos' ? `${body.emoji ?? '💜'} Message de tes parents` : 'Agenda',
    body: String(body.body ?? ''),
  };
  const sent = await deliver([child], copy, 'kudos', '/me');
  return NextResponse.json({ ok: true, sent });
}
