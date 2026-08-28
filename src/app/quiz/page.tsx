'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Camera, Sparkles, ChevronRight, RotateCcw } from 'lucide-react';
import ChildShell from '@/components/ChildShell';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { Loader, Empty, Ring, toast } from '@/components/ui';
import { checkBadges } from '@/lib/actions';
import { compressImage } from '@/lib/image';
import type { Quiz, QuizQuestion } from '@/lib/types';

export default function QuizPage() { return <ChildShell><QuizHome /></ChildShell>; }

function QuizHome() {
  const { profile, settings, refresh } = useApp();
  const [list, setList] = useState<Quiz[]>([]);
  const [active, setActive] = useState<Quiz | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!profile) return;
    const { data } = await supabase.from('quizzes').select('*').eq('child_id', profile.id)
      .order('created_at', { ascending: false }).limit(30);
    setList((data ?? []) as Quiz[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [profile?.id]);

  const create = async (file: File) => {
    setBusy(true);
    try {
      // Une capture d'écran PC en pleine résolution peut peser plusieurs Mo :
      // on la redimensionne avant l'envoi, sinon la requête peut être rejetée
      // avant même d'atteindre le serveur (limite de taille des fonctions Vercel).
      const { base64, mime } = await compressImage(file);
      const { data: sess } = await supabase.auth.getSession();
      const r = await fetch('/api/ai/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session?.access_token ?? ''}` },
        body: JSON.stringify({ image: base64, mime }),
      });

      const raw = await r.text();
      let json: any;
      try { json = JSON.parse(raw); }
      catch { throw new Error(r.ok ? 'Réponse inattendue du serveur, réessaie' : `Erreur serveur (${r.status}), réessaie`); }
      if (!r.ok) throw new Error(json.error ?? 'Échec de la génération');

      const { data, error } = await supabase.from('quizzes').insert({
        child_id: profile!.id, title: json.title, subject: json.subject, questions: json.questions,
      }).select().single();
      if (error) throw error;
      await load();
      setActive(data as Quiz);
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  if (loading || !profile || !settings) return <Loader />;
  if (active) return <Play quiz={active} onExit={async () => { setActive(null); await Promise.all([load(), refresh()]); }} />;

  return (
    <main className="mx-auto max-w-lg px-4 pb-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <h1 className="text-2xl font-black tracking-tight">Quiz de révision 🧠</h1>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Prends ta leçon en photo. L’app te pose 10 questions dessus — et te paie {settings.quiz_coins_per_answer} {settings.currency_emoji} par bonne réponse.
      </p>

      <label className={clsx('card mt-5 flex cursor-pointer flex-col items-center gap-3 border-2 border-dashed border-brand/40 bg-brand/[.06] px-6 py-9 text-center',
        busy && 'pointer-events-none opacity-60')}>
        {busy ? (
          <>
            <Sparkles size={30} className="animate-pulse text-brand-soft" />
            <p className="text-sm font-bold text-brand-soft">Lecture de ta leçon…</p>
            <p className="text-xs text-muted">Une dizaine de secondes</p>
          </>
        ) : (
          <>
            <Camera size={30} className="text-brand-soft" />
            <p className="text-sm font-bold">Photographier une leçon</p>
            <p className="text-xs text-muted">Cadre bien la page, à plat et éclairée</p>
          </>
        )}
        <input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy}
               onChange={(e) => { const f = e.target.files?.[0]; if (f) create(f); e.target.value = ''; }} />
      </label>

      <h2 className="label mt-8">Tes quiz</h2>
      {list.length === 0 ? (
        <Empty emoji="📸" title="Aucun quiz" hint="Photographie ta première leçon pour commencer." />
      ) : (
        <ul className="stagger space-y-2.5">
          {list.map((q) => (
            <li key={q.id}>
              <button onClick={() => setActive(q)} className="card flex w-full items-center gap-3 p-4 text-left active:scale-[.99]">
                <span className="text-2xl">📘</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{q.title}</p>
                  <p className="text-[11px] text-muted">
                    {q.subject ? `${q.subject} · ` : ''}{(q.questions as QuizQuestion[]).length} questions
                  </p>
                </div>
                <ChevronRight size={18} className="text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

/* --------------------------------------------------------------- jeu */
function Play({ quiz, onExit }: { quiz: Quiz; onExit: () => void }) {
  const { profile, settings } = useApp();
  const qs = quiz.questions as QuizQuestion[];
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [over, setOver] = useState(false);
  const [earned, setEarned] = useState(0);

  const q = qs[i];
  const score = answers.filter((a, k) => a === qs[k]?.answer).length;

  const next = async () => {
    if (picked === null) return;
    const acc = [...answers, picked];
    setAnswers(acc);
    setPicked(null);
    if (i + 1 < qs.length) { setI(i + 1); return; }

    const finalScore = acc.filter((a, k) => a === qs[k].answer).length;
    const coins = finalScore * (settings?.quiz_coins_per_answer ?? 3);
    setEarned(coins);
    setOver(true);

    if (profile && coins > 0) {
      await supabase.from('quiz_attempts').insert({
        quiz_id: quiz.id, child_id: profile.id, answers: acc,
        score: finalScore, total: qs.length, coins_earned: coins,
      });
      await supabase.from('ledger').insert({
        child_id: profile.id, amount: coins, reason: `Quiz : ${quiz.title}`, kind: 'quiz', ref_id: quiz.id,
      });
      await supabase.from('profiles').update({ coins: profile.coins + coins }).eq('id', profile.id);
      await checkBadges(profile.id, profile.streak_current);
    }
  };

  if (over) {
    const pct = Math.round((score / qs.length) * 100);
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
        <Ring pct={pct} size={200} color={pct >= 70 ? '#2FD8A5' : pct >= 40 ? '#FFC44D' : '#FF6B6B'}>
          <div className="text-4xl font-black">{score}<span className="text-xl text-muted">/{qs.length}</span></div>
          <div className="text-[11px] uppercase tracking-wider text-muted">{pct} %</div>
        </Ring>
        <h2 className="mt-6 text-2xl font-black">
          {pct === 100 ? 'Sans faute 🧠' : pct >= 70 ? 'Bien joué 👏' : pct >= 40 ? 'Ça vient 💪' : 'À revoir 📖'}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {pct >= 70 ? 'Cette leçon est solide.' : 'Relis la leçon et refais le quiz — c’est comme ça que ça rentre.'}
        </p>
        <p className="mt-4 text-2xl font-black text-brand-soft">+{earned} {settings?.currency_emoji}</p>
        <div className="mt-8 flex w-full gap-2">
          <button onClick={() => { setI(0); setAnswers([]); setOver(false); setPicked(null); }} className="btn-ghost flex-1">
            <RotateCcw size={16} /> Refaire
          </button>
          <button onClick={onExit} className="btn-primary flex-1">Terminer</button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 pb-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <div className="flex items-center justify-between">
        <button onClick={onExit} className="btn-soft !px-3 !py-2 text-xs">Quitter</button>
        <span className="chip">{i + 1} / {qs.length}</span>
      </div>

      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${(i / qs.length) * 100}%` }} />
      </div>

      <h2 className="mt-7 text-xl font-black leading-snug">{q.q}</h2>

      <ul className="stagger mt-6 space-y-2.5">
        {q.choices.map((c, k) => (
          <li key={k}>
            <button onClick={() => setPicked(k)}
                    className={clsx('w-full rounded-2xl border px-4 py-4 text-left text-sm font-semibold transition active:scale-[.99]',
                      picked === k ? 'border-brand bg-brand/15 text-white' : 'border-line bg-raised text-white/80')}>
              <span className="mr-2.5 font-mono text-xs text-muted">{String.fromCharCode(65 + k)}</span>{c}
            </button>
          </li>
        ))}
      </ul>

      <button onClick={next} disabled={picked === null} className="btn-primary mt-7 w-full !py-4">
        {i + 1 === qs.length ? 'Voir mon score' : 'Question suivante'}
      </button>
    </main>
  );
}
