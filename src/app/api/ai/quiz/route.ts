import { NextResponse } from 'next/server';
import { generateQuiz } from '@/lib/ai';
import { whoami } from '@/lib/auth-api';
import { admin } from '@/lib/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const me = await whoami(req);
  if (!me) return NextResponse.json({ error: 'non authentifié' }, { status: 401 });

  const { image, mime, hint, questions, choices } = await req.json().catch(() => ({}) as any);
  if (!image) return NextResponse.json({ error: 'image manquante' }, { status: 400 });
  // Reste sous la limite de taille de requête des fonctions Vercel (~4,5 Mo) :
  // au-delà, la plateforme rejette l'appel avant même d'atteindre ce code,
  // et le navigateur reçoit une réponse non-JSON au lieu de notre message clair.
  if (image.length > 3_500_000) return NextResponse.json({ error: 'Photo trop lourde — reprends-la de moins près.' }, { status: 400 });

  // Le parent peut couper la création de quiz côté enfant : vérifié ici aussi,
  // pas seulement dans l'interface, sinon la coupure est purement cosmétique.
  if (me.role === 'child') {
    const { data: s } = await admin().from('settings').select('child_can_create_quiz').eq('id', 1).maybeSingle();
    if (s && s.child_can_create_quiz === false) {
      return NextResponse.json({ error: 'La création de quiz est désactivée pour le moment.' }, { status: 403 });
    }
  }

  try {
    const quiz = await generateQuiz(image, mime || 'image/jpeg', hint ?? '', {
      questions: Number(questions) || undefined,
      choices: Number(choices) || undefined,
    });
    return NextResponse.json(quiz);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Échec de la génération' }, { status: 500 });
  }
}
