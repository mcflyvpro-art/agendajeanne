'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import ParentShell from '@/components/ParentShell';
import ParentInbox from '@/components/ParentInbox';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { useDay } from '@/lib/useDay';
import { useLive } from '@/lib/useLive';
import { todayISO, hhmm, nowMinutes, toMinutes, longDate, relativeDay } from '@/lib/dates';
import { progressOf, computeAward, levelOf, xpToday } from '@/lib/economy';
import { settleDay, adjustBalance, elapsedOf, notify, resolveRedemption, removeProof, wasOnTime } from '@/lib/actions';
import { KUDOS } from '@/lib/tone';
import { moodEmoji } from '@/lib/mood';
import { Loader, Bar, Sheet, Empty, NumberField, SectionTitle, Lightbox, useAction, toast } from '@/components/ui';
import type { Task, Redemption, Mood } from '@/lib/types';

export default function ParentHome() { return <ParentShell><Dashboard /></ParentShell>; }

function Dashboard() {
  const { profile, child, settings, refreshChild } = useApp();
  const today = todayISO();
  const { tasks, loading, reload } = useDay(child?.id, today);
  const [pending, setPending] = useState<Redemption[]>([]);
  const [mood, setMood] = useState<Mood | null>(null);
  const [kudos, setKudos] = useState(false);
  const [wallet, setWallet] = useState(false);
  const [submitted, setSubmitted] = useState<Task[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!child || !profile) return;
    const [r, mo, sub] = await Promise.all([
      supabase.from('redemptions').select('*').eq('child_id', child.id).eq('status', 'pending').order('created_at'),
      // Plusieurs humeurs par jour sont possibles depuis v3 : .maybeSingle() échouait
      // dès qu'il y en avait plus d'une, et l'emoji n'apparaissait plus jamais.
      supabase.from('moods').select('*').eq('child_id', child.id).eq('day', today)
        .order('created_at', { ascending: false }).limit(1),
      // Tous jours confondus : une tâche envoyée la veille au soir disparaissait
      // du tableau de bord le lendemain, avec sa photo, sans pouvoir être validée.
      supabase.from('tasks').select('*').eq('child_id', child.id).eq('status', 'submitted')
        .order('day').order('completed_at'),
    ]);
    setPending((r.data ?? []) as Redemption[]);
    setMood(((mo.data as Mood[]) ?? [])[0] ?? null);
    setSubmitted((sub.data ?? []) as Task[]);
  };
  useEffect(() => { load(); }, [child?.id, profile?.id]);

  useLive(['redemptions', 'moods', 'ledger', 'child_items', 'tasks'], load, 'parent-home');

  const doing = useMemo(() => tasks.find((t) => t.status === 'doing'), [tasks]);

  if (loading || !child || !settings || !profile) return <Loader />;
  const prog = progressOf(tasks);
  const lvl = levelOf(child.xp, settings.xp_per_level);
  const isLate = (t: Task) => {
    const m = toMinutes(t.start_time);
    return t.status === 'todo' && m !== null && nowMinutes() > m + (settings.parent_alert_after ?? 20);
  };

  /**
   * Garde sur `submitted` : validée depuis un autre écran (ou double appui),
   * la tâche n'est ni recréditée ni renvoyée une seconde fois. La photo a
   * servi : elle est supprimée du stockage dans les deux cas.
   */
  const validate = async (t: Task, ok: boolean) => {
    setBusyId(t.id);
    try {
      if (!ok) {
        const { data } = await supabase.from('tasks').update({ status: 'todo', completed_at: null, proof_url: null })
          .eq('id', t.id).eq('status', 'submitted').select('id');
        if (data?.length) {
          removeProof(t.proof_url);
          notify('validation', { taskId: t.id, ok: false, title: t.title });
          toast('Renvoyée', 'err');
        } else toast('Déjà traitée');
      } else {
        const award = computeAward(settings, t, { onTime: wasOnTime(t), streak: child.streak_current });
        const { data } = await supabase.from('tasks').update({
          status: 'done', validated_at: new Date().toISOString(), proof_url: null,
          coins_awarded: award.coins, xp_awarded: award.xp,
        }).eq('id', t.id).eq('status', 'submitted').select('id');
        if (data?.length) {
          removeProof(t.proof_url);
          await settleDay(t, settings, child, award.coins, award.xp, `Tâche : ${t.title}`, t.id);
          notify('validation', { taskId: t.id, ok: true, title: t.title, coins: award.coins });
          toast(`+${award.coins} ${settings.currency_emoji}`);
        } else toast('Déjà traitée');
      }
      await Promise.all([reload(), load(), refreshChild()]);
    } finally { setBusyId(null); }
  };

  const resolve = async (r: Redemption, approve: boolean) => {
    if (busyId) return;
    setBusyId(r.id);
    try {
      if (!(await resolveRedemption(r, approve, profile.id))) toast('Déjà traitée');
      else toast(approve ? 'Accordée 🎁' : 'Refusée, points rendus');
      await Promise.all([load(), refreshChild()]);
    } finally { setBusyId(null); }
  };

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <header className="flex items-center gap-3">
        <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-3xl bg-grape-light text-3xl">
          {child.avatar_emoji}
          {mood && (
            <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-card text-lg shadow-float"
                  title="Humeur du jour">{moodEmoji(mood.code, mood.mood)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-wide text-muted">{longDate(today)}</p>
          <h1 className="truncate text-2xl font-black leading-tight text-ink">{child.display_name}</h1>
        </div>
        <ParentInbox />
      </header>

      <Presence doing={doing} />

      <section className="card p-4">
        <div className="grid grid-cols-4 gap-1 text-center">
          <Metric value={`${prog.done}/${prog.total}`} label="tâches" color={prog.pct === 100 ? '#1FC08A' : '#2E2445'} />
          <Metric value={xpToday(tasks)} label="XP jour" color="#C77F12" />
          <Metric value={`🔥 ${child.streak_current}`} label="série" color="#C77F12" />
          <Metric value={lvl.level} label="niveau" color="#7C4DEE" />
        </div>
        <Bar pct={prog.pct} color={prog.pct === 100 ? '#1FC08A' : '#7C4DEE'} height={10} className="mt-3.5" />
        <button onClick={() => setWallet(true)}
                className="mt-3.5 flex w-full items-center gap-3 rounded-3xl bg-soft px-4 py-3 no-select active:scale-[.99]">
          <span className="text-2xl">{settings.currency_emoji}</span>
          <span className="flex-1 text-left">
            <span className="block text-xl font-black leading-tight text-grape tabular-nums">{child.coins}</span>
            <span className="block text-xs font-bold text-muted">{settings.currency_name} sur son compte</span>
          </span>
          <span className="chip">✏️ Ajuster</span>
        </button>
      </section>

      {!!submitted.length && (
        <section>
          <SectionTitle right={<span className="chip !border-sun !bg-sun-light !text-sun-dark">{submitted.length}</span>}>
            👁️ À valider
          </SectionTitle>
          <div className="space-y-3">
            {submitted.map((t) => (
              <div key={t.id} className="card p-4">
                <p className="font-extrabold leading-snug text-ink">{t.title}</p>
                <p className="mt-1 text-xs font-bold text-muted">
                  {t.day !== today && <span className="capitalize">{relativeDay(t.day)} · </span>}
                  {Math.round(elapsedOf(t) / 60)} min travaillées · {t.coins} {settings.currency_emoji}
                </p>
                {t.proof_url ? (
                  <button onClick={() => setPhoto(t.proof_url)} className="relative mt-3 block w-full overflow-hidden rounded-3xl bg-soft">
                    <img src={t.proof_url} alt="Photo envoyée" className="max-h-56 w-full object-contain" />
                    <span className="absolute bottom-2 right-2 rounded-full bg-ink/70 px-3 py-1 text-xs font-black text-white backdrop-blur">🔍 Agrandir</span>
                  </button>
                ) : <p className="mt-3 rounded-2xl bg-soft px-4 py-3 text-sm font-bold text-muted">Pas de photo</p>}
                <div className="mt-3 flex gap-2.5">
                  <button onClick={() => validate(t, false)} disabled={busyId === t.id} className="btn-flame flex-1">↩️ À refaire</button>
                  <button onClick={() => validate(t, true)} disabled={busyId === t.id} className="btn-leaf flex-1">✅ Valider</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!!pending.length && (
        <section>
          <SectionTitle>🎁 Demandes</SectionTitle>
          <div className="space-y-2.5">
            {pending.map((r) => (
              <div key={r.id} className="card flex items-center gap-3 p-4">
                <span className="text-4xl">{r.reward_emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-extrabold text-ink">{r.reward_name}</p>
                  <p className="text-sm font-bold text-muted">{r.cost_paid} {settings.currency_emoji}</p>
                </div>
                <button onClick={() => resolve(r, false)} aria-label="Refuser" disabled={busyId === r.id}
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-flame-light text-xl no-select active:scale-90">❌</button>
                <button onClick={() => resolve(r, true)} aria-label="Accorder" disabled={busyId === r.id}
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-leaf-light text-xl no-select active:scale-90">✅</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle right={<Link href="/parent/agenda" className="chip !border-grape !text-grape">Agenda ›</Link>}>
          📋 Sa journée
        </SectionTitle>
        {tasks.length === 0 ? (
          <Empty emoji="📭" title="Rien de prévu" hint="Ajoute une tâche ou une routine depuis l’agenda."
                 action={<Link href="/parent/agenda" className="btn-grape">➕ Ajouter une tâche</Link>} />
        ) : (
          <ul className="card divide-y-2 divide-line overflow-hidden">
            {tasks.map((t) => {
              const late = isLate(t);
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={clsx('w-12 shrink-0 text-sm font-black tabular-nums', late ? 'text-flame' : 'text-ink')}>
                    {t.start_time ? hhmm(t.start_time) : 'libre'}
                  </span>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.subject?.color ?? '#7C4DEE' }} />
                  <span className={clsx('min-w-0 flex-1 truncate font-bold text-ink', t.status === 'done' && 'text-muted line-through')}>
                    {t.title}
                  </span>
                  {late ? <span className="shrink-0 rounded-full bg-flame-light px-2 py-0.5 text-[11px] font-black text-flame-dark">en retard</span>
                    : <span className="shrink-0 text-lg">
                        {t.status === 'done' ? '✅' : t.status === 'doing' ? '▶️' : t.status === 'submitted' ? '⏳' : t.status === 'missed' ? '⌛' : '⬜'}
                      </span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="flex gap-2.5">
        <button onClick={() => setKudos(true)} className="btn-rose flex-1">💜 Encourager</button>
        <Link href="/parent/agenda" className="btn-grape flex-1">➕ Tâche</Link>
      </div>

      <KudosSheet open={kudos} onClose={() => setKudos(false)} />
      <WalletSheet open={wallet} onClose={() => setWallet(false)} />
      <Lightbox src={photo} onClose={() => setPhoto(null)} />
    </main>
  );
}

function Metric({ value, label, color }: { value: React.ReactNode; label: string; color: string }) {
  return (
    <div>
      <div className="text-xl font-black tabular-nums leading-tight" style={{ color }}>{value}</div>
      <div className="mt-0.5 text-[10px] font-black uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------- présence -- */
/**
 * Affiche uniquement l'état d'une tâche en cours, qui est fiable : il vient du
 * minuteur, écrit en base à chaque changement de visibilité. L'ancien indicateur
 * « sur l'app / vue il y a X » reposait sur un ping périodique trop imprécis
 * pour être affiché, il a été retiré.
 */
function Presence({ doing }: { doing?: Task }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  if (!doing) return null;

  const sec = elapsedOf(doing);
  const mm = String(Math.floor(sec / 60)).padStart(2, '0');
  const ss = String(sec % 60).padStart(2, '0');
  const running = doing.timer_running;

  return (
    <section className={clsx('card border-2 p-4', running ? 'border-leaf bg-leaf-light' : 'border-sun bg-sun-light')}>
      <div className="flex items-center gap-3">
        <span className="text-3xl">{running ? '▶️' : '⏸️'}</span>
        <div className="min-w-0 flex-1">
          <p className={clsx('text-sm font-black', running ? 'text-leaf-dark' : 'text-sun-dark')}>
            {running ? 'Travaille en ce moment' : 'En pause — a quitté l’app'}
          </p>
          <p className="truncate font-extrabold text-ink">{doing.title}</p>
        </div>
        <span className="shrink-0 text-2xl font-black tabular-nums text-ink">{mm}:{ss}</span>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- solde --- */
function WalletSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { child, settings, refreshChild } = useApp();
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');
  const [busy, run] = useAction();
  if (!child || !settings) return null;

  const apply = (sign: number) => run(async () => {
    const n = Math.abs(amount);
    if (!n) { toast('Indique un montant', 'err'); return; }
    await adjustBalance(child, sign * n, reason);
    await refreshChild();
    setAmount(0); setReason(''); onClose();
    toast(`${sign > 0 ? '+' : '−'}${n} ${settings.currency_emoji}`);
  });

  return (
    <Sheet open={open} onClose={onClose} title="Modifier le solde">
      <div className="text-center">
        <p className="text-5xl font-black text-grape">{child.coins}</p>
        <p className="mt-1 font-extrabold text-muted">{settings.currency_name}</p>
      </div>
      <div className="mt-5 space-y-3">
        <NumberField value={amount} min={0} onChange={setAmount} className="text-center text-2xl" />
        <div className="flex flex-wrap justify-center gap-2">
          {[10, 25, 50, 100, 250].map((n) => (
            <button key={n} onClick={() => setAmount(n)} className="chip">{n}</button>
          ))}
        </div>
        <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif (facultatif)" />
        <div className="flex gap-2.5">
          <button onClick={() => apply(-1)} disabled={busy} className="btn-flame flex-1">− Retirer</button>
          <button onClick={() => apply(1)} disabled={busy} className="btn-leaf flex-1">+ Ajouter</button>
        </div>
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------- kudos ---- */
function KudosSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, child } = useApp();
  const [custom, setCustom] = useState('');
  const [sent, setSent] = useState<string | null>(null);

  const send = (emoji: string, body: string) => {
    if (!profile || !child || !body.trim() || sent) return;
    setSent(body);
    toast('Envoyé 💜');
    setTimeout(() => { setCustom(''); setSent(null); onClose(); }, 220);
    (async () => {
      try {
        await supabase.from('messages').insert({ from_id: profile.id, to_id: child.id, kind: 'kudos', body, emoji });
        await notify('kudos', { body, emoji });
      } catch { toast('Non envoyé', 'err'); }
    })();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Encourager">
      <div className="grid grid-cols-2 gap-2.5">
        {KUDOS.map((k) => (
          <button key={k.text} onClick={() => send(k.emoji, k.text)}
                  className={clsx('tile px-3 py-4 text-center no-select active:scale-95',
                    sent === k.text && 'border-leaf bg-leaf-light')}>
            <div className="text-3xl">{k.emoji}</div>
            <div className="mt-1.5 text-sm font-extrabold leading-snug text-ink">{k.text}</div>
          </button>
        ))}
      </div>
      <div className="mt-5">
        <textarea className="field min-h-[90px]" value={custom} onChange={(e) => setCustom(e.target.value)}
                  placeholder="Ton message…" />
        <button disabled={!custom.trim() || !!sent} onClick={() => send('💜', custom)} className="btn-grape mt-3 w-full">
          Envoyer
        </button>
      </div>
    </Sheet>
  );
}
