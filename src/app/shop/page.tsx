'use client';
import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import ChildShell from '@/components/ChildShell';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { useLive } from '@/lib/useLive';
import { Loader, Sheet, Empty, toast } from '@/components/ui';
import * as A from '@/lib/actions';
import type { Reward, Redemption, ChildItem } from '@/lib/types';

export default function ShopPage() { return <ChildShell><Shop /></ChildShell>; }

function Shop() {
  const { profile, settings, refresh } = useApp();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [history, setHistory] = useState<Redemption[]>([]);
  const [owned, setOwned] = useState<ChildItem[]>([]);
  const [picked, setPicked] = useState<Reward | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    const [r, h, o] = await Promise.all([
      supabase.from('rewards').select('*').eq('active', true).order('position').order('cost'),
      supabase.from('redemptions').select('*').eq('child_id', profile.id).order('created_at', { ascending: false }).limit(12),
      supabase.from('child_items').select('*').eq('child_id', profile.id),
    ]);
    setRewards((r.data ?? []) as Reward[]);
    setHistory((h.data ?? []) as Redemption[]);
    setOwned((o.data ?? []) as ChildItem[]);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);
  useLive(['rewards', 'redemptions', 'child_items', 'profiles'], load, 'shop');

  if (loading || !profile || !settings) return <Loader />;

  const ownedSet = new Set(owned.map((o) => `${o.item_type}|${o.item_value}`));
  const items = rewards.filter((r) => r.kind === 'item');
  const actions = rewards.filter((r) => r.kind !== 'item');

  const buy = async (r: Reward) => {
    setBusy(true);
    try {
      if (profile.coins < r.cost) throw new Error('Pas assez');

      if (r.kind === 'item') {
        // Objet : débloqué tout de suite, sans validation.
        const { error } = await supabase.from('child_items').insert({
          child_id: profile.id, reward_id: r.id,
          item_type: r.item_type ?? 'avatar', item_value: r.item_value ?? r.emoji,
        });
        if (error) throw new Error('Tu l’as déjà');
        await supabase.from('ledger').insert({
          child_id: profile.id, amount: -r.cost, reason: r.name, kind: 'reward',
        });
        await supabase.from('profiles').update({
          coins: profile.coins - r.cost,
          avatar_emoji: (r.item_type ?? 'avatar') === 'avatar' ? (r.item_value ?? r.emoji) : profile.avatar_emoji,
        }).eq('id', profile.id);
        toast('Débloqué !');
      } else {
        await supabase.from('redemptions').insert({
          reward_id: r.id, child_id: profile.id, reward_name: r.name, reward_emoji: r.emoji, cost_paid: r.cost,
        });
        await supabase.from('ledger').insert({
          child_id: profile.id, amount: -r.cost, reason: r.name, kind: 'reward',
        });
        await supabase.from('profiles').update({ coins: profile.coins - r.cost }).eq('id', profile.id);
        A.notify('purchase', { reward: r.name, cost: r.cost });
        toast('Demande envoyée');
      }
      setPicked(null);
      await Promise.all([load(), refresh()]);
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  const pending = history.filter((h) => h.status === 'pending');
  const settled = history.filter((h) => h.status !== 'pending');

  return (
    <main className="mx-auto max-w-lg px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <div className="card flex items-center justify-between p-5">
        <div>
          <p className="text-5xl font-black text-grape">{profile.coins}</p>
          <p className="mt-1 font-extrabold text-muted">{settings.currency_name}</p>
        </div>
        <span className="animate-bob text-6xl">{settings.currency_emoji}</span>
      </div>

      {!!items.length && (
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-black text-ink">🎭 Avatars</h2>
          <div className="grid grid-cols-3 gap-3">
            {items.map((r) => {
              const has = ownedSet.has(`${r.item_type}|${r.item_value}`);
              const ok = profile.coins >= r.cost;
              const worn = profile.avatar_emoji === r.item_value;
              return (
                <button key={r.id}
                        onClick={async () => {
                          if (!has) return setPicked(r);
                          await supabase.from('profiles').update({ avatar_emoji: r.item_value }).eq('id', profile.id);
                          await refresh(); toast('Avatar changé');
                        }}
                        className={clsx('tile p-3 text-center no-select active:scale-95',
                          worn ? 'border-grape bg-grape-light' : has ? 'border-leaf' : !ok && 'opacity-50')}>
                  <div className="text-4xl">{r.item_value ?? r.emoji}</div>
                  <p className={clsx('mt-1.5 text-xs font-black',
                    worn ? 'text-grape' : has ? 'text-leaf' : ok ? 'text-ink' : 'text-muted')}>
                    {worn ? 'Porté' : has ? 'Choisir' : `${ok ? '' : '🔒 '}${r.cost}`}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-7">
        <h2 className="mb-3 text-lg font-black text-ink">🎁 Récompenses</h2>
        {actions.length === 0 ? <Empty emoji="🎁" title="Rien pour l’instant" /> : (
          <div className="grid grid-cols-2 gap-3">
            {actions.map((r) => {
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
      </section>

      {!!pending.length && (
        <section className="mt-7">
          <h2 className="mb-3 text-lg font-black text-ink">⏳ En attente</h2>
          <ul className="space-y-2.5">
            {pending.map((h) => <HistoryRow key={h.id} h={h} />)}
          </ul>
        </section>
      )}

      {!!settled.length && (
        <section className="mt-7">
          <h2 className="mb-3 text-lg font-black text-ink">📜 Déjà demandé</h2>
          <ul className="space-y-2.5">
            {settled.map((h) => <HistoryRow key={h.id} h={h} />)}
          </ul>
        </section>
      )}

      <Sheet open={!!picked} onClose={() => setPicked(null)} title={picked?.name ?? ''}
             footer={
               <button onClick={() => picked && buy(picked)} disabled={busy || (picked ? profile.coins < picked.cost : true)}
                       className="btn-grape btn-lg w-full">
                 {picked && profile.coins < picked.cost
                   ? `Il manque ${picked.cost - profile.coins} ${settings.currency_emoji}`
                   : `${picked?.kind === 'item' ? 'Débloquer' : 'Demander'} · ${picked?.cost} ${settings.currency_emoji}`}
               </button>
             }>
        {picked && (
          <div className="py-4 text-center">
            <div className="animate-bob text-7xl">{picked.kind === 'item' ? picked.item_value ?? picked.emoji : picked.emoji}</div>
            {picked.description && picked.kind !== 'item' && <p className="mt-4 font-bold text-ink">{picked.description}</p>}
            {picked.condition && (
              <p className="mt-3 rounded-3xl bg-sun-light px-4 py-3 font-bold text-sun-dark">⚠️ {picked.condition}</p>
            )}
          </div>
        )}
      </Sheet>
    </main>
  );
}

function HistoryRow({ h }: { h: Redemption }) {
  return (
    <li className="card flex items-center gap-3 p-3.5">
      <span className="text-3xl">{h.reward_emoji}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-extrabold text-ink">{h.reward_name}</p>
        <p className="text-xs font-bold text-muted">
          {new Date(h.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </p>
      </div>
      <span className="text-2xl">{h.status === 'pending' ? '⏳' : h.status === 'refused' ? '❌' : '✅'}</span>
    </li>
  );
}
