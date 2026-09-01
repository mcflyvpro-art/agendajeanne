import { NextResponse } from 'next/server';
import { splitTask } from '@/lib/ai';
import { whoami } from '@/lib/auth-api';

export const dynamic = 'force-dynamic';
export const maxDuration = 45;

export async function POST(req: Request) {
  const me = await whoami(req);
  if (!me) return NextResponse.json({ error: 'non authentifié' }, { status: 401 });
  // Un compte observateur ne doit déclencher aucun appel réel — ni écriture,
  // ni dépense d'API — même en cliquant sur les vrais boutons des vraies pages.
  if (me.role === 'admin') return NextResponse.json({ error: 'Mode observateur : lecture seule' }, { status: 403 });

  const { title, description } = await req.json().catch(() => ({}) as any);
  if (!title) return NextResponse.json({ error: 'titre manquant' }, { status: 400 });

  try {
    return NextResponse.json({ steps: await splitTask(String(title), String(description ?? '')) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Échec du découpage' }, { status: 500 });
  }
}
