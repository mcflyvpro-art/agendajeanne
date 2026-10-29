'use client';
import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import ChildShell from '@/components/ChildShell';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { useLive } from '@/lib/useLive';
import { Loader, Empty, Ring, PageHeader, toast } from '@/components/ui';
import { checkBadges, creditChild, notify } from '@/lib/actions';
import { compressImage } from '@/lib/image';
import { levelOf } from '@/lib/economy';
import type { Quiz, QuizQuestion } from '@/lib/types';

export default function QuizPage() { return <ChildShell><QuizHome /></ChildShell>; }

function QuizHome() {
  const { profile, settings, refresh, subjects } = useApp();
  const [list, setList] = useState<Quiz[]>([]);
  const [active, setActive] = useState<Quiz | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [attempted, setAttempted] = useState<Set<string>>(new Set());
  const [best, setBest] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!profile) return;
    const [q, a] = await Promise.all([
      supabase.from('quizzes').select('*').eq('child_id', profile.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('quiz_attempts').select('quiz_id,score,total').eq('child_id', profile.id),
    ]);
    const scores: Record<string, number> = {};
    for (const row of (a.data ?? []) as { quiz_id: string; score: number; total: number }[]) {
      const pct = row.total ? Math.round((row.score / row.total) * 100) : 0;
      scores[row.quiz_id] = Math.max(scores[row.quiz_id] ?? 0, pct);
    }
    setBest(scores);
    const rows = (q.data ?? []) as Quiz[];
    const attemptedSet = new Set((a.data ?? []).map((r: any) => r.quiz_id));
    // Ceux envoyés par les parents et jamais faits remontent en premier.
    rows.sort((x, y) => {
      const px = x.source === 'parent' && !attemptedSet.has(x.id) ? 0 : 1;
      const py = y.source === 'parent' && !attemptedSet.has(y.id) ? 0 : 1;
      return px - py;
    });
    setAttempted(attemptedSet);
    setList(rows);
    setLoading(false);
  }, [profile?.id]);
  useEffect(() => { load(); }, [load]);
  useLive(['quizzes', 'quiz_attempts'], load, 'child-quiz');

  const create = async (file: File) => {
    setBusy(true);
    try {
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
      catch { throw new Error('Réessaie'); }
      if (!r.ok) throw new Error(json.error ?? 'Échec');

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
    <main className="mx-auto max-w-lg px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <PageHeader title="Quiz" subtitle="Réviser en jouant" />

      {settings.child_can_create_quiz && (
        <label className={clsx('card mt-4 flex cursor-pointer items-center gap-4 border-2 border-dashed border-grape/60 bg-grape-light p-4 no-select active:scale-[.99]',
          busy && 'pointer-events-none')}>
          <span className={clsx('grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-white text-4xl shadow-float', busy && 'animate-bob')}>
            {busy ? '✨' : '📸'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-black leading-tight text-grape">{busy ? 'Je prépare tes questions…' : 'Photographier ma leçon'}</span>
            <span className="mt-0.5 block text-sm font-bold text-muted">
              {busy ? 'Ça prend une quinzaine de secondes' : 'Un quiz est créé à partir de ta photo'}
            </span>
          </span>
          <input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy}
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) create(f); e.target.value = ''; }} />
        </label>
      )}

      {list.length === 0 ? (
        <div className="mt-6"><Empty emoji="📚" title="Aucun quiz" hint="Photographie une leçon pour créer ton premier quiz." /></div>
      ) : (
        <ul className="stagger mt-5 space-y-2.5">
          {list.map((q) => {
            const subject = subjects.find((x) => x.name === q.subject);
            const isNew = q.source === 'parent' && !attempted.has(q.id);
            const score = best[q.id];
            return (
              <li key={q.id}>
                <button onClick={() => setActive(q)}
                        className={clsx('card flex w-full items-center gap-3 p-4 text-left no-select active:scale-[.98]', isNew && 'border-2 border-grape')}>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl"
                        style={{ background: `${subject?.color ?? '#7C4DEE'}22` }}>
                    {subject?.emoji ?? '📘'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold text-ink">{q.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs font-bold text-muted">
                      <span>{(q.questions as QuizQuestion[]).length} questions</span>
                      {q.source === 'parent' && <span>· de tes parents</span>}
                    </p>
                  </div>
                  {isNew ? <span className="shrink-0 rounded-full bg-grape px-2.5 py-1 text-[11px] font-black text-white">Nouveau</span>
                    : score !== undefined ? (
                      <span className={clsx('shrink-0 rounded-full px-2.5 py-1 text-xs font-black',
                        score === 100 ? 'bg-leaf-light text-leaf-dark' : score >= 50 ? 'bg-sun-light text-sun-dark' : 'bg-flame-light text-flame-dark')}>
                        {score}%
                      </span>
                    ) : <span className="shrink-0 text-xl">▶️</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function Play({ quiz, onExit }: { quiz: Quiz; onExit: () => void }) {
  const { profile, settings } = useApp();
  const qs = quiz.questions as QuizQuestion[];
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [reveal, setReveal] = useState(false);
  const [answers, setAnswers] = useState<number[]>([]);
  const [over, setOver] = useState(false);
  const [earned, setEarned] = useState<{ coins: number; xp: number; practice?: boolean } | null>(null);

  const q = qs[i];

  const validate = () => { if (picked !== null) setReveal(true); };

  const next = async () => {
    const acc = [...answers, picked!];
    setAnswers(acc); setPicked(null); setReveal(false);
    if (i + 1 < qs.length) { setI(i + 1); return; }

    const score = acc.filter((a, k) => a === qs[k].answer).length;
    setOver(true);

    if (profile) {
      // Seul le premier essai rapporte : les réponses ayant été montrées, un
      // quiz refait aussitôt permettait de gagner des points à l'infini.
      const { count } = await supabase.from('quiz_attempts').select('id', { count: 'exact', head: true })
        .eq('quiz_id', quiz.id).eq('child_id', profile.id);
      const first = !count;
      const coins = first ? score * (settings?.quiz_coins_per_answer ?? 3) : 0;
      const xp = first ? score * (settings?.xp_per_quiz_answer ?? 5) : 0;
      setEarned({ coins, xp, practice: !first });

      await supabase.from('quiz_attempts').insert({
        quiz_id: quiz.id, child_id: profile.id, answers: acc, score, total: qs.length, coins_earned: coins,
      });
      if (coins > 0) {
        await supabase.from('ledger').insert({
          child_id: profile.id, amount: coins, reason: `Quiz : ${quiz.title}`, kind: 'quiz', ref_id: quiz.id,
        });
      }
      if (!first) return;
      // Addition faite sur le solde relu en base, pas sur la copie en mémoire.
      const up = await creditChild(profile.id, coins, xp);
      const total = up?.xp ?? profile.xp + xp;
      const before = levelOf(total - xp, settings!.xp_per_level).level;
      const after = levelOf(total, settings!.xp_per_level).level;
      if (after > before) {
        await supabase.from('profiles').update({ level_reached: after }).eq('id', profile.id);
        notify('level_up', { level: after });
      }
      await checkBadges(profile.id, up?.streak_current ?? profile.streak_current, after);
      notify('quiz_done', { title: quiz.title, score, total: qs.length });
    }
  };

  if (over) {
    const score = answers.filter((a, k) => a === qs[k].answer).length;
    const pct = Math.round((score / qs.length) * 100);
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
        <Ring pct={pct} size={210} stroke={18} color={pct >= 70 ? '#1FC08A' : pct >= 40 ? '#F5A524' : '#F4525C'}>
          <div className="text-5xl font-black text-ink">{score}</div>
          <div className="text-lg font-bold text-muted">sur {qs.length}</div>
        </Ring>
        <p className="mt-6 text-6xl">{pct === 100 ? '🏆' : pct >= 70 ? '🎉' : pct >= 40 ? '💪' : '📖'}</p>
        <p className="mt-2 text-xl font-black text-ink">
          {pct === 100 ? 'Sans faute !' : pct >= 70 ? 'Très bien !' : pct >= 40 ? 'Pas mal, continue' : 'Relis ta leçon et retente'}
        </p>
        {!earned ? <div className="mt-6 h-16" /> : earned.practice ? (
          <p className="mt-5 rounded-3xl bg-soft px-5 py-3 text-sm font-bold text-muted">
            Entraînement : les points ne comptent qu’au premier essai.
          </p>
        ) : (
          <>
            <p className="mt-4 text-3xl font-black text-grape">+{earned.coins} {settings?.currency_emoji}</p>
            <p className="mt-1 text-xl font-extrabold text-sun-dark">+{earned.xp} XP</p>
          </>
        )}
        <div className="mt-8 flex w-full gap-2.5">
          <button onClick={() => { setI(0); setAnswers([]); setOver(false); setPicked(null); setReveal(false); setEarned(null); }}
                  className="btn-plain flex-1">🔄 Refaire</button>
          <button onClick={onExit} className="btn-grape flex-1">Terminer</button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 pb-6" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <div className="flex items-center gap-3">
        <button onClick={onExit} className="grid h-10 w-10 place-items-center rounded-full bg-soft text-lg font-black text-muted no-select active:scale-90">✕</button>
        <div className="flex-1"><div className="h-3.5 w-full overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-leaf transition-all duration-300" style={{ width: `${((i + (reveal ? 1 : 0)) / qs.length) * 100}%` }} />
        </div></div>
        <span className="text-sm font-black text-muted">{i + 1}/{qs.length}</span>
      </div>

      <h2 className="mt-8 text-2xl font-black leading-snug text-ink">{q.q}</h2>

      <ul className="mt-6 space-y-3">
        {q.choices.map((c, k) => {
          const isRight = k === q.answer;
          const isPicked = picked === k;
          return (
            <li key={k}>
              <button onClick={() => !reveal && setPicked(k)} disabled={reveal}
                      className={clsx('w-full rounded-3xl border-2 px-4 py-4 text-left font-extrabold transition no-select',
                        reveal && isRight ? 'border-leaf bg-leaf-light text-leaf-dark'
                        : reveal && isPicked ? 'border-flame bg-flame-light text-flame-dark'
                        : isPicked ? 'border-grape bg-grape-light text-grape'
                        : 'border-line bg-card text-ink')}>
                {reveal && isRight ? '✅ ' : reveal && isPicked ? '❌ ' : ''}{c}
              </button>
            </li>
          );
        })}
      </ul>

      {reveal && q.why && (
        <p className="mt-4 rounded-3xl bg-sky-light px-4 py-3 font-bold text-ink">💡 {q.why}</p>
      )}

      <button onClick={reveal ? next : validate} disabled={picked === null}
              className={clsx('btn-lg mt-6 w-full', reveal ? 'btn-grape' : 'btn-leaf')}>
        {reveal ? (i + 1 === qs.length ? 'Mon score' : 'Suivante') : 'Valider'}
      </button>
    </main>
  );
}
