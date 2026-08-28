'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import ChildShell from '@/components/ChildShell';
import PushManager from '@/components/PushManager';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { levelOf } from '@/lib/economy';
import { weekStart, todayISO } from '@/lib/dates';
import { Loader, Ring, Stat, Empty, toast } from '@/components/ui';
import type { Badge, LedgerRow, Contract, Message } from '@/lib/types';

export default function MePage() { return <ChildShell><Me /></ChildShell>; }

function Me() {
  const { profile, settings, signOut } = useApp();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [contract, setContract] = useState<Contract | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [b, o, l, c, m, t] = await Promise.all([
        supabase.from('badges').select('*'),
        supabase.from('earned_badges').select('code').eq('child_id', profile.id),
        supabase.from('ledger').select('*').eq('child_id', profile.id).order('created_at', { ascending: false }).limit(15),
        supabase.from('contracts').select('*').eq('child_id', profile.id).eq('week_start', weekStart(todayISO())).maybeSingle(),
        supabase.from('messages').select('*').eq('to_id', profile.id).order('created_at', { ascending: false }).limit(8),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('child_id', profile.id).eq('status', 'done'),
      ]);
      setBadges((b.data ?? []) as Badge[]);
      setOwned(new Set((o.data ?? []).map((x: any) => x.code)));
      setLedger((l.data ?? []) as LedgerRow[]);
      setContract((c.data as Contract) ?? null);
      setMsgs((m.data ?? []) as Message[]);
      setDoneCount(t.count ?? 0);
      setLoading(false);
    })();
  }, [profile?.id]);

  if (loading || !profile || !settings) return <Loader />;
  const lvl = levelOf(profile.xp, settings.xp_per_level);

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <section className="card p-6 text-center">
        <div className="flex justify-center">
          <Ring pct={lvl.pct} size={170} stroke={16} color="#7C4DEE">
            <div className="text-5xl">{profile.avatar_emoji}</div>
            <div className="mt-1 text-2xl font-black text-grape">Niv. {lvl.level}</div>
          </Ring>
        </div>
        <h1 className="mt-4 text-2xl font-black text-ink">{profile.display_name}</h1>
        <p className="text-lg font-extrabold text-grape">{lvl.title}</p>
        <p className="mt-2 font-bold text-muted">{lvl.into} / {lvl.per} XP</p>
      </section>

      <div className="flex gap-2.5">
        <Stat emoji="🔥" value={profile.streak_current} label="série" color="#F5A524" />
        <Stat emoji="🏅" value={profile.streak_best} label="record" />
        <Stat emoji="✅" value={doneCount} label="tâches" color="#1FC08A" />
        <Stat emoji={settings.currency_emoji} value={profile.coins} label="solde" color="#7C4DEE" />
      </div>

      <PushManager />

      {settings.goal_title && (
        <section className="card bg-rose-light p-5 text-center">
          <p className="text-4xl">🎯</p>
          <p className="mt-2 text-xl font-black text-ink">{settings.goal_title}</p>
          {settings.goal_date && (
            <p className="mt-1 font-extrabold text-rose-dark">
              J−{Math.max(0, Math.ceil((new Date(settings.goal_date).getTime() - Date.now()) / 86400000))}
            </p>
          )}
        </section>
      )}

      {contract && (
        <section className="card border-2 border-grape p-5">
          <p className="text-3xl">🤝</p>
          <p className="mt-2 text-xl font-black text-ink">{contract.title}</p>
          <p className="mt-1 font-bold text-muted">🎁 {contract.reward_text}</p>
          {contract.status === 'proposed' ? (
            <button className="btn-grape mt-4 w-full"
                    onClick={async () => {
                      await supabase.from('contracts').update({ status: 'accepted' }).eq('id', contract.id);
                      setContract({ ...contract, status: 'accepted' }); toast('Contrat accepté');
                    }}>
              J’accepte
            </button>
          ) : (
            <p className="mt-3 chip !border-leaf !bg-leaf-light !text-leaf-dark">
              {contract.status === 'achieved' ? '🏆 Réussi' : '✅ En cours'}
            </p>
          )}
        </section>
      )}

      {!!msgs.length && (
        <ul className="space-y-2.5">
          {msgs.map((m) => (
            <li key={m.id} className="card flex items-start gap-3 p-4">
              <span className="text-3xl">{m.emoji ?? '💬'}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-ink">{m.body}</p>
                <p className="mt-1 text-xs font-bold text-muted">
                  {new Date(m.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section>
        <p className="mb-3 text-lg font-black text-ink">🏆 Badges · {owned.size}/{badges.length}</p>
        <div className="grid grid-cols-4 gap-2.5">
          {badges.map((b) => {
            const has = owned.has(b.code);
            return (
              <div key={b.code}
                   className={clsx('tile flex flex-col items-center gap-1 px-1 py-3 text-center',
                     has ? 'border-grape bg-grape-light' : 'opacity-40')}>
                <span className="text-3xl">{has ? b.emoji : '🔒'}</span>
                <span className="text-[9px] font-black leading-tight text-ink">{b.name}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <p className="mb-3 text-lg font-black text-ink">💰 Historique</p>
        {ledger.length === 0 ? <Empty emoji="📜" title="Rien encore" /> : (
          <ul className="card divide-y-2 divide-line overflow-hidden">
            {ledger.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-bold text-ink">{l.reason}</p>
                  <p className="text-xs font-bold text-muted">
                    {new Date(l.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <span className={clsx('shrink-0 text-lg font-black tabular-nums', l.amount >= 0 ? 'text-leaf' : 'text-flame')}>
                  {l.amount >= 0 ? '+' : ''}{l.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button onClick={signOut} className="btn-plain w-full">Se déconnecter</button>
    </main>
  );
}
