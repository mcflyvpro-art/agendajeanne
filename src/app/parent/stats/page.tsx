'use client';
import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { ChevronLeft } from 'lucide-react';
import ParentShell from '@/components/ParentShell';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { useLive } from '@/lib/useLive';
import { todayISO, addDaysISO, dayShort, dowOf } from '@/lib/dates';
import { moodEmoji } from '@/lib/mood';
import { Loader, Stat, Bar, Empty, SegmentedTabs, Sheet, NumberField, toast } from '@/components/ui';
import { compressImage } from '@/lib/image';
import { notify } from '@/lib/actions';
import { Trash2, Plus, Camera, Sparkles } from 'lucide-react';
import type { Task, Mood, Quiz, QuizAttempt, QuizQuestion } from '@/lib/types';

export default function StatsPage() { return <ParentShell><Suivi /></ParentShell>; }

function Suivi() {
  const [tab, setTab] = useState<'stats' | 'quiz'>('stats');
  return (
    <main className="mx-auto max-w-lg px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <h1 className="text-3xl font-black text-ink">Suivi</h1>
      <div className="mt-4">
        <SegmentedTabs value={tab} onChange={setTab}
                       options={[{ value: 'stats', label: '📊 Activité' }, { value: 'quiz', label: '🧠 Quiz' }]} />
      </div>
      {tab === 'stats' ? <Activity /> : <QuizReview />}
    </main>
  );
}

/* ---------------------------------------------------------------- stats -- */
function Activity() {
  const { child } = useApp();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [moods, setMoods] = useState<Mood[]>([]);
  const [range, setRange] = useState(14);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!child) return;
    const from = addDaysISO(todayISO(), -(range - 1));
    {
      const [t, m] = await Promise.all([
        supabase.from('tasks').select('*, subject:subjects(*)').eq('child_id', child.id).gte('day', from).lte('day', todayISO()),
        supabase.from('moods').select('*').eq('child_id', child.id).gte('day', from).order('day'),
      ]);
      setTasks((t.data ?? []) as Task[]);
      setMoods((m.data ?? []) as Mood[]);
      setLoading(false);
    }
  }, [child?.id, range]);

  useEffect(() => { load(); }, [load]);
  useLive(['tasks', 'moods'], load, 'stats-activity');

  if (loading || !child) return <Loader />;

  const days = Array.from({ length: range }, (_, i) => addDaysISO(todayISO(), -(range - 1 - i)));
  const byDay = days.map((d) => {
    const list = tasks.filter((t) => t.day === d && t.status !== 'skipped');
    const done = list.filter((t) => t.status === 'done' || t.status === 'submitted').length;
    return { day: d, pct: list.length ? Math.round((done / list.length) * 100) : -1 };
  });

  const total = tasks.filter((t) => t.status !== 'skipped').length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const minutes = tasks.filter((t) => t.status === 'done').reduce((n, t) => n + Math.round((t.active_seconds ?? 0) / 60), 0);
  const rate = total ? Math.round((done / total) * 100) : 0;

  const names = [...new Set(tasks.map((t) => t.subject?.name).filter(Boolean))] as string[];
  const bySubject = names.map((name) => {
    const list = tasks.filter((t) => t.subject?.name === name && t.status !== 'skipped');
    const d = list.filter((t) => t.status === 'done').length;
    return { name, color: list[0]?.subject?.color ?? '#7C4DEE', emoji: list[0]?.subject?.emoji ?? '📘',
             total: list.length, done: d, pct: list.length ? Math.round((d / list.length) * 100) : 0 };
  }).sort((a, b) => a.pct - b.pct);

  const byHour: Record<number, { d: number; t: number }> = {};
  tasks.filter((t) => t.start_time).forEach((t) => {
    const h = Number(t.start_time!.slice(0, 2));
    byHour[h] ??= { d: 0, t: 0 };
    byHour[h].t++;
    if (t.status === 'done') byHour[h].d++;
  });
  const bestHours = Object.entries(byHour).filter(([, v]) => v.t >= 2)
    .map(([h, v]) => ({ h: Number(h), pct: Math.round((v.d / v.t) * 100), n: v.t }))
    .sort((a, b) => b.pct - a.pct).slice(0, 5);

  return (
    <div className="mt-5 space-y-5">
      <div className="flex justify-center gap-2">
        {[7, 14, 30].map((n) => (
          <button key={n} onClick={() => setRange(n)}
                  className={clsx('chip', range === n && '!border-grape !bg-grape-light !text-grape')}>{n} j</button>
        ))}
      </div>

      <div className="flex gap-2.5">
        <Stat emoji="🎯" value={`${rate}%`} label="réussite" color={rate >= 70 ? '#1FC08A' : rate >= 40 ? '#F5A524' : '#F4525C'} />
        <Stat emoji="✅" value={`${done}/${total}`} label="tâches" />
        <Stat emoji="⏱️" value={`${Math.round(minutes / 60)} h`} label="travail" />
        <Stat emoji="🔥" value={child.streak_current} label="série" color="#F5A524" />
      </div>

      <section className="card p-4">
        <div className="flex items-end gap-1" style={{ height: 110 }}>
          {byDay.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-1 items-end">
                <div className="w-full rounded-t-lg transition-all"
                     style={{ height: d.pct < 0 ? 4 : `${Math.max(8, d.pct)}%`,
                              background: d.pct < 0 ? '#EBE3F9' : d.pct === 100 ? '#1FC08A' : d.pct >= 50 ? '#7C4DEE' : '#F4525C' }} />
              </div>
              <span className="text-[8px] font-bold text-muted">{dayShort(dowOf(d.day)).slice(0, 1)}</span>
            </div>
          ))}
        </div>
      </section>

      {!!bySubject.length && (
        <section className="card p-4">
          <p className="mb-3 font-black text-ink">Par matière</p>
          <ul className="space-y-3">
            {bySubject.map((s) => (
              <li key={s.name}>
                <div className="mb-1.5 flex justify-between text-sm font-extrabold">
                  <span className="text-ink">{s.emoji} {s.name}</span>
                  <span className={clsx(s.pct >= 70 ? 'text-leaf' : s.pct >= 40 ? 'text-sun-dark' : 'text-flame')}>
                    {s.done}/{s.total}
                  </span>
                </div>
                <Bar pct={s.pct} color={s.color} height={10} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {!!bestHours.length && (
        <section className="card p-4">
          <p className="mb-3 font-black text-ink">Meilleures heures</p>
          <ul className="space-y-2.5">
            {bestHours.map((h) => (
              <li key={h.h} className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-sm font-black tabular-nums text-ink">{String(h.h).padStart(2, '0')}h</span>
                <div className="flex-1"><Bar pct={h.pct} color={h.pct >= 70 ? '#1FC08A' : '#7C4DEE'} height={10} /></div>
                <span className="w-10 shrink-0 text-right text-xs font-bold text-muted">{h.pct}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!!moods.length && (
        <section className="card p-4">
          <p className="mb-3 font-black text-ink">Humeur</p>
          <div className="flex flex-wrap gap-2">
            {moods.slice(-21).map((m) => (
              <div key={m.id} className="text-center">
                <div className="text-2xl">{moodEmoji(m.code, m.mood)}</div>
                <div className="text-[9px] font-bold text-muted">{m.day.slice(-2)}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {total === 0 && <Empty emoji="📊" title="Aucune tâche sur la période" />}
    </div>
  );
}

/* ----------------------------------------------------------------- quiz -- */
function QuizReview() {
  const { child } = useApp();
  const [list, setList] = useState<(Quiz & { attempts: QuizAttempt[] })[]>([]);
  const [open, setOpen] = useState<(Quiz & { attempts: QuizAttempt[] }) | null>(null);
  const [create, setCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!child) return;
    {
      const [q, a] = await Promise.all([
        supabase.from('quizzes').select('*').eq('child_id', child.id).order('created_at', { ascending: false }),
        supabase.from('quiz_attempts').select('*').eq('child_id', child.id).order('created_at', { ascending: false }),
      ]);
      const attempts = (a.data ?? []) as QuizAttempt[];
      setList(((q.data ?? []) as Quiz[]).map((x) => ({ ...x, attempts: attempts.filter((t) => t.quiz_id === x.id) })));
      setLoading(false);
    }
  }, [child?.id]);

  useEffect(() => { load(); }, [load]);
  useLive(['quizzes', 'quiz_attempts'], load, 'stats-quiz');

  if (open) return <QuizDetail quiz={open} onBack={() => setOpen(null)} onDeleted={() => { setOpen(null); load(); }} />;

  return (
    <div className="mt-5">
      <button onClick={() => setCreate(true)} className="btn-grape btn-lg w-full">
        <Plus size={20} /> Créer un quiz
      </button>

      {loading ? <Loader /> : !list.length ? (
        <div className="mt-5"><Empty emoji="🧠" title="Aucun quiz" /></div>
      ) : (
        <ul className="stagger mt-5 space-y-3">
          {list.map((q) => {
            const best = Math.max(0, ...q.attempts.map((a) => (a.total ? Math.round((a.score / a.total) * 100) : 0)));
            const last = q.attempts[0];
            return (
              <li key={q.id}>
                <button onClick={() => setOpen(q)} className="card w-full p-4 text-left no-select active:scale-[.99]">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{q.source === 'parent' ? '👪' : '📘'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-extrabold text-ink">{q.title}</p>
                      <p className="text-xs font-bold text-muted">
                        {q.attempts.length} tentative{q.attempts.length > 1 ? 's' : ''}
                        {last && ` · dernière ${new Date(last.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`}
                      </p>
                    </div>
                    {q.attempts.length > 0 && (
                      <span className={clsx('shrink-0 text-lg font-black',
                        best >= 70 ? 'text-leaf' : best >= 40 ? 'text-sun-dark' : 'text-flame')}>{best}%</span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <QuizCreator open={create} onClose={() => setCreate(false)} onSent={load} />
    </div>
  );
}

function QuizDetail({ quiz, onBack, onDeleted }: {
  quiz: Quiz & { attempts: QuizAttempt[] }; onBack: () => void; onDeleted: () => void;
}) {
  const qs = quiz.questions as QuizQuestion[];
  const [sel, setSel] = useState<QuizAttempt | null>(quiz.attempts[0] ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const chrono = [...quiz.attempts].reverse();

  const del = async () => {
    await supabase.from('quizzes').delete().eq('id', quiz.id);
    toast('Quiz supprimé');
    onDeleted();
  };

  return (
    <div className="mt-5 space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="chip"><ChevronLeft size={14} /> Retour</button>
        {confirmDelete ? (
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} className="chip">Annuler</button>
            <button onClick={del} className="chip !border-flame !bg-flame-light !text-flame-dark">Confirmer</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)}
                  className="grid h-9 w-9 place-items-center rounded-full bg-flame-light text-flame-dark no-select active:scale-90">
            <Trash2 size={16} />
          </button>
        )}
      </div>
      <h2 className="text-2xl font-black text-ink">{quiz.title}</h2>

      {chrono.length > 0 && (
        <section className="card p-4">
          <p className="mb-3 font-black text-ink">
            Progression{chrono.length === 1 ? ' — 1 tentative' : ` — ${chrono.length} tentatives`}
          </p>
          <div className="flex items-end gap-2" style={{ height: 90 }}>
            {chrono.map((a) => {
              const pct = a.total ? Math.round((a.score / a.total) * 100) : 0;
              return (
                <div key={a.id} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] font-black text-ink">{pct}%</span>
                  <div className="flex w-full flex-1 items-end">
                    <div className="w-full rounded-t-lg"
                         style={{ height: `${Math.max(8, pct)}%`, background: pct >= 70 ? '#1FC08A' : pct >= 40 ? '#F5A524' : '#F4525C' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {quiz.attempts.length === 0 ? (
        <Empty emoji="⏳" title="Jamais tenté" />
      ) : (
        <>
          <div className="scroll-x flex gap-2">
            {quiz.attempts.map((a) => {
              const pct = a.total ? Math.round((a.score / a.total) * 100) : 0;
              return (
                <button key={a.id} onClick={() => setSel(a)}
                        className={clsx('shrink-0 rounded-3xl border-2 px-4 py-2.5 text-left no-select',
                          sel?.id === a.id ? 'border-grape bg-grape-light' : 'border-line bg-card')}>
                  <p className="text-sm font-black text-ink">{a.score}/{a.total} · {pct}%</p>
                  <p className="text-[10px] font-bold text-muted">
                    {new Date(a.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </button>
              );
            })}
          </div>

          {sel && (
            <ul className="space-y-3">
              {qs.map((q, i) => {
                const given = (sel.answers as number[])[i];
                const ok = given === q.answer;
                return (
                  <li key={i} className={clsx('card border-2 p-4', ok ? 'border-leaf' : 'border-flame')}>
                    <p className="font-extrabold text-ink">{ok ? '✅' : '❌'} {q.q}</p>
                    <div className="mt-2.5 space-y-1.5">
                      {q.choices.map((c, k) => (
                        <p key={k}
                           className={clsx('rounded-2xl px-3 py-2 text-sm font-bold',
                             k === q.answer ? 'bg-leaf-light text-leaf-dark'
                             : k === given ? 'bg-flame-light text-flame-dark'
                             : 'text-muted')}>
                          {k === q.answer ? '✓ ' : k === given ? '✗ ' : ''}{c}
                        </p>
                      ))}
                    </div>
                    {q.why && <p className="mt-2.5 rounded-2xl bg-sky-light px-3 py-2 text-sm font-bold text-ink">💡 {q.why}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------ créer un quiz --- */
type Draft = { title: string; subject: string; questions: QuizQuestion[] };

function QuizCreator({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent: () => void }) {
  const { profile, child } = useApp();
  const [nQuestions, setNQuestions] = useState(10);
  const [nChoices, setNChoices] = useState(4);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const reset = () => { setDraft(null); setBusy(false); };
  const close = () => { reset(); onClose(); };

  const generate = async (file: File) => {
    setBusy(true);
    try {
      const { base64, mime } = await compressImage(file);
      const { data: sess } = await supabase.auth.getSession();
      const r = await fetch('/api/ai/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session?.access_token ?? ''}` },
        body: JSON.stringify({ image: base64, mime, questions: nQuestions, choices: nChoices }),
      });
      const raw = await r.text();
      let json: any;
      try { json = JSON.parse(raw); } catch { throw new Error('Réessaie'); }
      if (!r.ok) throw new Error(json.error ?? 'Échec de la génération');
      setDraft({ title: json.title, subject: json.subject ?? '', questions: json.questions });
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  const send = async () => {
    if (!draft || !child || !profile) return;
    setBusy(true);
    try {
      await supabase.from('quizzes').insert({
        child_id: child.id, title: draft.title.trim() || 'Quiz', subject: draft.subject || null,
        questions: draft.questions, source: 'parent', assigned_by: profile.id,
      });
      await notify('quiz_assigned', { title: draft.title });
      toast('Envoyé à ' + child.display_name);
      close(); onSent();
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  const setQ = (i: number, patch: Partial<QuizQuestion>) => {
    if (!draft) return;
    setDraft({ ...draft, questions: draft.questions.map((q, k) => (k === i ? { ...q, ...patch } : q)) });
  };
  const setChoice = (qi: number, ci: number, text: string) => {
    if (!draft) return;
    const questions = draft.questions.map((q, k) => {
      if (k !== qi) return q;
      const choices = q.choices.map((c, j) => (j === ci ? text : c));
      return { ...q, choices };
    });
    setDraft({ ...draft, questions });
  };
  const removeQ = (i: number) => {
    if (!draft) return;
    setDraft({ ...draft, questions: draft.questions.filter((_, k) => k !== i) });
  };

  return (
    <Sheet open={open} onClose={close} title={draft ? 'Relire le quiz' : 'Créer un quiz'}
           footer={draft ? (
             <button onClick={send} disabled={busy || !draft.questions.length} className="btn-grape btn-lg w-full">
               {busy ? '…' : `Envoyer à ${child?.display_name ?? "l'enfant"}`}
             </button>
           ) : undefined}>
      {!draft ? (
        <div className="space-y-5">
          <div>
            <label className="label">Nombre de questions</label>
            <NumberField value={nQuestions} min={3} onChange={setNQuestions} />
          </div>
          <div>
            <label className="label">Propositions par question</label>
            <NumberField value={nChoices} min={2} onChange={setNChoices} />
          </div>

          <label className={clsx('flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-3 rounded-4xl border-[3px] border-dashed border-grape bg-grape-light p-4 text-center',
            busy && 'pointer-events-none opacity-60')}>
            {busy ? (
              <><Sparkles className="animate-bob" size={34} /><span className="font-extrabold text-grape">Lecture de la photo…</span></>
            ) : (
              <><Camera size={34} className="text-grape" /><span className="font-extrabold text-grape">Photographier la leçon</span></>
            )}
            <input type="file" accept="image/*" capture="environment" className="hidden" disabled={busy}
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) generate(f); e.target.value = ''; }} />
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          <input className="field" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Titre du quiz" />

          {draft.questions.map((q, i) => (
            <div key={i} className="card space-y-2.5 p-4">
              <div className="flex items-start gap-2">
                <textarea className="field flex-1 !py-2.5 text-sm" value={q.q}
                          onChange={(e) => setQ(i, { q: e.target.value })} rows={2} />
                <button onClick={() => removeQ(i)}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-flame-light text-flame-dark no-select active:scale-90">
                  <Trash2 size={14} />
                </button>
              </div>
              {q.choices.map((c, ci) => (
                <label key={ci} className={clsx('flex items-center gap-2.5 rounded-2xl border-2 px-3 py-2 no-select',
                  q.answer === ci ? 'border-leaf bg-leaf-light' : 'border-line bg-card')}>
                  <input type="radio" checked={q.answer === ci} onChange={() => setQ(i, { answer: ci })}
                         className="h-4 w-4 shrink-0 accent-leaf" />
                  <input className="flex-1 bg-transparent text-sm font-bold text-ink outline-none"
                         value={c} onChange={(e) => setChoice(i, ci, e.target.value)} />
                </label>
              ))}
            </div>
          ))}
          {!draft.questions.length && <Empty emoji="🗑️" title="Plus aucune question" />}
        </div>
      )}
    </Sheet>
  );
}
