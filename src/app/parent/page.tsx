'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import ParentShell from '@/components/ParentShell';
import PushManager from '@/components/PushManager';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { useDay } from '@/lib/useDay';
import { useLive } from '@/lib/useLive';
import { todayISO, hhmm, nowMinutes, toMinutes, longDate } from '@/lib/dates';
import { progressOf, computeAward, levelOf, xpToday } from '@/lib/economy';
import { settleDay, adjustBalance, elapsedOf, notify } from '@/lib/actions';
import { KUDOS } from '@/lib/tone';
import { moodEmoji } from '@/lib/mood';
import { Loader, Bar, Stat, Sheet, Empty, toast } from '@/components/ui';
import type { Task, Redemption, Message, Mood } from '@/lib/types';

export default function ParentHome() { return <ParentShell><Dashboard /></ParentShell>; }

function Dashboard() {
  const { profile, child, settings, refreshChild } = useApp();
  const today = todayISO();
  const { tasks, loading, reload } = useDay(child?.id, today);
  const [pending, setPending] = useState<Redemption[]>([]);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [mood, setMood] = useState<Mood | null>(null);
  const [kudos, setKudos] = useState(false);
  const [wallet, setWallet] = useState(false);

  const load = async () => {
    if (!child || !profile) return;
    const [r, m, mo] = await Promise.all([
      supabase.from('redemptions').select('*').eq('child_id', child.id).eq('status', 'pending').order('created_at'),
      supabase.from('messages').select('*').eq('to_id', profile.id).is('read_at', null).order('created_at', { ascending: false }).limit(6),
      supabase.from('moods').select('*').eq('child_id', child.id).eq('day', today).maybeSingle(),
    ]);
    setPending((r.data ?? []) as Redemption[]);
    setMsgs((m.data ?? []) as Message[]);
    setMood((mo.data as Mood) ?? null);
  };
  useEffect(() => { load(); }, [child?.id, profile?.id]);

  useLive(['redemptions', 'messages', 'moods', 'ledger', 'child_items'], load, 'parent-home');

  const submitted = useMemo(() => tasks.filter((t) => t.status === 'submitted'), [tasks]);
  const doing = useMemo(() => tasks.find((t) => t.status === 'doing'), [tasks]);
  const late = useMemo(() => tasks.filter((t) => {
    const m = toMinutes(t.start_time);
    return t.status === 'todo' && m !== null && nowMinutes() > m + (settings?.parent_alert_after ?? 20);
  }), [tasks, settings]);

  if (loading || !child || !settings || !profile) return <Loader />;
  const prog = progressOf(tasks);
  const lvl = levelOf(child.xp, settings.xp_per_level);

  const validate = async (t: Task, ok: boolean) => {
    if (!ok) {
      await supabase.from('tasks').update({ status: 'todo', completed_at: null, proof_url: null }).eq('id', t.id);
      notify('validation', { taskId: t.id, ok: false, title: t.title });
      toast('Renvoyée', 'err');
    } else {
      const award = computeAward(settings, t, { onTime: true, streak: child.streak_current });
      await supabase.from('tasks').update({
        status: 'done', validated_at: new Date().toISOString(),
        coins_awarded: award.coins, xp_awarded: award.xp,
      }).eq('id', t.id);
      await settleDay(t, settings, child, award.coins, award.xp, `Tâche : ${t.title}`, t.id);
      notify('validation', { taskId: t.id, ok: true, title: t.title, coins: award.coins });
      toast(`+${award.coins} ${settings.currency_emoji}`);
    }
    await Promise.all([reload(), refreshChild()]);
  };

  const resolve = async (r: Redemption, approve: boolean) => {
    await supabase.from('redemptions').update({
      status: approve ? 'approved' : 'refused', resolved_at: new Date().toISOString(),
    }).eq('id', r.id);
    if (!approve) {
      await supabase.from('profiles').update({ coins: child.coins + r.cost_paid }).eq('id', child.id);
      await supabase.from('ledger').insert({
        child_id: child.id, amount: r.cost_paid, reason: `Annulé : ${r.reward_name}`, kind: 'reward',
      });
    }
    await supabase.from('messages').insert({
      from_id: profile.id, to_id: child.id, kind: 'system',
      body: approve ? `${r.reward_name} accordée !` : `${r.reward_name} refusée, points rendus.`,
      emoji: approve ? '🎁' : '↩️',
    });
    notify('kudos', { body: approve ? `${r.reward_name} accordée ! 🎁` : `${r.reward_name} refusée`, emoji: approve ? '🎁' : '↩️' });
    await Promise.all([load(), refreshChild()]);
  };

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <header className="flex items-center gap-3">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-3xl bg-grape-light text-3xl">
          {child.avatar_emoji}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-wide text-muted">{longDate(today)}</p>
          <h1 className="truncate text-2xl font-black text-ink">{child.display_name}</h1>
        </div>
        {mood && <span className="text-4xl">{moodEmoji(mood.code, mood.mood)}</span>}
      </header>

      <Presence doing={doing} />
      <PushManager />

      {!child.push_enabled && (
        <div className="card border-2 border-flame bg-flame-light p-4 text-center">
          <p className="font-extrabold text-flame-dark">🔕 {child.display_name} ne reçoit aucun rappel</p>
        </div>
      )}

      <div className="flex gap-2.5">
        <Stat emoji="✅" value={`${prog.done}/${prog.total}`} label="tâches" color={prog.pct === 100 ? '#1FC08A' : undefined} />
        <Stat emoji="⚡" value={xpToday(tasks)} label="XP jour" color="#F5A524" />
        <Stat emoji="🔥" value={child.streak_current} label="série" color="#F5A524" />
        <Stat emoji="⭐" value={lvl.level} label="niveau" color="#7C4DEE" />
      </div>
      <Bar pct={prog.pct} color={prog.pct === 100 ? '#1FC08A' : '#7C4DEE'} />

      <button onClick={() => setWallet(true)} className="card flex w-full items-center gap-3 p-4 no-select active:scale-[.99]">
        <span className="text-3xl">{settings.currency_emoji}</span>
        <span className="flex-1 text-left text-2xl font-black text-grape">{child.coins}</span>
        <span className="chip">✏️ Modifier</span>
      </button>

      {!!late.length && (
        <section className="card border-2 border-flame bg-flame-light p-4">
          <p className="font-black text-flame-dark">⏰ En retard</p>
          <ul className="mt-2 space-y-1">
            {late.map((t) => (
              <li key={t.id} className="font-bold text-ink">
                {hhmm(t.start_time)} · {t.title} <span className="text-flame-dark">+{nowMinutes() - toMinutes(t.start_time)!} min</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!!submitted.length && (
        <section className="space-y-3">
          <p className="text-lg font-black text-ink">👁️ À valider</p>
          {submitted.map((t) => (
            <div key={t.id} className="card p-4">
              <p className="font-extrabold text-ink">{t.title}</p>
              <p className="mt-1 text-xs font-bold text-muted">
                {Math.round(elapsedOf(t) / 60)} min travaillées
              </p>
              {t.proof_url && <img src={t.proof_url} alt="" className="mt-3 max-h-64 w-full rounded-3xl bg-soft object-contain" />}
              <div className="mt-3 flex gap-2.5">
                <button onClick={() => validate(t, false)} className="btn-flame flex-1">❌ Refaire</button>
                <button onClick={() => validate(t, true)} className="btn-leaf flex-1">✅ Valider</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {!!pending.length && (
        <section className="space-y-3">
          <p className="text-lg font-black text-ink">🎁 Demandes</p>
          {pending.map((r) => (
            <div key={r.id} className="card flex items-center gap-3 p-4">
              <span className="text-4xl">{r.reward_emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold text-ink">{r.reward_name}</p>
                <p className="text-sm font-bold text-muted">{r.cost_paid} {settings.currency_emoji}</p>
              </div>
              <button onClick={() => resolve(r, false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-flame-light text-xl no-select active:scale-90">❌</button>
              <button onClick={() => resolve(r, true)} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-leaf-light text-xl no-select active:scale-90">✅</button>
            </div>
          ))}
        </section>
      )}

      {!!msgs.length && (
        <section className="space-y-2.5">
          {msgs.map((m) => (
            <div key={m.id} className={clsx('card p-4', m.kind === 'blocked' && 'border-2 border-sun bg-sun-light')}>
              <p className="font-bold text-ink">{m.emoji} {m.body}</p>
              <button className="mt-2 text-xs font-black text-grape"
                      onClick={async () => { await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('id', m.id); load(); }}>
                Marquer lu
              </button>
            </div>
          ))}
        </section>
      )}

      <section>
        <p className="mb-3 text-lg font-black text-ink">📋 Sa journée</p>
        {tasks.length === 0 ? <Empty emoji="📭" title="Rien de prévu" /> : (
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li key={t.id} className="card flex items-center gap-3 px-4 py-3">
                <span className="w-12 shrink-0 text-sm font-black tabular-nums text-ink">{t.start_time ? hhmm(t.start_time) : '—'}</span>
                <span className={clsx('flex-1 truncate font-bold text-ink', t.status === 'done' && 'text-muted line-through')}>{t.title}</span>
                <span className="shrink-0 text-xl">
                  {t.status === 'done' ? '✅' : t.status === 'doing' ? '▶️' : t.status === 'submitted' ? '⏳' : '⬜'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex gap-2.5">
        <button onClick={() => setKudos(true)} className="btn-rose flex-1">💜 Encourager</button>
        <Link href="/parent/agenda" className="btn-grape flex-1">➕ Tâche</Link>
      </div>

      <KudosSheet open={kudos} onClose={() => setKudos(false)} />
      <WalletSheet open={wallet} onClose={() => setWallet(false)} />
    </main>
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
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  if (!child || !settings) return null;

  const apply = async (sign: number) => {
    const n = Math.abs(parseInt(amount, 10) || 0);
    if (!n) return;
    await adjustBalance(child, sign * n, reason);
    await refreshChild();
    setAmount(''); setReason(''); onClose();
    toast(`${sign > 0 ? '+' : '−'}${n} ${settings.currency_emoji}`);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Modifier le solde">
      <div className="text-center">
        <p className="text-5xl font-black text-grape">{child.coins}</p>
        <p className="mt-1 font-extrabold text-muted">{settings.currency_name}</p>
      </div>
      <div className="mt-5 space-y-3">
        <input className="field text-center text-2xl" type="number" inputMode="numeric" value={amount}
               onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        <div className="flex flex-wrap justify-center gap-2">
          {[10, 25, 50, 100, 250].map((n) => (
            <button key={n} onClick={() => setAmount(String(n))} className="chip">{n}</button>
          ))}
        </div>
        <input className="field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motif (facultatif)" />
        <div className="flex gap-2.5">
          <button onClick={() => apply(-1)} className="btn-flame flex-1">− Retirer</button>
          <button onClick={() => apply(1)} className="btn-leaf flex-1">+ Ajouter</button>
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
