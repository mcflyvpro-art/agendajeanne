'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Lock, Hourglass, Check, X } from 'lucide-react';
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
      supabase.from('redemptions').select('*').eq('child_id', profile.id).order('created_at', { ascending: false }).limit(15),
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
      if (profile.coins < r.cost) throw new Error('Pas assez de points');
      await supabase.from('redemptions').insert({
        reward_id: r.id, child_id: profile.id, reward_name: r.name,
        reward_emoji: r.emoji, cost_paid: r.cost,
      });
      await supabase.from('ledger').insert({
        child_id: profile.id, amount: -r.cost, reason: `Récompense : ${r.name}`, kind: 'reward',
      });
      await supabase.from('profiles').update({ coins: profile.coins - r.cost }).eq('id', profile.id);
      await A.notify('redemption', { reward: r.name, cost: r.cost });
      setPicked(null);
      await Promise.all([load(), refresh()]);
      toast('Demande envoyée à tes parents 🎁');
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  const cats = [...new Set(rewards.map((r) => r.category))];

  return (
    <main className="mx-auto max-w-lg px-4 pb-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <div className="card flex items-center justify-between p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Ton solde</p>
          <p className="mt-1 text-4xl font-black text-brand-soft">{profile.coins}</p>
          <p className="text-xs text-muted">{settings.currency_name}</p>
        </div>
        <span className="text-5xl">{settings.currency_emoji}</span>
      </div>

      {rewards.length === 0 ? (
        <div className="mt-6"><Empty emoji="🎁" title="Boutique vide" hint="Tes parents n’ont pas encore ajouté de récompenses." /></div>
      ) : cats.map((cat) => (
        <section key={cat} className="mt-6">
          <h2 className="label">{cat}</h2>
          <div className="stagger grid grid-cols-2 gap-3">
            {rewards.filter((r) => r.category === cat).map((r) => {
              const afford = profile.coins >= r.cost;
              return (
                <button key={r.id} onClick={() => setPicked(r)}
                        className={clsx('card p-4 text-left transition active:scale-[.98]', !afford && 'opacity-55')}>
                  <div className="text-3xl">{r.emoji}</div>
                  <p className="mt-2 text-sm font-bold leading-snug">{r.name}</p>
                  {r.description && <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted">{r.description}</p>}
                  <p className={clsx('mt-2 inline-flex items-center gap-1 text-sm font-black', afford ? 'text-brand-soft' : 'text-muted')}>
                    {!afford && <Lock size={12} />}{r.cost} {settings.currency_emoji}
                  </p>
                  {!afford && <p className="mt-0.5 text-[10px] text-muted">encore {r.cost - profile.coins}</p>}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {!!history.length && (
        <section className="mt-8">
          <h2 className="label">Tes demandes</h2>
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="card flex items-center gap-3 p-3.5">
                <span className="text-2xl">{h.reward_emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{h.reward_name}</p>
                  <p className="text-[11px] text-muted">
                    {new Date(h.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · {h.cost_paid} {settings.currency_emoji}
                  </p>
                  {h.parent_note && <p className="mt-0.5 text-[11px] italic text-white/60">« {h.parent_note} »</p>}
                </div>
                {h.status === 'pending' && <span className="chip !border-sun/30 !bg-sun/10 !text-sun"><Hourglass size={11} /> En attente</span>}
                {(h.status === 'approved' || h.status === 'delivered') && <span className="chip !border-mint/30 !bg-mint/10 !text-mint"><Check size={12} /> Accordée</span>}
                {h.status === 'refused' && <span className="chip !border-coral/30 !bg-coral/10 !text-coral"><X size={12} /> Refusée</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Sheet open={!!picked} onClose={() => setPicked(null)} title={picked?.name ?? ''}
             footer={
               <button onClick={() => picked && buy(picked)} disabled={busy || (picked ? profile.coins < picked.cost : true)}
                       className="btn-primary w-full !py-4">
                 {picked && profile.coins < picked.cost
                   ? `Il te manque ${picked.cost - profile.coins} ${settings.currency_emoji}`
                   : `Échanger contre ${picked?.cost} ${settings.currency_emoji}`}
               </button>
             }>
        {picked && (
          <div className="text-center">
            <div className="text-6xl">{picked.emoji}</div>
            {picked.description && <p className="mt-3 text-sm leading-relaxed text-white/80">{picked.description}</p>}
            {picked.condition && (
              <p className="mt-3 rounded-2xl border border-sun/25 bg-sun/[.08] px-3 py-2.5 text-xs leading-relaxed text-sun">
                ⚠️ {picked.condition}
              </p>
            )}
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Les points sont retirés tout de suite. Tes parents reçoivent la demande et confirment.
            </p>
          </div>
        )}
      </Sheet>
    </main>
  );
}
