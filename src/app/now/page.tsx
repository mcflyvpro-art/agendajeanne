'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import ChildShell from '@/components/ChildShell';
import PushManager from '@/components/PushManager';
import { useApp } from '@/components/AppProvider';
import { useDay } from '@/lib/useDay';
import { useLive } from '@/lib/useLive';
import { useTaskTimer } from '@/lib/useTimer';
import { supabase } from '@/lib/supabase';
import { todayISO, hhmm, humanDuration, fromMinutes, toMinutes, nowMinutes } from '@/lib/dates';
import { minTimerSeconds, requiresPhoto, requiresValidation, progressOf, levelOf, xpToday } from '@/lib/economy';
import { MOOD_SCALE, MOOD_SPECIAL } from '@/lib/mood';
import { REACTIONS, reactionEmoji } from '@/lib/reactions';
import * as A from '@/lib/actions';
import { Loader, Sheet, Ring, Bar, Confetti, toast } from '@/components/ui';
import type { Task, Message } from '@/lib/types';

export default function NowPage() { return <ChildShell><Now /></ChildShell>; }

function Now() {
  const { profile, settings, refresh } = useApp();
  const today = todayISO();
  const { tasks, loading, reload } = useDay(profile?.id, today);
  const [fire, setFire] = useState(0);
  const [award, setAward] = useState<A.AwardResult | null>(null);

  const current = useMemo(
    () => tasks.find((t) => t.status === 'doing') ?? tasks.find((t) => t.status === 'todo') ?? null,
    [tasks]
  );

  useLive(['messages', 'rewards', 'contracts', 'profiles'], refresh, 'now');

  if (loading || !settings || !profile) return <Loader />;
  const prog = progressOf(tasks);

  const onDone = async (a: A.AwardResult | null) => {
    await Promise.all([reload(), refresh()]);
    if (!a) { toast('Envoyé à tes parents'); return; }
    setFire((n) => n + 1);
    setAward(a);
  };

  return (
    <main className="mx-auto max-w-lg px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <Confetti fire={fire} />
      <Header xp={xpToday(tasks)} prog={prog} />

      <div className="mt-5 space-y-4">
        <PushManager />
        <MoodRow />
        <AssignedQuizCard />
        {current ? (
          current.status === 'doing'
            ? <Focus task={current} onDone={onDone} />
            : <Next task={current} onChanged={reload} />
        ) : <AllDone done={prog.done} />}
        <Queue tasks={tasks} currentId={current?.id} onChanged={reload} />
      </div>

      <AwardSheet award={award} onClose={() => setAward(null)} />
    </main>
  );
}

/* ------------------------------------------------------------------ entête */
function Header({ xp, prog }: { xp: number; prog: { done: number; total: number; pct: number } }) {
  const { profile, settings } = useApp();
  if (!profile || !settings) return null;
  const lvl = levelOf(profile.xp, settings.xp_per_level);
  const goal = Math.max(1, settings.daily_xp_goal ?? 60);
  const goalPct = Math.min(100, Math.round((xp / goal) * 100));

  return (
    <header>
      <div className="flex items-center gap-3">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-3xl bg-grape-light text-3xl">
          {profile.avatar_emoji}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-black text-ink">{profile.display_name}</h1>
          <p className="text-sm font-bold text-grape">Niveau {lvl.level} · {lvl.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Inbox />
          {profile.streak_current > 0 && (
            <span className="chip !border-sun !bg-sun-light !text-sun-dark">🔥 {profile.streak_current}</span>
          )}
          <Link href="/shop" className="chip !border-grape !bg-grape-light !text-grape">
            {settings.currency_emoji} {profile.coins}
          </Link>
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        <div className="tile flex-1 p-3.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-extrabold text-ink">⚡ {xp} / {goal} XP</span>
            <span className="text-xs font-bold text-muted">{goalPct}%</span>
          </div>
          <Bar pct={goalPct} color="#F5A524" height={12} />
        </div>
        <div className="tile flex-1 p-3.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-xs font-extrabold text-ink">✅ {prog.done} / {prog.total}</span>
            <span className="text-xs font-bold text-muted">{prog.pct}%</span>
          </div>
          <Bar pct={prog.pct} color={prog.pct === 100 ? '#1FC08A' : '#7C4DEE'} height={12} />
        </div>
      </div>
    </header>
  );
}

/* --------------------------------------------------------------- messages */
/**
 * Bouton discret avec pastille de comptage, ouvrant tous les messages reçus.
 * Ouvrir la feuille vaut lecture — le parent voit l'accusé — et chaque
 * message peut recevoir une seule réaction, remplacée si on en choisit une
 * autre.
 */
function Inbox() {
  const { profile } = useApp();
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('messages').select('*')
      .eq('to_id', profile.id).order('created_at', { ascending: false }).limit(30);
    setMsgs((data ?? []) as Message[]);
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);
  useLive(['messages'], load, 'now-inbox');

  const unread = msgs.filter((m) => !m.read_at).length;

  const openInbox = async () => {
    setOpen(true);
    const ids = msgs.filter((m) => !m.read_at).map((m) => m.id);
    if (ids.length) {
      await supabase.from('messages').update({ read_at: new Date().toISOString() }).in('id', ids);
      load();
    }
  };

  const react = async (m: Message, code: string) => {
    const next = m.reaction === code ? null : code;
    setMsgs((list) => list.map((x) => (x.id === m.id ? { ...x, reaction: next as any } : x)));
    await supabase.from('messages').update({ reaction: next }).eq('id', m.id);
    if (next) A.notify('message_reaction', { emoji: reactionEmoji(next), body: m.body });
  };

  return (
    <>
      <button onClick={openInbox} aria-label="Messages" className="relative no-select active:scale-90">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-card text-xl shadow-float">💌</span>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-flame px-1 text-[11px] font-black text-white">
            {unread}
          </span>
        )}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Messages">
        {msgs.length === 0 ? (
          <p className="py-10 text-center text-6xl">📭</p>
        ) : (
          <ul className="space-y-3">
            {msgs.map((m) => (
              <li key={m.id} className="card p-4">
                <p className="font-bold text-ink">{m.emoji ?? '💬'} {m.body}</p>
                <p className="mt-1 text-xs font-bold text-muted">
                  {new Date(m.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
                <div className="mt-3 flex justify-between gap-1.5">
                  {REACTIONS.map((r) => (
                    <button key={r.code} onClick={() => react(m, r.code)}
                            className={clsx('grid h-11 flex-1 place-items-center rounded-2xl border-2 text-xl no-select transition active:scale-90',
                              m.reaction === r.code ? 'border-grape bg-grape-light scale-105' : 'border-line bg-card')}>
                      {r.emoji}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}

/* -------------------------------------------------------- quiz des parents */
function AssignedQuizCard() {
  const { profile } = useApp();
  const [quiz, setQuiz] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [{ data: quizzes }, { data: attempts }] = await Promise.all([
        supabase.from('quizzes').select('id,title').eq('child_id', profile.id).eq('source', 'parent').order('created_at', { ascending: false }),
        supabase.from('quiz_attempts').select('quiz_id').eq('child_id', profile.id),
      ]);
      const done = new Set((attempts ?? []).map((a: any) => a.quiz_id));
      setQuiz((quizzes ?? []).find((q: any) => !done.has(q.id)) ?? null);
    })();
  }, [profile?.id]);

  if (!quiz) return null;
  return (
    <Link href="/quiz" className="card flex items-center gap-3 border-2 border-grape bg-grape-light p-4 no-select active:scale-[.99]">
      <span className="animate-bob text-3xl">🧠</span>
      <div className="min-w-0 flex-1">
        <p className="font-black text-grape">Nouveau quiz de tes parents</p>
        <p className="truncate text-sm font-bold text-ink">{quiz.title}</p>
      </div>
      <span className="text-2xl">▶️</span>
    </Link>
  );
}

/* ------------------------------------------------------------------ humeur */
/**
 * Disparaît une fois le quota du jour atteint (réglable côté parent, 1 par
 * défaut) : sans ça, l'écran d'accueil garde en permanence une question déjà
 * répondue.
 */
function MoodRow() {
  const { profile, settings } = useApp();
  const [todayMoods, setTodayMoods] = useState<{ code: string | null }[]>([]);
  const [more, setMore] = useState(false);
  const [ready, setReady] = useState(false);
  const today = todayISO();

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('moods').select('code')
      .eq('child_id', profile.id).eq('day', today).order('created_at');
    setTodayMoods((data ?? []) as { code: string | null }[]);
    setReady(true);
  }, [profile?.id, today]);

  useEffect(() => { load(); }, [load]);

  if (!profile || !settings || !ready) return null;

  const limit = Math.max(1, settings.mood_per_day ?? 1);
  if (todayMoods.length >= limit) return null;

  const pick = async (code: string, value: number, emoji: string) => {
    setTodayMoods((m) => [...m, { code }]);
    await supabase.from('moods').insert({ child_id: profile.id, day: today, mood: value, code });
    A.notify('mood', { code, value, emoji });
  };

  const shown = more ? [...MOOD_SCALE, ...MOOD_SPECIAL] : MOOD_SCALE;

  return (
    <section className="card p-4">
      <div className="flex items-center justify-between">
        <p className="text-base font-extrabold text-ink">Comment tu te sens ?</p>
        <button onClick={() => setMore((m) => !m)} aria-label="Plus d’humeurs"
                className="text-2xl no-select active:scale-90">{more ? '➖' : '➕'}</button>
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2">
        {shown.map((m) => (
          <button key={m.code} onClick={() => pick(m.code, m.value, m.emoji)} aria-label={m.label}
                  className="grid aspect-square place-items-center rounded-3xl border-2 border-line bg-card text-3xl transition no-select active:scale-90">
            {m.emoji}
          </button>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------- prochaine tâche */
function Next({ task, onChanged }: { task: Task; onChanged: () => void }) {
  const { settings, profile } = useApp();
  const [blocked, setBlocked] = useState(false);
  const [note, setNote] = useState('');
  if (!settings || !profile) return null;

  const left = settings.max_postpones_per_day - task.postpone_count;

  return (
    <>
      <section className="card overflow-hidden animate-rise">
        <div className="h-2 w-full" style={{ background: task.subject?.color ?? '#7C4DEE' }} />
        <div className="p-5">
          <div className="flex flex-wrap gap-2">
            {task.subject && (
              <span className="chip" style={{ borderColor: task.subject.color, color: task.subject.color }}>
                {task.subject.emoji} {task.subject.name}
              </span>
            )}
            <span className="chip">🕐 {task.start_time ? hhmm(task.start_time) : 'libre'}</span>
            <span className="chip">⏳ {humanDuration(task.duration_min)}</span>
            <span className="chip !border-grape !bg-grape-light !text-grape">
              +{task.coins} {settings.currency_emoji}
            </span>
          </div>

          <h2 className="mt-4 text-3xl font-black leading-tight text-ink">{task.title}</h2>
          {task.description && <p className="mt-2 whitespace-pre-wrap font-medium text-muted">{task.description}</p>}

          {task.parent_note && (
            <div className="mt-4 rounded-3xl bg-rose-light px-4 py-3">
              <p className="font-bold text-rose-dark">💬 {task.parent_note}</p>
            </div>
          )}

          {!!task.subtasks?.length && (
            <ol className="mt-4 space-y-2">
              {task.subtasks.map((s, i) => (
                <li key={s.id} className="flex items-center gap-3 rounded-2xl bg-soft px-3 py-2.5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-grape text-xs font-black text-white">{i + 1}</span>
                  <span className="font-semibold text-ink">{s.label}</span>
                </li>
              ))}
            </ol>
          )}

          <button onClick={async () => { await A.startTask(task); onChanged(); }}
                  className="btn-leaf btn-lg mt-5 w-full animate-halo">
            ▶️ Je commence
          </button>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <button onClick={() => setBlocked(true)} className="btn-plain text-sm">🆘 Je bloque</button>
            <button disabled={!task.allow_postpone || left <= 0}
                    onClick={async () => { await A.postponeTask(task, settings); onChanged(); toast(`+${settings.postpone_minutes} min`); }}
                    className="btn-plain text-sm">
              ⏭️ Plus tard · {Math.max(0, left)}
            </button>
          </div>
        </div>
      </section>

      <Sheet open={blocked} onClose={() => setBlocked(false)} title="Qu’est-ce qui bloque ?"
             footer={
               <button className="btn-grape btn-lg w-full"
                       onClick={async () => {
                         await A.reportBlocked(task, note, profile.id, null);
                         setBlocked(false); setNote(''); toast('Message envoyé');
                       }}>
                 Envoyer
               </button>
             }>
        <textarea className="field min-h-[120px]" value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Je comprends pas l’exercice 3…" />
      </Sheet>
    </>
  );
}

/* -------------------------------------------------------------- mode focus */
function Focus({ task, onDone }: { task: Task; onDone: (a: A.AwardResult | null) => void }) {
  const { settings } = useApp();
  const { seconds, running } = useTaskTimer(task);
  const [finish, setFinish] = useState(false);
  if (!settings) return null;

  const goal = task.duration_min * 60;
  const minSec = minTimerSeconds(settings, task);
  const canFinish = seconds >= minSec;
  const pct = Math.min(100, (seconds / goal) * 100);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const doneSubs = task.subtasks?.filter((s) => s.done).length ?? 0;

  return (
    <>
      <section className="card animate-rise p-5">
        <h2 className="text-center text-2xl font-black leading-tight text-ink">{task.title}</h2>

        <div className="mt-5 flex justify-center">
          <Ring pct={pct} size={230} stroke={18} color={canFinish ? '#1FC08A' : '#7C4DEE'}>
            <div className="text-5xl font-black tabular-nums text-ink">{mm}:{ss}</div>
            <div className={clsx('mt-2 text-sm font-extrabold', running ? 'text-leaf' : 'text-sun-dark')}>
              {running ? '▶️ ça tourne' : '⏸️ en pause'}
            </div>
          </Ring>
        </div>

        {!running && (
          <p className="mt-4 rounded-3xl bg-sun-light px-4 py-3 text-center font-extrabold text-ink">
            👀 Reviens sur l’app pour repartir
          </p>
        )}

        {!!task.subtasks?.length && (
          <div className="mt-6">
            <p className="mb-2 text-sm font-extrabold text-muted">{doneSubs} / {task.subtasks.length}</p>
            <ul className="space-y-2">
              {task.subtasks.map((s) => (
                <li key={s.id}>
                  <button onClick={() => A.toggleSubtask(s.id, !s.done)}
                          className={clsx('flex w-full items-center gap-3 rounded-3xl border-2 px-4 py-3.5 text-left transition no-select active:scale-[.99]',
                            s.done ? 'border-leaf bg-leaf-light' : 'border-line bg-card')}>
                    <span className={clsx('grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 text-sm font-black transition',
                      s.done ? 'border-leaf bg-leaf text-white' : 'border-line text-transparent')}>✓</span>
                    <span className={clsx('font-bold', s.done ? 'text-muted line-through' : 'text-ink')}>{s.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {task.link_url && (
          <a href={task.link_url} target="_blank" rel="noreferrer" className="btn-plain mt-4 w-full">🔗 Ouvrir</a>
        )}

        <button onClick={() => setFinish(true)} disabled={!canFinish}
                className={clsx('btn-lg mt-5 w-full', canFinish ? 'btn-leaf' : 'btn-plain')}>
          {canFinish ? '✅ J’ai fini' : `⏳ Encore ${Math.ceil((minSec - seconds) / 60)} min`}
        </button>
      </section>

      <FinishSheet open={finish} onClose={() => setFinish(false)} task={task} onDone={onDone} />
    </>
  );
}

function FinishSheet({ open, onClose, task, onDone }: {
  open: boolean; onClose: () => void; task: Task; onDone: (a: A.AwardResult | null) => void;
}) {
  const { settings, profile } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!settings || !profile) return null;

  const needPhoto = requiresPhoto(settings, task);
  const needValid = requiresValidation(settings, task);
  const ready = !needPhoto || !!file;

  const submit = async () => {
    setBusy(true);
    try {
      const url = file ? await A.uploadProof(file, profile.id) : null;
      const res = await A.completeTask(task, settings, profile, { proofUrl: url, note: null, needsValidation: needValid });
      onClose(); setFile(null); setPreview(null);
      onDone(res);
    } catch { toast('Erreur', 'err'); }
    finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Bien joué !"
           footer={
             <button onClick={submit} disabled={!ready || busy} className="btn-leaf btn-lg w-full">
               {busy ? '…' : needValid ? 'Envoyer à mes parents' : `Gagner ${task.coins} ${settings.currency_emoji}`}
             </button>
           }>
      {needPhoto ? (
        <label className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 rounded-4xl border-[3px] border-dashed border-grape bg-grape-light p-4 text-center">
          {preview
            ? <img src={preview} alt="" className="max-h-60 rounded-3xl object-contain" />
            : <><span className="text-5xl">📸</span><span className="font-extrabold text-grape">Photo de ton travail</span></>}
          <input type="file" accept="image/*" capture="environment" className="hidden"
                 onChange={(e) => {
                   const f = e.target.files?.[0] ?? null;
                   setFile(f); setPreview(f ? URL.createObjectURL(f) : null);
                 }} />
        </label>
      ) : (
        <p className="py-6 text-center text-6xl">🎉</p>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------- récompense */
function AwardSheet({ award, onClose }: { award: A.AwardResult | null; onClose: () => void }) {
  const { settings } = useApp();
  if (!award || !settings) return null;
  return (
    <Sheet open onClose={onClose} title="Bravo !"
           footer={<button onClick={onClose} className="btn-grape btn-lg w-full">Continuer</button>}>
      <div className="py-3 text-center">
        <div className="animate-bob text-7xl">{settings.currency_emoji}</div>
        <div className="mt-3 text-6xl font-black text-grape">+{award.coins}</div>
        <div className="mt-2 text-xl font-extrabold text-sun-dark">+{award.xp} XP</div>

        {!!award.bonuses.length && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {award.bonuses.map((b) => (
              <span key={b.label} className="chip !border-leaf !bg-leaf-light !text-leaf-dark">
                {b.label} +{b.pct}%
              </span>
            ))}
          </div>
        )}
        {award.levelUp && (
          <div className="mt-4 rounded-4xl bg-grape-light px-4 py-4">
            <p className="text-4xl">🎊</p>
            <p className="mt-1 text-xl font-black text-grape">Niveau {award.levelUp} !</p>
          </div>
        )}
        {award.perfectDay && (
          <div className="mt-3 rounded-4xl bg-sun-light px-4 py-3">
            <p className="text-lg font-black text-sun-dark">💎 Journée parfaite</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ----------------------------------------------------------- file d'attente */
function Queue({ tasks, currentId, onChanged }: { tasks: Task[]; currentId?: string; onChanged: () => void }) {
  const rest = tasks.filter((t) => t.id !== currentId && t.status === 'todo');
  const [place, setPlace] = useState<Task | null>(null);
  if (!rest.length) return null;

  return (
    <>
      <section className="card p-4">
        <p className="mb-3 text-base font-extrabold text-ink">Ensuite</p>
        <ul className="space-y-2">
          {rest.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-3xl bg-soft px-3.5 py-3">
              <span className="w-12 shrink-0 text-sm font-black tabular-nums text-ink">
                {t.start_time ? hhmm(t.start_time) : '—'}
              </span>
              <span className="min-w-0 flex-1 truncate font-bold text-ink">{t.title}</span>
              {!t.start_time && (
                <button onClick={() => setPlace(t)}
                        className="shrink-0 rounded-2xl bg-grape px-3 py-2 text-xs font-black text-white no-select active:scale-95">
                  🕐 Placer
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      <PlaceSheet task={place} onClose={() => setPlace(null)} onDone={onChanged} />
    </>
  );
}

/** Choix d'un créneau par l'enfant, en un tap. */
function PlaceSheet({ task, onClose, onDone }: { task: Task | null; onClose: () => void; onDone: () => void }) {
  const { settings } = useApp();
  if (!task || !settings) return null;

  const from = toMinutes(String(settings.day_start).slice(0, 5)) ?? 480;
  const to = toMinutes(String(settings.day_end).slice(0, 5)) ?? 1080;
  const now = nowMinutes();
  const slots: number[] = [];
  for (let m = Math.max(from, Math.ceil(now / 30) * 30); m + task.duration_min <= to + 60; m += 30) slots.push(m);

  return (
    <Sheet open onClose={onClose} title={task.title}>
      <p className="mb-3 text-base font-extrabold text-ink">Tu la fais à quelle heure ?</p>
      <div className="grid grid-cols-3 gap-2.5">
        {slots.map((m) => (
          <button key={m}
                  onClick={async () => { await A.scheduleTask(task.id, fromMinutes(m)); onClose(); onDone(); toast(`Placée à ${fromMinutes(m)}`); }}
                  className="rounded-3xl border-2 border-line bg-card py-4 text-lg font-black text-ink no-select active:scale-95">
            {fromMinutes(m)}
          </button>
        ))}
      </div>
      {!slots.length && <p className="py-6 text-center text-5xl">🌙</p>}
    </Sheet>
  );
}

function AllDone({ done }: { done: number }) {
  return (
    <section className="card animate-rise px-6 py-12 text-center">
      <div className="animate-bob text-7xl">{done ? '🏆' : '🌤️'}</div>
      <h2 className="mt-4 text-3xl font-black text-ink">{done ? 'Journée finie !' : 'Rien à faire'}</h2>
      <div className="mt-6 flex gap-2.5">
        <Link href="/quiz" className="btn-plain flex-1">🧠 Quiz</Link>
        <Link href="/shop" className="btn-grape flex-1">🎁 Boutique</Link>
      </div>
    </section>
  );
}
