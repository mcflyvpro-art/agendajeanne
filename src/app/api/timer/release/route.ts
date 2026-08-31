import { NextResponse } from 'next/server';
import { admin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * « Cet appareil s'en va. »
 *
 * Appelée au moment exact où la page se ferme — onglet refermé, fenêtre de
 * l'app quittée, ordinateur qui s'endort. Une requête Supabase ordinaire
 * serait annulée avec la page ; celle-ci part en `keepalive`, et le jeton
 * voyage dans le corps de la requête parce qu'une balise `sendBeacon` ne peut
 * pas porter d'en-tête.
 *
 * Si elle n'arrive jamais (plantage, coupure de courant), rien n'est faussé
 * pour autant : le battement de cœur refermera le segment au dernier signe de
 * vie de l'appareil.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as
    { taskId?: string; device?: string; token?: string } | null;

  const token = body?.token
    ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    ?? null;
  if (!body?.taskId || !token) return NextResponse.json({ error: 'requête incomplète' }, { status: 400 });

  const db = admin();
  const { data: user } = await db.auth.getUser(token);
  if (!user.user) return NextResponse.json({ error: 'non authentifié' }, { status: 401 });

  // La tâche doit bien appartenir à la personne qui ferme sa fenêtre.
  const { data: task } = await db.from('tasks').select('id,child_id').eq('id', body.taskId).maybeSingle();
  if (!task) return NextResponse.json({ error: 'tâche introuvable' }, { status: 404 });
  if (task.child_id !== user.user.id) {
    const { data: me } = await db.from('profiles').select('role').eq('id', user.user.id).maybeSingle();
    if (me?.role !== 'parent') return NextResponse.json({ error: 'interdit' }, { status: 403 });
  }

  const { error } = await db.rpc('timer_release', { p_task: body.taskId, p_device: body.device ?? '' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
