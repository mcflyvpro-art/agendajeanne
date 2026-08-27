'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Play, Clock, Camera, HelpCircle, SkipForward, Check, ExternalLink, Flame, Pause } from 'lucide-react';
import ChildShell from '@/components/ChildShell';
import PushManager from '@/components/PushManager';
import { useApp } from '@/components/AppProvider';
import { useDay } from '@/lib/useDay';
import { supabase } from '@/lib/supabase';
import { todayISO, hhmm, humanDuration, nowMinutes, toMinutes } from '@/lib/dates';
import { minTimerSeconds, requiresPhoto, requiresValidation, progressOf, levelOf } from '@/lib/economy';
import * as A from '@/lib/actions';
import { Loader, Sheet, Ring, Bar, Confetti, toast } from '@/components/ui';
import type { Task } from '@/lib/types';

export default function NowPage() { return <ChildShell><Now /></ChildShell>; }

function Now() {
  const { profile, settings, refresh } = useApp();
  const today = todayISO();
  const { tasks, loading, reload } = useDay(profile?.id, today);
  const [fire, setFire] = useState(0);
  const [award, setAward] = useState<A.AwardResult | null>(null);
  const [badgeNames, setBadgeNames] = useState<string[]>([]);

  const current = useMemo(() => {
    const doing = tasks.find((t) => t.status === 'doing');
    if (doing) return doing;
    return tasks.find((t) => t.status === 'todo') ?? null;
  }, [tasks]);

  const prog = progressOf(tasks);
  if (loading || !settings || !profile) return <Loader />;

  const onAward = async (a: A.AwardResult | null) => {
    await Promise.all([reload(), refresh()]);
    if (!a) { toast('Envoyé à tes parents pour validation ✅'); return; }
    setFire((n) => n + 1);
    setAward(a);
    if (a.badges.length) {
      const { data } = await supabase.from('badges').select('name,emoji').in('code', a.badges);
      setBadgeNames((data ?? []).map((b: any) => `${b.emoji} ${b.name}`));
    }
  };

  return (
    <main className="mx-auto max-w-lg px-4 pt-3">
      <Confetti fire={fire} />
      <Header prog={prog} />
      <div className="mt-4 space-y-4">
        <PushManager />
        <MoodPrompt />
        {current ? (
          current.status === 'doing'
            ? <Focus task={current} onDone={onAward} />
            : <UpNext task={current} onStarted={reload} queue={tasks} />
        ) : (
          <AllDone count={prog.done} />
        )}
      </div>
      <AwardSheet award={award} badges={badgeNames} onClose={() => { setAward(null); setBadgeNames([]); }} />
    </main>
  );
}

/* ------------------------------------------------------------------ entête */
function Header({ prog }: { prog: { done: number; total: number; pct: number } }) {
  const { profile, settings } = useApp();
  if (!profile || !settings) return null;
  const lvl = levelOf(profile.xp, settings.xp_per_level);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bonjour' : hour < 18 ? 'Salut' : 'Bonsoir';

  return (
    <header className="pt-2" style={{ paddingTop: 'calc(env(safe-area-inset-top) + .5rem)' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{greet}</p>
          <h1 className="truncate text-2xl font-black tracking-tight">{profile.display_name} {profile.avatar_emoji}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {profile.streak_current > 0 && (
            <span className="chip !border-sun/30 !bg-sun/10 !text-sun">
              <Flame size={13} /> {profile.streak_current} j
            </span>
          )}
          <Link href="/shop" className="chip !border-brand/30 !bg-brand/15 !text-brand-soft">
            {settings.currency_emoji} {profile.coins}
          </Link>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="flex-1">
          <div className="mb-1.5 flex justify-between text-[11px] font-semibold text-muted">
            <span>Aujourd’hui · {prog.done}/{prog.total}</span>
            <span>Niveau {lvl.level}</span>
          </div>
          <Bar pct={prog.pct} color={prog.pct === 100 ? '#2FD8A5' : '#7C5CFF'} />
        </div>
      </div>
    </header>
  );
}

/* --------------------------------------------------------- prochaine tâche */
function UpNext({ task, onStarted, queue }: { task: Task; onStarted: () => void; queue: Task[] }) {
  const { settings, profile, child } = useApp();
  const [blocked, setBlocked] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!settings || !profile) return null;

  const planned = toMinutes(task.start_time);
  const late = planned !== null && nowMinutes() > planned;
  const early = planned !== null && nowMinutes() < planned - 5;
  const postponesLeft = settings.max_postpones_per_day - task.postpone_count;
  const rest = queue.filter((t) => t.id !== task.id && t.status === 'todo');

  const start = async (twoMin: boolean) => {
    setBusy(true);
    await A.startTask(task);
    if (twoMin) toast('2 minutes. Juste 2 minutes 💪');
    await onStarted();
    setBusy(false);
  };

  return (
    <>
      <section className="card overflow-hidden animate-rise">
        <div className="h-1.5 w-full" style={{ background: task.subject?.color ?? '#7C5CFF' }} />
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            {task.subject && (
              <span className="chip" style={{ borderColor: `${task.subject.color}44`, background: `${task.subject.color}18`, color: task.subject.color }}>
                {task.subject.emoji} {task.subject.name}
              </span>
            )}
            <span className="chip"><Clock size={12} /> {task.start_time ? hhmm(task.start_time) : 'Quand tu veux'}</span>
            <span className="chip">{humanDuration(task.duration_min)}</span>
            <span className="chip !border-brand/30 !bg-brand/12 !text-brand-soft">
              +{task.coins} {settings.currency_emoji}
            </span>
          </div>

          <h2 className="mt-4 text-[26px] font-black leading-tight tracking-tight">{task.title}</h2>
          {task.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/70">{task.description}</p>}

          {late && (
            <p className="mt-3 rounded-2xl border border-coral/25 bg-coral/10 px-3 py-2 text-xs font-semibold text-coral">
              ⏰ {nowMinutes() - planned!} min de retard — le bonus de ponctualité est perdu
            </p>
          )}
          {early && (
            <p className="mt-3 rounded-2xl border border-mint/25 bg-mint/10 px-3 py-2 text-xs font-semibold text-mint">
              🌅 En avance. Si tu commences maintenant, tu gardes ton bonus.
            </p>
          )}

          {task.parent_note && (
            <div className="mt-3 rounded-2xl border border-line bg-raised px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Mot de tes parents</p>
              <p className="mt-1 text-sm text-white/85">{task.parent_note}</p>
            </div>
          )}

          {!!task.subtasks?.length && (
            <ol className="mt-4 space-y-1.5">
              {task.subtasks.map((s, i) => (
                <li key={s.id} className="flex gap-2.5 text-sm text-white/65">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-raised text-[10px] font-bold text-muted">{i + 1}</span>
                  {s.label}
                </li>
              ))}
            </ol>
          )}

          <button onClick={() => start(false)} disabled={busy}
                  className="btn-primary mt-5 w-full animate-pulseRing !py-4 text-lg">
            <Play size={20} fill="currentColor" /> Je commence
          </button>

          <button onClick={() => start(true)} disabled={busy}
                  className="btn-soft mt-2 w-full text-sm">
            🐣 Juste 2 minutes, pour voir
          </button>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => setBlocked(true)} className="btn-soft text-xs">
              <HelpCircle size={15} /> Je bloque
            </button>
            <button
              disabled={!task.allow_postpone || postponesLeft <= 0 || busy}
              onClick={async () => { setBusy(true); await A.postponeTask(task, settings); await onStarted(); setBusy(false); toast(`Reporté de ${settings.postpone_minutes} min`); }}
              className="btn-soft text-xs">
              <SkipForward size={15} /> Reporter · {Math.max(0, postponesLeft)}
            </button>
          </div>
          {postponesLeft <= 0 && (
            <p className="mt-2 text-center text-[11px] text-muted">Tu as utilisé tes reports d’aujourd’hui.</p>
          )}
        </div>
      </section>

      {!!rest.length && (
        <section className="card p-4">
          <p className="label !mb-3">Ensuite</p>
          <ul className="space-y-2.5">
            {rest.slice(0, 4).map((t) => (
              <li key={t.id} className="flex items-center gap-3 text-sm">
                <span className="w-11 shrink-0 font-mono text-xs text-muted">{t.start_time ? hhmm(t.start_time) : '—'}</span>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: t.subject?.color ?? '#7C5CFF' }} />
                <span className="truncate text-white/70">{t.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Sheet open={blocked} onClose={() => setBlocked(false)} title="Qu’est-ce qui bloque ?"
             footer={
               <button className="btn-primary w-full"
                       onClick={async () => {
                         await A.reportBlocked(task, note, profile.id, null);
                         setBlocked(false); setNote('');
                         toast('Message envoyé à tes parents 📩');
                       }}>
                 Envoyer à mes parents
               </button>
             }>
        <p className="mb-3 text-sm leading-relaxed text-muted">
          Dis ce qui coince. C’est mille fois mieux que d’abandonner en silence — et ça ne te coûte aucun point.
        </p>
        <textarea className="field min-h-[110px]" value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Ex : je comprends pas l’exercice 3, j’ai pas le bon cahier…" />
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------- mode focus */
function Focus({ task, onDone }: { task: Task; onDone: (a: A.AwardResult | null) => void }) {
  const { settings, profile } = useApp();
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [finish, setFinish] = useState(false);
  const saveRef = useRef(0);

  useEffect(() => {
    const base = task.started_at ? Math.floor((Date.now() - new Date(task.started_at).getTime()) / 1000) : 0;
    setElapsed(Math.max(base, task.active_seconds));
  }, [task.id]);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      setElapsed((e) => {
        const n = e + 1;
        if (n - saveRef.current >= 30) { saveRef.current = n; A.saveActiveSeconds(task.id, n); }
        return n;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [paused, task.id]);

  if (!settings || !profile) return null;

  const goal = task.duration_min * 60;
  const minSec = minTimerSeconds(settings, task);
  const canFinish = elapsed >= minSec;
  const pct = Math.min(100, (elapsed / goal) * 100);
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const doneSubs = task.subtasks?.filter((s) => s.done).length ?? 0;

  return (
    <>
      <section className="card animate-rise p-5">
        <div className="flex items-center justify-between">
          <span className="chip !border-mint/30 !bg-mint/12 !text-mint">● En cours</span>
          <span className="chip">{humanDuration(task.duration_min)} prévues</span>
        </div>

        <h2 className="mt-3 text-xl font-black leading-tight">{task.title}</h2>

        <div className="mt-5 flex justify-center">
          <Ring pct={pct} size={216} stroke={13} color={canFinish ? '#2FD8A5' : '#7C5CFF'}>
            <div className="text-[44px] font-black tabular-nums leading-none">{mm}:{ss}</div>
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
              {canFinish ? 'objectif atteint' : `encore ${Math.ceil((minSec - elapsed) / 60)} min`}
            </div>
          </Ring>
        </div>

        <button onClick={() => setPaused((p) => !p)} className="btn-soft mx-auto mt-4 !px-5 text-sm">
          {paused ? <><Play size={15} /> Reprendre</> : <><Pause size={15} /> Pause</>}
        </button>

        {!!task.subtasks?.length && (
          <div className="mt-6">
            <div className="mb-2 flex justify-between text-[11px] font-semibold text-muted">
              <span>Étapes</span><span>{doneSubs}/{task.subtasks.length}</span>
            </div>
            <ul className="space-y-2">
              {task.subtasks.map((s) => (
                <li key={s.id}>
                  <button onClick={() => A.toggleSubtask(s.id, !s.done)}
                          className={clsx('flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left text-sm transition active:scale-[.99]',
                            s.done ? 'border-mint/25 bg-mint/[.07] text-muted line-through' : 'border-line bg-raised text-white/90')}>
                    <span className={clsx('grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition',
                      s.done ? 'border-mint bg-mint text-ink' : 'border-line')}>
                      {s.done && <Check size={12} strokeWidth={3.5} />}
                    </span>
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {task.link_url && (
          <a href={task.link_url} target="_blank" rel="noreferrer" className="btn-ghost mt-4 w-full text-sm">
            <ExternalLink size={16} /> Ouvrir la ressource
          </a>
        )}

        <button onClick={() => setFinish(true)} disabled={!canFinish}
                className={clsx('mt-5 w-full !py-4 text-lg', canFinish ? 'btn-mint' : 'btn-soft')}>
          {canFinish ? <><Check size={20} strokeWidth={3} /> J’ai fini</> : `Encore ${Math.ceil((minSec - elapsed) / 60)} min avant de valider`}
        </button>
        {!canFinish && (
          <p className="mt-2 text-center text-[11px] leading-relaxed text-muted">
            Le minuteur garantit que le temps est vraiment passé sur la tâche.
          </p>
        )}
      </section>

      <FinishSheet open={finish} onClose={() => setFinish(false)} task={task} onDone={onDone} />
    </>
  );
}

/* ---------------------------------------------------------- fin de tâche */
function FinishSheet({ open, onClose, task, onDone }: {
  open: boolean; onClose: () => void; task: Task; onDone: (a: A.AwardResult | null) => void;
}) {
  const { settings, profile } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!settings || !profile) return null;

  const needPhoto = requiresPhoto(settings, task);
  const needValid = requiresValidation(settings, task);
  const ready = !needPhoto || !!file;

  const submit = async () => {
    setBusy(true);
    try {
      const url = file ? await A.uploadProof(file, profile.id) : null;
      const res = await A.completeTask(task, settings, profile, { proofUrl: url, note, needsValidation: needValid });
      onClose(); setFile(null); setPreview(null); setNote('');
      onDone(res);
    } catch (e: any) {
      toast(e.message ?? 'Erreur à l’envoi', 'err');
    } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Tu as terminé ?"
           footer={
             <button onClick={submit} disabled={!ready || busy} className="btn-primary w-full !py-4">
               {busy ? 'Envoi…' : needValid ? 'Envoyer pour validation' : `Valider et gagner ${task.coins} ${settings.currency_emoji}`}
             </button>
           }>
      <div className="space-y-4">
        {needPhoto && (
          <div>
            <label className="label">Photo de ton travail <span className="text-coral">*</span></label>
            <label className="flex min-h-[130px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-raised p-4 text-center">
              {preview ? (
                <img src={preview} alt="" className="max-h-52 rounded-xl object-contain" />
              ) : (
                <><Camera size={26} className="text-muted" /><span className="text-sm text-muted">Prendre une photo du cahier</span></>
              )}
              <input type="file" accept="image/*" capture="environment" className="hidden"
                     onChange={(e) => {
                       const f = e.target.files?.[0] ?? null;
                       setFile(f);
                       setPreview(f ? URL.createObjectURL(f) : null);
                     }} />
            </label>
          </div>
        )}
        <div>
          <label className="label">Un mot (facultatif)</label>
          <textarea className="field min-h-[80px]" value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="Ce que tu as fait, ce qui était dur…" />
        </div>
        {needValid && (
          <p className="rounded-2xl border border-sun/25 bg-sun/[.08] px-3 py-2.5 text-xs leading-relaxed text-sun">
            Cette tâche demande la validation de tes parents. Tes points arrivent dès qu’ils confirment.
          </p>
        )}
      </div>
    </Sheet>
  );
}

/* ----------------------------------------------------- écran de récompense */
function AwardSheet({ award, badges, onClose }: { award: A.AwardResult | null; badges: string[]; onClose: () => void }) {
  const { settings } = useApp();
  if (!award || !settings) return null;
  return (
    <Sheet open onClose={onClose} title="Bien joué 🎉"
           footer={<button onClick={onClose} className="btn-primary w-full">Continuer</button>}>
      <div className="py-2 text-center">
        <div className="text-[64px] leading-none">{settings.currency_emoji}</div>
        <div className="mt-2 text-5xl font-black text-brand-soft">+{award.coins}</div>
        <p className="mt-1 text-sm text-muted">{settings.currency_name} gagnés</p>

        {!!award.bonuses.length && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {award.bonuses.map((b) => (
              <span key={b.label} className="chip !border-mint/30 !bg-mint/12 !text-mint">{b.label} +{b.pct} %</span>
            ))}
          </div>
        )}
        {award.perfectDay && (
          <div className="mt-4 rounded-2xl border border-sun/30 bg-sun/10 px-4 py-3">
            <p className="text-sm font-bold text-sun">💎 Journée parfaite</p>
            <p className="mt-0.5 text-xs text-white/70">Bonus de {settings.perfect_day_bonus} {settings.currency_emoji} et série prolongée</p>
          </div>
        )}
        {!!badges.length && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Badge débloqué</p>
            {badges.map((b) => (
              <div key={b} className="rounded-2xl border border-brand/30 bg-brand/12 px-4 py-3 text-sm font-bold text-brand-soft">{b}</div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------ journée finie */
function AllDone({ count }: { count: number }) {
  const { settings } = useApp();
  return (
    <section className="card animate-rise px-6 py-12 text-center">
      <div className="text-6xl">{count ? '🏆' : '🌤️'}</div>
      <h2 className="mt-4 text-2xl font-black">{count ? 'Journée terminée' : 'Rien de prévu'}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {count
          ? `${count} tâche${count > 1 ? 's' : ''} bouclée${count > 1 ? 's' : ''}. Le reste de la journée est à toi.`
          : 'Aucune tâche pour aujourd’hui. Profite, ou prends de l’avance.'}
      </p>
      <div className="mt-5 flex gap-2">
        <Link href="/quiz" className="btn-ghost flex-1 text-sm">🧠 Faire un quiz</Link>
        <Link href="/shop" className="btn-primary flex-1 text-sm">{settings?.currency_emoji} Boutique</Link>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ humeur */
function MoodPrompt() {
  const { profile } = useApp();
  const [done, setDone] = useState(true);
  const today = todayISO();

  useEffect(() => {
    if (!profile) return;
    supabase.from('moods').select('id').eq('child_id', profile.id).eq('day', today).maybeSingle()
      .then(({ data }) => setDone(!!data));
  }, [profile?.id, today]);

  if (done || !profile) return null;
  const faces = [{ m: 1, e: '😞' }, { m: 2, e: '😕' }, { m: 3, e: '😐' }, { m: 4, e: '🙂' }, { m: 5, e: '😄' }];

  return (
    <div className="card p-4">
      <p className="text-sm font-semibold">Comment tu te sens aujourd’hui ?</p>
      <div className="mt-3 flex justify-between gap-2">
        {faces.map((f) => (
          <button key={f.m}
                  onClick={async () => {
                    await supabase.from('moods').upsert({ child_id: profile.id, day: today, mood: f.m }, { onConflict: 'child_id,day' });
                    setDone(true);
                    if (f.m <= 2) { A.notify('mood', { mood: f.m }); toast('Merci de l’avoir dit 💜'); }
                    else toast('Noté 👍');
                  }}
                  className="flex-1 rounded-2xl border border-line bg-raised py-3 text-2xl transition active:scale-95">
            {f.e}
          </button>
        ))}
      </div>
    </div>
  );
}
