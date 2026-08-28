'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import ChildShell from '@/components/ChildShell';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { Loader, Empty, Ring, toast } from '@/components/ui';
import { checkBadges, notify } from '@/lib/actions';
import { compressImage } from '@/lib/image';
import { levelOf } from '@/lib/economy';
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
      <h1 className="text-3xl font-black text-ink">Quiz 🧠</h1>

      <label className={clsx('card mt-5 flex cursor-pointer flex-col items-center gap-3 border-[3px] border-dashed border-grape bg-grape-light px-6 py-10 text-center no-select',
        busy && 'pointer-events-none opacity-60')}>
        <span className={clsx('text-6xl', busy ? 'animate-bob' : '')}>{busy ? '✨' : '📸'}</span>
        <span className="text-xl font-black text-grape">{busy ? 'Lecture…' : 'Photographier ma leçon'}</span>
        <input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy}
               onChange={(e) => { const f = e.target.files?.[0]; if (f) create(f); e.target.value = ''; }} />
      </label>

      {list.length === 0 ? (
        <div className="mt-6"><Empty emoji="📚" title="Aucun quiz" /></div>
      ) : (
        <ul className="stagger mt-6 space-y-3">
          {list.map((q) => (
            <li key={q.id}>
              <button onClick={() => setActive(q)} className="card flex w-full items-center gap-3 p-4 text-left no-select active:scale-[.98]">
                <span className="text-3xl">📘</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-extrabold text-ink">{q.title}</p>
                  <p className="text-xs font-bold text-muted">{(q.questions as QuizQuestion[]).length} questions</p>
                </div>
                <span className="text-2xl">▶️</span>
              </button>
            </li>
          ))}
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
  const [earned, setEarned] = useState({ coins: 0, xp: 0 });

  const q = qs[i];

  const validate = () => { if (picked !== null) setReveal(true); };

  const next = async () => {
    const acc = [...answers, picked!];
    setAnswers(acc); setPicked(null); setReveal(false);
    if (i + 1 < qs.length) { setI(i + 1); return; }

    const score = acc.filter((a, k) => a === qs[k].answer).length;
    const coins = score * (settings?.quiz_coins_per_answer ?? 3);
    const xp = score * (settings?.xp_per_quiz_answer ?? 5);
    setEarned({ coins, xp });
    setOver(true);

    if (profile) {
      await supabase.from('quiz_attempts').insert({
        quiz_id: quiz.id, child_id: profile.id, answers: acc, score, total: qs.length, coins_earned: coins,
      });
      if (coins > 0) {
        await supabase.from('ledger').insert({
          child_id: profile.id, amount: coins, reason: `Quiz : ${quiz.title}`, kind: 'quiz', ref_id: quiz.id,
        });
      }
      const newXp = profile.xp + xp;
      const before = levelOf(profile.xp, settings!.xp_per_level).level;
      const after = levelOf(newXp, settings!.xp_per_level).level;
      await supabase.from('profiles').update({
        coins: profile.coins + coins, xp: newXp, level_reached: after,
      }).eq('id', profile.id);
      if (after > before) notify('level_up', { level: after });
      await checkBadges(profile.id, profile.streak_current, after);
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
        <p className="mt-4 text-3xl font-black text-grape">+{earned.coins} {settings?.currency_emoji}</p>
        <p className="mt-1 text-xl font-extrabold text-sun-dark">+{earned.xp} XP</p>
        <div className="mt-8 flex w-full gap-2.5">
          <button onClick={() => { setI(0); setAnswers([]); setOver(false); setPicked(null); setReveal(false); }}
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
