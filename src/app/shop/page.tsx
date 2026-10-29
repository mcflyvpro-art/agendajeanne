'use client';
import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import ChildShell from '@/components/ChildShell';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { useLive } from '@/lib/useLive';
import { Loader, Sheet, Empty, Bar, PageHeader, SectionTitle, toast } from '@/components/ui';
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
  // Un avatar acheté disparaît définitivement du rayon : il vit désormais dans
  // « Moi ». Ceux liés à un niveau ne sont pas à vendre, ils se gagnent.
  const items = rewards.filter((r) =>
    r.kind === 'item' && !r.unlock_level && !ownedSet.has(`${r.item_type}|${r.item_value}`));
  const actions = rewards.filter((r) => r.kind !== 'item');

  const buy = async (r: Reward) => {
    setBusy(true);
    try {
      const avatar = r.kind === 'item' && (r.item_type ?? 'avatar') === 'avatar' ? (r.item_value ?? r.emoji) : null;
      // Débit d'abord, vérifié en base : le solde affiché peut dater d'avant un
      // mouvement fait sur l'autre appareil. Remboursé si la suite échoue.
      const paid = await A.creditChild(profile.id, -r.cost, 0, {
        requireFunds: true, set: avatar ? { avatar_emoji: avatar } : undefined,
      });
      if (!paid) throw new Error('Pas assez');

      if (r.kind === 'item') {
        // Objet : débloqué tout de suite, sans validation.
        const { error } = await supabase.from('child_items').insert({
          child_id: profile.id, reward_id: r.id,
          item_type: r.item_type ?? 'avatar', item_value: r.item_value ?? r.emoji,
        });
        if (error) {
          await A.creditChild(profile.id, r.cost, 0, { set: avatar ? { avatar_emoji: profile.avatar_emoji } : undefined });
          throw new Error('Tu l’as déjà');
        }
        await supabase.from('ledger').insert({
          child_id: profile.id, amount: -r.cost, reason: r.name, kind: 'reward',
        });
        toast('Débloqué !');
      } else {
        const { error } = await supabase.from('redemptions').insert({
          reward_id: r.id, child_id: profile.id, reward_name: r.name, reward_emoji: r.emoji, cost_paid: r.cost,
        });
        if (error) {
          await A.creditChild(profile.id, r.cost);
          throw new Error('Demande non envoyée, réessaie');
        }
        await supabase.from('ledger').insert({
          child_id: profile.id, amount: -r.cost, reason: r.name, kind: 'reward',
        });
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

  // L'objectif le plus proche, pour donner une raison concrète de continuer.
  const target = actions.filter((r) => r.cost > profile.coins).sort((a, b) => a.cost - b.cost)[0];

  return (
    <main className="mx-auto max-w-lg px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <PageHeader title="Boutique" />

      <div className="card mt-4 overflow-hidden">
        <div className="flex items-center justify-between bg-gradient-to-br from-grape to-rose p-5 text-white">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-white/75">Mon solde</p>
            <p className="text-5xl font-black tabular-nums">{profile.coins}</p>
            <p className="font-extrabold text-white/80">{settings.currency_name}</p>
          </div>
          <span className="animate-bob text-6xl drop-shadow">{settings.currency_emoji}</span>
        </div>
        {target && (
          <div className="p-4">
            <div className="mb-2 flex items-center justify-between gap-3 text-sm font-extrabold">
              <span className="truncate text-ink">{target.emoji} Prochain objectif : {target.name}</span>
              <span className="shrink-0 text-muted">encore {target.cost - profile.coins}</span>
            </div>
            <Bar pct={(profile.coins / target.cost) * 100} color="#7C4DEE" height={10} />
          </div>
        )}
      </div>

      <section className="mt-6">
        <SectionTitle>🎁 Récompenses</SectionTitle>
        {actions.length === 0 ? <Empty emoji="🎁" title="Rien pour l’instant" hint="Tes parents peuvent en ajouter." /> : (
          <div className="grid grid-cols-2 gap-3">
            {actions.map((r) => {
              const ok = profile.coins >= r.cost;
              return (
                <button key={r.id} onClick={() => setPicked(r)}
                        className={clsx('tile flex flex-col p-4 text-left no-select active:scale-95', !ok && 'bg-soft/60')}>
                  <div className={clsx('text-4xl', !ok && 'opacity-60')}>{r.emoji}</div>
                  <p className={clsx('mt-2 flex-1 font-extrabold leading-snug', ok ? 'text-ink' : 'text-ink/60')}>{r.name}</p>
                  <p className={clsx('mt-2 text-lg font-black', ok ? 'text-grape' : 'text-muted')}>
                    {ok ? '' : '🔒 '}{r.cost} {settings.currency_emoji}
                  </p>
                  {!ok && <Bar pct={(profile.coins / r.cost) * 100} color="#B9A6F2" height={6} className="mt-2" />}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {!!items.length && (
        <section className="mt-7">
          <SectionTitle>🎭 Avatars</SectionTitle>
          <div className="grid grid-cols-4 gap-2.5">
            {items.map((r) => {
              const ok = profile.coins >= r.cost;
              return (
                <button key={r.id} onClick={() => setPicked(r)}
                        className={clsx('tile px-1 py-3 text-center no-select active:scale-95', !ok && 'bg-soft/60')}>
                  <div className={clsx('text-4xl', !ok && 'opacity-60')}>{r.item_value ?? r.emoji}</div>
                  <p className={clsx('mt-1.5 text-xs font-black', ok ? 'text-grape' : 'text-muted')}>
                    {ok ? '' : '🔒 '}{r.cost}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {!!pending.length && (
        <section className="mt-7">
          <SectionTitle>⏳ En attente de tes parents</SectionTitle>
          <ul className="space-y-2.5">
            {pending.map((h) => <HistoryRow key={h.id} h={h} />)}
          </ul>
        </section>
      )}

      {!!settled.length && (
        <section className="mt-7">
          <SectionTitle>📜 Déjà demandé</SectionTitle>
          <ul className="space-y-2.5">
            {settled.slice(0, 5).map((h) => <HistoryRow key={h.id} h={h} />)}
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
