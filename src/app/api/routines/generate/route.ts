import { NextResponse } from 'next/server';
import { admin } from '@/lib/admin';
import { whoami } from '@/lib/auth-api';
import { generateRoutines } from '@/app/api/cron/tick/route';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const me = await whoami(req);
  if (me?.role !== 'parent') return NextResponse.json({ error: 'réservé au parent' }, { status: 403 });

  const { days } = await req.json().catch(() => ({ days: 14 }));
  const db = admin();
  const { data: s } = await db.from('settings').select('child_id').eq('id', 1).maybeSingle();
  let childId = s?.child_id as string | undefined;
  if (!childId) {
    const { data: c } = await db.from('profiles').select('id').eq('role', 'child').limit(1).maybeSingle();
    childId = c?.id;
  }
  if (!childId) return NextResponse.json({ error: 'aucun profil enfant' }, { status: 400 });

  const created = await generateRoutines(db, childId, Math.min(60, Math.max(1, Number(days) || 14)));
  return NextResponse.json({ ok: true, created });
}
