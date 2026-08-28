'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import ChildShell from '@/components/ChildShell';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { Loader, Sheet, Empty, toast } from '@/components/ui';
import * as A from '@/lib/actions';
import type { Reward, Redemption } from '@/lib/types';

export default function ShopPage() { return <ChildShell><Shop /></ChildShell>; }

function Shop() {
  const { profile, settings, refresh } = useApp();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [history, setHistory] = useState<Redemption[]>([]);
  const [picked, setPicked] = useState<Reward | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!profile) return;
    const [r, h] = await Promise.all([
      supabase.from('rewards').select('*').eq('active', true).order('cost'),
      supabase.from('redemptions').select('*').eq('child_id', profile.id).order('created_at', { ascending: false }).limit(12),
    ]);
    setRewards((r.data ?? []) as Reward[]);
    setHistory((h.data ?? []) as Redemption[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [profile?.id]);
  if (loading || !profile || !settings) return <Loader />;

  const buy = async (r: Reward) => {
    setBusy(true);
    try {
      if (profile.coins < r.cost) throw new Error('Pas assez');
      await supabase.from('redemptions').insert({
        reward_id: r.id, child_id: profile.id, reward_name: r.name, reward_emoji: r.emoji, cost_paid: r.cost,
      });
      await supabase.from('ledger').insert({
        child_id: profile.id, amount: -r.cost, reason: r.name, kind: 'reward',
      });
      await supabase.from('profiles').update({ coins: profile.coins - r.cost }).eq('id', profile.id);
      A.notify('purchase', { reward: r.name, cost: r.cost });
      setPicked(null);
      await Promise.all([load(), refresh()]);
      toast('Demande envoyée');
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  return (
    <main className="mx-auto max-w-lg px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <div className="card flex items-center justify-between p-5">
        <div>
          <p className="text-5xl font-black text-grape">{profile.coins}</p>
          <p className="mt-1 font-extrabold text-muted">{settings.currency_name}</p>
        </div>
        <span className="animate-bob text-6xl">{settings.currency_emoji}</span>
      </div>

      {rewards.length === 0 ? (
        <div className="mt-6"><Empty emoji="🎁" title="Boutique vide" /></div>
      ) : (
        <div className="stagger mt-5 grid grid-cols-2 gap-3">
          {rewards.map((r) => {
            const ok = profile.coins >= r.cost;
            return (
              <button key={r.id} onClick={() => setPicked(r)}
                      className={clsx('tile p-4 text-left no-select active:scale-95', !ok && 'opacity-50')}>
                <div className="text-4xl">{r.emoji}</div>
                <p className="mt-2 font-extrabold leading-snug text-ink">{r.name}</p>
                <p className={clsx('mt-2 text-lg font-black', ok ? 'text-grape' : 'text-muted')}>
                  {ok ? '' : '🔒 '}{r.cost} {settings.currency_emoji}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {!!history.length && (
        <ul className="mt-6 space-y-2.5">
          {history.map((h) => (
            <li key={h.id} className="card flex items-center gap-3 p-3.5">
              <span className="text-3xl">{h.reward_emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold text-ink">{h.reward_name}</p>
                <p className="text-xs font-bold text-muted">
                  {new Date(h.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <span className="text-2xl">
                {h.status === 'pending' ? '⏳' : h.status === 'refused' ? '❌' : '✅'}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!picked} onClose={() => setPicked(null)} title={picked?.name ?? ''}
             footer={
               <button onClick={() => picked && buy(picked)} disabled={busy || (picked ? profile.coins < picked.cost : true)}
                       className="btn-grape btn-lg w-full">
                 {picked && profile.coins < picked.cost
                   ? `Il manque ${picked.cost - profile.coins} ${settings.currency_emoji}`
                   : `Échanger · ${picked?.cost} ${settings.currency_emoji}`}
               </button>
             }>
        {picked && (
          <div className="py-4 text-center">
            <div className="animate-bob text-7xl">{picked.emoji}</div>
            {picked.description && <p className="mt-4 font-bold text-ink">{picked.description}</p>}
            {picked.condition && (
              <p className="mt-3 rounded-3xl bg-sun-light px-4 py-3 font-bold text-sun-dark">⚠️ {picked.condition}</p>
            )}
          </div>
        )}
      </Sheet>
    </main>
  );
}
