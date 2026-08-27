'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Flame, LogOut, Trophy, Target } from 'lucide-react';
import ChildShell from '@/components/ChildShell';
import PushManager from '@/components/PushManager';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { levelOf } from '@/lib/economy';
import { weekStart, todayISO } from '@/lib/dates';
import { Loader, Bar, Stat, Empty, toast } from '@/components/ui';
import type { Badge, LedgerRow, Contract, Message } from '@/lib/types';

export default function MePage() { return <ChildShell><Me /></ChildShell>; }

function Me() {
  const { profile, settings, signOut, refresh } = useApp();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [contract, setContract] = useState<Contract | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [stats, setStats] = useState({ done: 0, minutes: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [b, o, l, c, m, t] = await Promise.all([
        supabase.from('badges').select('*'),
        supabase.from('earned_badges').select('code').eq('child_id', profile.id),
        supabase.from('ledger').select('*').eq('child_id', profile.id).order('created_at', { ascending: false }).limit(20),
        supabase.from('contracts').select('*').eq('child_id', profile.id).eq('week_start', weekStart(todayISO())).maybeSingle(),
        supabase.from('messages').select('*').eq('to_id', profile.id).order('created_at', { ascending: false }).limit(10),
        supabase.from('tasks').select('duration_min').eq('child_id', profile.id).eq('status', 'done'),
      ]);
      setBadges((b.data ?? []) as Badge[]);
      setOwned(new Set((o.data ?? []).map((x: any) => x.code)));
      setLedger((l.data ?? []) as LedgerRow[]);
      setContract((c.data as Contract) ?? null);
      setMsgs((m.data ?? []) as Message[]);
      setStats({ done: (t.data ?? []).length, minutes: (t.data ?? []).reduce((n: number, x: any) => n + x.duration_min, 0) });
      setLoading(false);
    })();
  }, [profile?.id]);

  if (loading || !profile || !settings) return <Loader />;
  const lvl = levelOf(profile.xp, settings.xp_per_level);

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 pb-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <section className="card p-5 text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border-2 border-brand/40 bg-brand/10 text-4xl">
          {profile.avatar_emoji}
        </div>
        <h1 className="mt-3 text-2xl font-black">{profile.display_name}</h1>
        <p className="text-sm text-muted">Niveau {lvl.level}</p>
        <div className="mt-4">
          <Bar pct={lvl.pct} />
          <p className="mt-1.5 text-[11px] text-muted">{lvl.into} / {lvl.per} XP · encore {lvl.toNext} pour le niveau {lvl.level + 1}</p>
        </div>
      </section>

      <div className="flex gap-2.5">
        <Stat emoji="🔥" value={profile.streak_current} label="série" color="#FFC44D" />
        <Stat emoji="🏅" value={profile.streak_best} label="record" />
        <Stat emoji="✅" value={stats.done} label="tâches" color="#2FD8A5" />
        <Stat emoji="⏱️" value={`${Math.round(stats.minutes / 60)} h`} label="travail" />
      </div>

      <PushManager />

      {settings.goal_title && (
        <section className="card p-5">
          <p className="label !mb-2"><Target size={12} className="mb-0.5 inline" /> Pourquoi tu fais tout ça</p>
          <p className="text-lg font-black leading-tight">{settings.goal_title}</p>
          {settings.goal_date && (
            <p className="mt-1 text-xs text-muted">
              dans {Math.max(0, Math.ceil((new Date(settings.goal_date).getTime() - Date.now()) / 86400000))} jours
            </p>
          )}
        </section>
      )}

      {contract && (
        <section className="card border-brand/30 p-5">
          <p className="label !mb-2">🤝 Contrat de la semaine</p>
          <p className="text-lg font-black leading-tight">{contract.title}</p>
          <p className="mt-1 text-sm text-white/70">Objectif : {contract.target} · Récompense : {contract.reward_text}</p>
          {contract.status === 'proposed' && (
            <div className="mt-4 flex gap-2">
              <button className="btn-primary flex-1 text-sm"
                      onClick={async () => {
                        await supabase.from('contracts').update({ status: 'accepted' }).eq('id', contract.id);
                        setContract({ ...contract, status: 'accepted' }); toast('Contrat accepté 🤝');
                      }}>
                J’accepte
              </button>
            </div>
          )}
          {contract.status === 'accepted' && <p className="mt-3 chip !border-mint/30 !bg-mint/10 !text-mint">Contrat en cours</p>}
          {contract.status === 'achieved' && <p className="mt-3 chip !border-sun/30 !bg-sun/10 !text-sun">🏆 Rempli</p>}
        </section>
      )}

      {!!msgs.length && (
        <section>
          <h2 className="label">Messages</h2>
          <ul className="space-y-2">
            {msgs.map((m) => (
              <li key={m.id} className="card flex items-start gap-3 p-3.5">
                <span className="text-2xl">{m.emoji ?? '💬'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-white/90">{m.body}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {new Date(m.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="label"><Trophy size={12} className="mb-0.5 inline" /> Badges · {owned.size}/{badges.length}</h2>
        <div className="grid grid-cols-4 gap-2.5">
          {badges.map((b) => {
            const has = owned.has(b.code);
            return (
              <div key={b.code} title={b.description}
                   className={clsx('card flex flex-col items-center gap-1 px-1.5 py-3 text-center transition',
                     has ? 'border-brand/30 bg-brand/[.07]' : 'opacity-35')}>
                <span className="text-2xl">{has ? b.emoji : '🔒'}</span>
                <span className="text-[9px] font-bold leading-tight">{b.name}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="label">Historique des points</h2>
        {ledger.length === 0 ? <Empty emoji="📜" title="Rien encore" /> : (
          <ul className="card divide-y divide-line">
            {ledger.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm">{l.reason}</p>
                  <p className="text-[11px] text-muted">
                    {new Date(l.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <span className={clsx('shrink-0 text-sm font-black tabular-nums', l.amount >= 0 ? 'text-mint' : 'text-coral')}>
                  {l.amount >= 0 ? '+' : ''}{l.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button onClick={signOut} className="btn-soft w-full text-sm"><LogOut size={15} /> Se déconnecter</button>
    </main>
  );
}
