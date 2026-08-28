'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Plus, Trash2 } from 'lucide-react';
import ParentShell from '@/components/ParentShell';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { weekStart, todayISO } from '@/lib/dates';
import { notify } from '@/lib/actions';
import { Loader, Sheet, Empty, SegmentedTabs, toast } from '@/components/ui';
import type { Reward, Redemption, Contract } from '@/lib/types';

export default function RewardsPage() { return <ParentShell><Rewards /></ParentShell>; }

const EMOJIS = ['🎁','📱','💶','💰','🍿','👯','🍽️','😴','🧹','🎮','🎧','🛍️','🚗','🏖️','🍕','🎬','⚽','✈️','🎨','🐶'];

function Rewards() {
  const { child, settings, profile, refreshChild } = useApp();
  const [tab, setTab] = useState<'shop' | 'requests' | 'contract'>('shop');
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [reqs, setReqs] = useState<Redemption[]>([]);
  const [edit, setEdit] = useState<Partial<Reward> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!child) return;
    const [r, q] = await Promise.all([
      supabase.from('rewards').select('*').order('cost'),
      supabase.from('redemptions').select('*').eq('child_id', child.id).order('created_at', { ascending: false }).limit(30),
    ]);
    setRewards((r.data ?? []) as Reward[]);
    setReqs((q.data ?? []) as Redemption[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [child?.id]);
  if (loading || !child || !settings) return <Loader />;

  const save = async () => {
    if (!edit?.name?.trim()) { toast('Nom manquant', 'err'); return; }
    const payload = {
      name: edit.name.trim(), description: edit.description?.trim() || null,
      emoji: edit.emoji || '🎁', cost: Number(edit.cost) || 100,
      category: edit.category?.trim() || 'Divers', condition: edit.condition?.trim() || null,
      active: edit.active ?? true,
    };
    if (edit.id) await supabase.from('rewards').update(payload).eq('id', edit.id);
    else {
      await supabase.from('rewards').insert(payload);
      notify('reward_created', { name: payload.name, emoji: payload.emoji, cost: payload.cost });
    }
    setEdit(null); await load(); toast('Enregistrée');
  };

  const resolve = async (r: Redemption, approve: boolean) => {
    await supabase.from('redemptions').update({ status: approve ? 'approved' : 'refused', resolved_at: new Date().toISOString() }).eq('id', r.id);
    if (!approve) {
      await supabase.from('profiles').update({ coins: child.coins + r.cost_paid }).eq('id', child.id);
      await supabase.from('ledger').insert({ child_id: child.id, amount: r.cost_paid, reason: `Annulé : ${r.reward_name}`, kind: 'reward' });
    }
    await supabase.from('messages').insert({
      from_id: profile!.id, to_id: child.id, kind: 'system',
      body: approve ? `${r.reward_name} accordée !` : `${r.reward_name} refusée, points rendus.`,
      emoji: approve ? '🎁' : '↩️',
    });
    notify('kudos', { body: approve ? `${r.reward_name} accordée ! 🎁` : `${r.reward_name} refusée`, emoji: approve ? '🎁' : '↩️' });
    await Promise.all([load(), refreshChild()]);
  };

  const nb = reqs.filter((r) => r.status === 'pending').length;

  return (
    <main className="mx-auto max-w-lg px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <h1 className="text-3xl font-black text-ink">Boutique</h1>

      <div className="mt-4">
        <SegmentedTabs value={tab} onChange={setTab} options={[
          { value: 'shop', label: '🎁 Catalogue' },
          { value: 'requests', label: `📥 Demandes${nb ? ` (${nb})` : ''}` },
          { value: 'contract', label: '🤝 Contrat' },
        ]} />
      </div>

      {tab === 'shop' && (
        <>
          <ul className="stagger mt-5 space-y-3">
            {rewards.map((r) => (
              <li key={r.id}>
                <button onClick={() => setEdit(r)} className={clsx('card flex w-full items-center gap-3 p-4 text-left no-select active:scale-[.99]', !r.active && 'opacity-45')}>
                  <span className="text-4xl">{r.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold text-ink">{r.name}</p>
                    <p className="truncate text-xs font-bold text-muted">{r.category}</p>
                  </div>
                  <span className="shrink-0 text-lg font-black text-grape">{r.cost} {settings.currency_emoji}</span>
                </button>
              </li>
            ))}
          </ul>
          {rewards.length === 0 && <div className="mt-5"><Empty emoji="🎁" title="Vide" /></div>}
          <button onClick={() => setEdit({ emoji: '🎁', cost: 100, category: 'Divers', active: true })}
                  className="btn-grape btn-lg mt-5 w-full"><Plus size={20} /> Ajouter</button>
        </>
      )}

      {tab === 'requests' && (
        <ul className="stagger mt-5 space-y-3">
          {reqs.length === 0 && <Empty emoji="📭" title="Aucune demande" />}
          {reqs.map((r) => (
            <li key={r.id} className={clsx('card p-4', r.status === 'pending' && 'border-2 border-sun')}>
              <div className="flex items-center gap-3">
                <span className="text-4xl">{r.reward_emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-extrabold text-ink">{r.reward_name}</p>
                  <p className="text-xs font-bold text-muted">
                    {new Date(r.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {r.cost_paid} {settings.currency_emoji}
                  </p>
                </div>
                {r.status !== 'pending' && <span className="text-2xl">{r.status === 'refused' ? '❌' : '✅'}</span>}
              </div>
              {r.status === 'pending' && (
                <div className="mt-3 flex gap-2.5">
                  <button onClick={() => resolve(r, false)} className="btn-flame flex-1">❌ Refuser</button>
                  <button onClick={() => resolve(r, true)} className="btn-leaf flex-1">✅ Accorder</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {tab === 'contract' && <ContractTab />}

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Modifier' : 'Nouvelle'}
             footer={
               <div className="flex gap-2.5">
                 {edit?.id && (
                   <button onClick={async () => { await supabase.from('rewards').delete().eq('id', edit.id!); setEdit(null); load(); }}
                           className="btn-flame !px-5"><Trash2 size={18} /></button>
                 )}
                 <button onClick={save} className="btn-grape btn-lg flex-1">Enregistrer</button>
               </div>
             }>
        {edit && (
          <div className="space-y-4">
            <div className="grid grid-cols-10 gap-1.5">
              {EMOJIS.map((e) => (
                <button key={e} onClick={() => setEdit({ ...edit, emoji: e })}
                        className={clsx('grid aspect-square place-items-center rounded-2xl border-2 text-lg',
                          edit.emoji === e ? 'border-grape bg-grape-light' : 'border-line bg-card')}>
                  {e}
                </button>
              ))}
            </div>
            <input className="field" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Nom" />
            <input className="field" value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="Détail" />
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Prix</label>
                <input type="number" className="field" value={edit.cost ?? 100} onChange={(e) => setEdit({ ...edit, cost: Number(e.target.value) })} /></div>
              <div><label className="label">Catégorie</label>
                <input className="field" value={edit.category ?? ''} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></div>
            </div>
            <input className="field" value={edit.condition ?? ''} onChange={(e) => setEdit({ ...edit, condition: e.target.value })} placeholder="Condition" />
            <button onClick={() => setEdit({ ...edit, active: !(edit.active ?? true) })}
                    className={clsx('flex w-full items-center gap-3 rounded-3xl border-2 px-4 py-3.5 no-select',
                      (edit.active ?? true) ? 'border-leaf bg-leaf-light' : 'border-line bg-card')}>
              <span className="text-2xl">{(edit.active ?? true) ? '👁️' : '🚫'}</span>
              <span className="font-extrabold text-ink">Visible</span>
            </button>
          </div>
        )}
      </Sheet>
    </main>
  );
}

function ContractTab() {
  const { child, settings } = useApp();
  const ws = weekStart(todayISO());
  const [c, setC] = useState<Partial<Contract> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!child) return;
    supabase.from('contracts').select('*').eq('child_id', child.id).eq('week_start', ws).maybeSingle()
      .then(({ data }) => {
        setC((data as Contract) ?? { week_start: ws, metric: 'tasks_done', target: 15, reward_coins: 0, status: 'proposed' });
        setLoading(false);
      });
  }, [child?.id]);
  if (loading || !c || !child || !settings) return <Loader />;

  const save = async () => {
    if (!c.title?.trim() || !c.reward_text?.trim()) { toast('Titre et récompense', 'err'); return; }
    const { error } = await supabase.from('contracts').upsert({
      child_id: child.id, week_start: ws, title: c.title.trim(), metric: c.metric ?? 'tasks_done',
      target: Number(c.target) || 1, reward_text: c.reward_text.trim(),
      reward_coins: Number(c.reward_coins) || 0, status: c.status ?? 'proposed',
    }, { onConflict: 'child_id,week_start' });
    if (error) toast(error.message, 'err');
    else { notify('contract_created', { title: c.title, reward: c.reward_text }); toast('Proposé'); }
  };

  return (
    <div className="mt-5 space-y-4">
      <input className="field" value={c.title ?? ''} onChange={(e) => setC({ ...c, title: e.target.value })} placeholder="Objectif de la semaine" />
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Mesure</label>
          <select className="field" value={c.metric} onChange={(e) => setC({ ...c, metric: e.target.value as any })}>
            <option value="tasks_done">Tâches</option>
            <option value="coins">Points</option>
            <option value="minutes">Minutes</option>
            <option value="perfect_days">Journées</option>
          </select></div>
        <div><label className="label">Cible</label>
          <input type="number" className="field" value={c.target ?? 0} onChange={(e) => setC({ ...c, target: Number(e.target.value) })} /></div>
      </div>
      <input className="field" value={c.reward_text ?? ''} onChange={(e) => setC({ ...c, reward_text: e.target.value })} placeholder="🎁 Récompense promise" />
      <div><label className="label">Bonus {settings.currency_emoji}</label>
        <input type="number" className="field" value={c.reward_coins ?? 0} onChange={(e) => setC({ ...c, reward_coins: Number(e.target.value) })} /></div>
      {c.status && c.status !== 'proposed' && (
        <p className="chip !border-leaf !bg-leaf-light !text-leaf-dark">
          {c.status === 'accepted' ? '✅ Accepté' : c.status === 'achieved' ? '🏆 Réussi' : '❌ Raté'}
        </p>
      )}
      <button onClick={save} className="btn-grape btn-lg w-full">Proposer</button>
    </div>
  );
}
