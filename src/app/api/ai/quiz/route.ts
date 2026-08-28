import { NextResponse } from 'next/server';
import { generateQuiz } from '@/lib/ai';
import { whoami } from '@/lib/auth-api';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const me = await whoami(req);
  if (!me) return NextResponse.json({ error: 'non authentifié' }, { status: 401 });

  const { image, mime, hint } = await req.json().catch(() => ({}) as any);
  if (!image) return NextResponse.json({ error: 'image manquante' }, { status: 400 });
  // Reste sous la limite de taille de requête des fonctions Vercel (~4,5 Mo) :
  // au-delà, la plateforme rejette l'appel avant même d'atteindre ce code,
  // et le navigateur reçoit une réponse non-JSON au lieu de notre message clair.
  if (image.length > 3_500_000) return NextResponse.json({ error: 'Photo trop lourde — reprends-la de moins près.' }, { status: 400 });

  try {
    const quiz = await generateQuiz(image, mime || 'image/jpeg', hint ?? '');
    return NextResponse.json(quiz);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Échec de la génération' }, { status: 500 });
  }
}
