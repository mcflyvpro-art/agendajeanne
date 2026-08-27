import { admin } from '@/lib/admin';
import type { Profile } from '@/lib/types';

/** Vérifie le jeton porté par la requête et renvoie le profil correspondant. */
export async function whoami(req: Request): Promise<Profile | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const db = admin();
  const { data } = await db.auth.getUser(token);
  if (!data.user) return null;
  const { data: p } = await db.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
  return (p as Profile) ?? null;
}
