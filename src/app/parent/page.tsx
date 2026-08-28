'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Check, X, Send, AlertTriangle, Wifi, WifiOff, MessageSquare, Bell } from 'lucide-react';
import ParentShell from '@/components/ParentShell';
import PushManager from '@/components/PushManager';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { useDay } from '@/lib/useDay';
import { todayISO, hhmm, nowMinutes, toMinutes, longDate } from '@/lib/dates';
import { progressOf, computeAward, levelOf } from '@/lib/economy';
import { settleDay } from '@/lib/actions';
import { KUDOS } from '@/lib/tone';
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

  const load = async () => {
    if (!child) return;
    const [r, m, mo] = await Promise.all([
      supabase.from('redemptions').select('*').eq('child_id', child.id).eq('status', 'pending').order('created_at'),
      supabase.from('messages').select('*').eq('to_id', profile!.id).is('read_at', null).order('created_at', { ascending: false }).limit(8),
      supabase.from('moods').select('*').eq('child_id', child.id).eq('day', today).maybeSingle(),
    ]);
    setPending((r.data ?? []) as Redemption[]);
    setMsgs((m.data ?? []) as Message[]);
    setMood((mo.data as Mood) ?? null);
  };
  useEffect(() => { load(); }, [child?.id]);

  useEffect(() => {
    if (!child) return;
    const ch = supabase.channel('parent-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'redemptions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'moods' }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [child?.id]);

  const submitted = useMemo(() => tasks.filter((t) => t.status === 'submitted'), [tasks]);
  const doing = useMemo(() => tasks.find((t) => t.status === 'doing'), [tasks]);
  const late = useMemo(() => tasks.filter((t) => {
    const m = toMinutes(t.start_time);
    return t.status === 'todo' && m !== null && nowMinutes() > m + (settings?.parent_alert_after ?? 20);
  }), [tasks, settings]);

  if (loading || !child || !settings || !profile) return <Loader />;

  const prog = progressOf(tasks);
  const lvl = levelOf(child.xp, settings.xp_per_level);
  const seenMin = child.last_seen_at ? Math.round((Date.now() - new Date(child.last_seen_at).getTime()) / 60000) : null;
  const online = seenMin !== null && seenMin < 6;

  const validate = async (t: Task, ok: boolean) => {
    if (!ok) {
      await supabase.from('tasks').update({ status: 'todo', completed_at: null, proof_url: null }).eq('id', t.id);
      toast('Renvoyée à Jeanne', 'err');
    } else {
      const award = computeAward(settings, t, { onTime: true, streak: child.streak_current });
      await supabase.from('tasks').update({
        status: 'done', validated_at: new Date().toISOString(),
        coins_awarded: award.coins, xp_awarded: award.xp,
      }).eq('id', t.id);
      await settleDay(t, settings, child, award.coins, award.xp, `Tâche : ${t.title}`, t.id);
      toast(`Validée · +${award.coins} ${settings.currency_emoji}`);
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
        child_id: child.id, amount: r.cost_paid, reason: `Remboursement : ${r.reward_name}`, kind: 'reward',
      });
    }
    await supabase.from('messages').insert({
      from_id: profile.id, to_id: child.id, kind: 'system',
      body: approve ? `Récompense accordée : ${r.reward_name} 🎉` : `Récompense refusée : ${r.reward_name}. Tes points t’ont été rendus.`,
      emoji: approve ? '🎁' : '↩️',
    });
    await Promise.all([load(), refreshChild()]);
    toast(approve ? 'Accordée 🎁' : 'Refusée, points rendus');
  };

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pb-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{longDate(today)}</p>
          <h1 className="text-2xl font-black tracking-tight">{child.display_name} {child.avatar_emoji}</h1>
        </div>
        <span className={clsx('chip', online ? '!border-mint/30 !bg-mint/10 !text-mint' : '!text-muted')}>
          {online ? <><Wifi size={12} /> en ligne</> : <><WifiOff size={12} /> {seenMin === null ? 'jamais vue' : seenMin < 60 ? `${seenMin} min` : `${Math.round(seenMin / 60)} h`}</>}
        </span>
      </header>

      <PushManager />

      {!child.push_enabled && (
        <div className="card border-coral/35 bg-coral/[.09] p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-coral"><Bell size={15} /> Jeanne ne reçoit aucun rappel</p>
          <p className="mt-1.5 text-xs leading-relaxed text-white/70">
            Les notifications ne sont pas activées sur son iPhone. Sans ça, tout le système de rappels est inopérant —
            l’app doit être installée sur son écran d’accueil et les notifications autorisées.
          </p>
        </div>
      )}

      <div className="flex gap-2.5">
        <Stat emoji="✅" value={`${prog.done}/${prog.total}`} label="aujourd’hui" color={prog.pct === 100 ? '#2FD8A5' : undefined} />
        <Stat emoji="🔥" value={child.streak_current} label="série" color="#FFC44D" />
        <Stat emoji={settings.currency_emoji} value={child.coins} label="solde" color="#A896FF" />
        <Stat emoji="⭐" value={lvl.level} label="niveau" />
      </div>
      <Bar pct={prog.pct} color={prog.pct === 100 ? '#2FD8A5' : '#7C5CFF'} />

      {doing && (
        <section className="card border-mint/30 bg-mint/[.06] p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-mint">● En train de travailler</p>
          <p className="mt-1.5 text-lg font-black leading-tight">{doing.title}</p>
          <p className="mt-0.5 text-xs text-muted">
            Depuis {doing.started_at ? Math.round((Date.now() - new Date(doing.started_at).getTime()) / 60000) : 0} min
            {' · '}{doing.duration_min} min prévues
          </p>
        </section>
      )}

      {!!late.length && (
        <section className="card border-coral/35 bg-coral/[.08] p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-coral"><AlertTriangle size={15} /> En retard</p>
          <ul className="mt-2 space-y-1">
            {late.map((t) => (
              <li key={t.id} className="text-sm text-white/85">
                {hhmm(t.start_time)} · {t.title}
                <span className="ml-2 text-xs text-coral">+{nowMinutes() - toMinutes(t.start_time)!} min</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {mood && mood.mood <= 2 && (
        <section className="card border-sky/30 bg-sky/[.07] p-4">
          <p className="text-sm font-bold text-sky">💭 Humeur basse aujourd’hui</p>
          <p className="mt-1 text-xs leading-relaxed text-white/70">
            Elle a déclaré {['', 'très mal', 'pas bien', '', '', ''][mood.mood]}. {mood.note ? `« ${mood.note} »` : 'Un mot lui ferait sûrement du bien.'}
          </p>
        </section>
      )}

      {!!submitted.length && (
        <section>
          <h2 className="label">À valider · {submitted.length}</h2>
          <ul className="space-y-2.5">
            {submitted.map((t) => (
              <li key={t.id} className="card p-4">
                <p className="font-bold leading-snug">{t.title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  Terminée à {t.completed_at ? new Date(t.completed_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}
                  {' · '}{Math.round(t.active_seconds / 60)} min de travail effectif
                </p>
                {t.child_note && <p className="mt-2 rounded-xl bg-raised px-3 py-2 text-sm italic text-white/75">« {t.child_note} »</p>}
                {t.proof_url && <img src={t.proof_url} alt="preuve" className="mt-2 max-h-64 w-full rounded-xl object-contain bg-raised" />}
                <div className="mt-3 flex gap-2">
                  <button onClick={() => validate(t, false)} className="btn-danger flex-1 text-sm"><X size={15} /> À refaire</button>
                  <button onClick={() => validate(t, true)} className="btn-mint flex-1 text-sm"><Check size={15} /> Valider</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!!pending.length && (
        <section>
          <h2 className="label">Demandes de récompense · {pending.length}</h2>
          <ul className="space-y-2.5">
            {pending.map((r) => (
              <li key={r.id} className="card flex items-center gap-3 p-4">
                <span className="text-3xl">{r.reward_emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{r.reward_name}</p>
                  <p className="text-xs text-muted">{r.cost_paid} {settings.currency_emoji} déjà débités</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button onClick={() => resolve(r, false)} className="btn-danger h-9 w-9 !rounded-full !p-0"><X size={15} /></button>
                  <button onClick={() => resolve(r, true)} className="btn-mint h-9 w-9 !rounded-full !p-0"><Check size={15} /></button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!!msgs.length && (
        <section>
          <h2 className="label"><MessageSquare size={12} className="mb-0.5 inline" /> Messages de Jeanne</h2>
          <ul className="space-y-2">
            {msgs.map((m) => (
              <li key={m.id} className={clsx('card p-3.5', m.kind === 'blocked' && 'border-sun/35 bg-sun/[.07]')}>
                <p className="text-sm leading-snug">{m.emoji} {m.body}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-muted">
                    {new Date(m.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button className="text-[11px] font-semibold text-brand-soft"
                          onClick={async () => { await supabase.from('messages').update({ read_at: new Date().toISOString() }).eq('id', m.id); load(); }}>
                    marquer lu
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="label">Journée de Jeanne</h2>
        {tasks.length === 0 ? (
          <Empty emoji="📭" title="Rien de prévu" hint="Va dans Agenda pour construire sa journée." />
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li key={t.id} className="card flex items-center gap-3 px-4 py-3">
                <span className="w-11 shrink-0 font-mono text-xs text-muted">{t.start_time ? hhmm(t.start_time) : '~'}</span>
                <span className={clsx('flex-1 truncate text-sm', (t.status === 'done') && 'text-muted line-through')}>{t.title}</span>
                <span className={clsx('shrink-0 text-[11px] font-bold',
                  t.status === 'done' ? 'text-mint' : t.status === 'doing' ? 'text-mint' :
                  t.status === 'submitted' ? 'text-sun' : 'text-muted')}>
                  {t.status === 'done' ? '✓' : t.status === 'doing' ? '●' : t.status === 'submitted' ? '⏳' : '—'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex gap-2">
        <button onClick={() => setKudos(true)} className="btn-primary flex-1"><Send size={16} /> Encourager</button>
        <Link href="/parent/agenda" className="btn-ghost flex-1">Construire sa journée</Link>
      </div>

      <KudosSheet open={kudos} onClose={() => setKudos(false)} />
    </main>
  );
}

function KudosSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, child } = useApp();
  const [custom, setCustom] = useState('');
  const [sent, setSent] = useState<string | null>(null);

  /**
   * Envoi optimiste : la feuille se referme immédiatement et le réseau part en
   * arrière-plan. Attendre l'insertion puis l'appel de notification gelait
   * l'interface une à trois secondes, pendant lesquelles les touches
   * semblaient ne pas répondre.
   */
  const send = (emoji: string, body: string) => {
    if (!profile || !child || !body.trim() || sent) return;
    setSent(body);
    toast('Envoyé 💜');
    setTimeout(() => { setCustom(''); setSent(null); onClose(); }, 220);

    (async () => {
      try {
        await supabase.from('messages').insert({ from_id: profile.id, to_id: child.id, kind: 'kudos', body, emoji });
        const { data } = await supabase.auth.getSession();
        await fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
          body: JSON.stringify({ kind: 'kudos', body, emoji }),
        });
      } catch {
        toast('Message non envoyé, réessaie', 'err');
      }
    })();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Envoyer un encouragement">
      <p className="mb-4 text-sm leading-relaxed text-muted">
        Elle le reçoit tout de suite en notification. C’est bête, mais ça marche.
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {KUDOS.map((k) => (
          <button key={k.text} onClick={() => send(k.emoji, k.text)}
                  className={clsx('card px-3 py-4 text-center text-sm font-semibold transition active:scale-[.95]',
                    sent === k.text && 'border-mint/50 bg-mint/15')}>
            <div className="text-2xl">{k.emoji}</div>
            <div className="mt-1.5 leading-snug">{k.text}</div>
          </button>
        ))}
      </div>
      <div className="mt-5">
        <label className="label">Ou écris ton propre message</label>
        <textarea className="field min-h-[80px]" value={custom} onChange={(e) => setCustom(e.target.value)}
                  placeholder="Un mot rien que pour elle…" />
        <button disabled={!custom.trim() || !!sent} onClick={() => send('💜', custom)} className="btn-primary mt-3 w-full">
          Envoyer
        </button>
      </div>
    </Sheet>
  );
}
