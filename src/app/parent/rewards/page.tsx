'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Plus, Trash2, Check, X, Handshake } from 'lucide-react';
import ParentShell from '@/components/ParentShell';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { weekStart, todayISO } from '@/lib/dates';
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
      supabase.from('rewards').select('*').order('position').order('cost'),
      supabase.from('redemptions').select('*').eq('child_id', child.id).order('created_at', { ascending: false }).limit(30),
    ]);
    setRewards((r.data ?? []) as Reward[]);
    setReqs((q.data ?? []) as Redemption[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [child?.id]);

  if (loading || !child || !settings) return <Loader />;

  const save = async () => {
    if (!edit?.name?.trim()) { toast('Il faut un nom', 'err'); return; }
    const payload = {
      name: edit.name.trim(), description: edit.description?.trim() || null,
      emoji: edit.emoji || '🎁', cost: Number(edit.cost) || 100,
      category: edit.category?.trim() || 'Divers', condition: edit.condition?.trim() || null,
      active: edit.active ?? true,
    };
    if (edit.id) await supabase.from('rewards').update(payload).eq('id', edit.id);
    else await supabase.from('rewards').insert(payload);
    setEdit(null); await load();
    toast('Récompense enregistrée 🎁');
  };

  const resolve = async (r: Redemption, approve: boolean) => {
    await supabase.from('redemptions').update({ status: approve ? 'approved' : 'refused', resolved_at: new Date().toISOString() }).eq('id', r.id);
    if (!approve) {
      await supabase.from('profiles').update({ coins: child.coins + r.cost_paid }).eq('id', child.id);
      await supabase.from('ledger').insert({ child_id: child.id, amount: r.cost_paid, reason: `Remboursement : ${r.reward_name}`, kind: 'reward' });
    }
    await supabase.from('messages').insert({
      from_id: profile!.id, to_id: child.id, kind: 'system',
      body: approve ? `Récompense accordée : ${r.reward_name} 🎉` : `Récompense refusée : ${r.reward_name}. Points rendus.`,
      emoji: approve ? '🎁' : '↩️',
    });
    await Promise.all([load(), refreshChild()]);
  };

  const pendingCount = reqs.filter((r) => r.status === 'pending').length;

  return (
    <main className="mx-auto max-w-lg px-4 pb-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <h1 className="text-2xl font-black tracking-tight">Récompenses</h1>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Tu fixes le catalogue et les prix. C’est ce qui transforme « papa m’oblige » en « je gagne quelque chose ».
      </p>

      <div className="mt-4">
        <SegmentedTabs value={tab} onChange={setTab} options={[
          { value: 'shop', label: 'Boutique' },
          { value: 'requests', label: `Demandes${pendingCount ? ` (${pendingCount})` : ''}` },
          { value: 'contract', label: 'Contrat' },
        ]} />
      </div>

      {tab === 'shop' && (
        <>
          <ul className="stagger mt-5 space-y-2.5">
            {rewards.map((r) => (
              <li key={r.id}>
                <button onClick={() => setEdit(r)} className={clsx('card flex w-full items-center gap-3 p-4 text-left active:scale-[.99]', !r.active && 'opacity-45')}>
                  <span className="text-3xl">{r.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{r.name}</p>
                    <p className="truncate text-[11px] text-muted">{r.category}{r.description ? ` · ${r.description}` : ''}</p>
                  </div>
                  <span className="shrink-0 font-black text-brand-soft">{r.cost} {settings.currency_emoji}</span>
                </button>
              </li>
            ))}
          </ul>
          {rewards.length === 0 && <Empty emoji="🎁" title="Boutique vide" hint="Ajoute ce qu’elle peut gagner." />}
          <button onClick={() => setEdit({ emoji: '🎁', cost: 100, category: 'Divers', active: true })}
                  className="btn-primary mt-5 w-full !py-4"><Plus size={19} /> Ajouter une récompense</button>
        </>
      )}

      {tab === 'requests' && (
        <ul className="stagger mt-5 space-y-2.5">
          {reqs.length === 0 && <Empty emoji="📭" title="Aucune demande" />}
          {reqs.map((r) => (
            <li key={r.id} className={clsx('card p-4', r.status === 'pending' && 'border-sun/35')}>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{r.reward_emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{r.reward_name}</p>
                  <p className="text-[11px] text-muted">
                    {new Date(r.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {' · '}{r.cost_paid} {settings.currency_emoji}
                  </p>
                </div>
                {r.status !== 'pending' && (
                  <span className={clsx('chip', r.status === 'refused' ? '!border-coral/30 !text-coral' : '!border-mint/30 !text-mint')}>
                    {r.status === 'refused' ? 'Refusée' : 'Accordée'}
                  </span>
                )}
              </div>
              {r.status === 'pending' && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => resolve(r, false)} className="btn-danger flex-1 text-sm"><X size={15} /> Refuser</button>
                  <button onClick={() => resolve(r, true)} className="btn-mint flex-1 text-sm"><Check size={15} /> Accorder</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {tab === 'contract' && <ContractTab />}

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Modifier' : 'Nouvelle récompense'}
             footer={
               <div className="flex gap-2">
                 {edit?.id && (
                   <button onClick={async () => { await supabase.from('rewards').delete().eq('id', edit.id!); setEdit(null); load(); }}
                           className="btn-danger !px-4"><Trash2 size={16} /></button>
                 )}
                 <button onClick={save} className="btn-primary flex-1 !py-3.5">Enregistrer</button>
               </div>
             }>
        {edit && (
          <div className="space-y-4">
            <div>
              <label className="label">Icône</label>
              <div className="grid grid-cols-10 gap-1.5">
                {EMOJIS.map((e) => (
                  <button key={e} onClick={() => setEdit({ ...edit, emoji: e })}
                          className={clsx('aspect-square rounded-xl border text-lg transition',
                            edit.emoji === e ? 'border-brand bg-brand/20' : 'border-line bg-raised')}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">Nom</label>
              <input className="field" value={edit.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                     placeholder="Ex : 10 € d’argent de poche" />
            </div>
            <div>
              <label className="label">Détail</label>
              <input className="field" value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                     placeholder="Versés le dimanche" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Prix · {settings.currency_name}</label>
                <input type="number" className="field" value={edit.cost ?? 100}
                       onChange={(e) => setEdit({ ...edit, cost: Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Catégorie</label>
                <input className="field" value={edit.category ?? ''} onChange={(e) => setEdit({ ...edit, category: e.target.value })}
                       placeholder="Écran, Argent…" />
              </div>
            </div>
            <div>
              <label className="label">Condition (facultatif)</label>
              <input className="field" value={edit.condition ?? ''} onChange={(e) => setEdit({ ...edit, condition: e.target.value })}
                     placeholder="Ex : seulement si la semaine est complète" />
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                Affiché à Jeanne au moment de l’échange. Tu restes maître de l’accord final.
              </p>
            </div>
            <label className="flex items-center gap-3 rounded-2xl border border-line bg-raised px-4 py-3">
              <input type="checkbox" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
                     className="h-5 w-5 accent-[#7C5CFF]" />
              <span className="text-sm font-semibold">Visible dans sa boutique</span>
            </label>
          </div>
        )}
      </Sheet>
    </main>
  );
}

/* ------------------------------------------------------- contrat hebdo */
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
    if (!c.title?.trim() || !c.reward_text?.trim()) { toast('Titre et récompense obligatoires', 'err'); return; }
    const payload = {
      child_id: child.id, week_start: ws, title: c.title.trim(), metric: c.metric ?? 'tasks_done',
      target: Number(c.target) || 1, reward_text: c.reward_text.trim(),
      reward_coins: Number(c.reward_coins) || 0, status: c.status ?? 'proposed',
    };
    const { error } = await supabase.from('contracts').upsert(payload, { onConflict: 'child_id,week_start' });
    if (error) toast(error.message, 'err');
    else toast('Contrat proposé à Jeanne 🤝');
  };

  return (
    <div className="mt-5 space-y-4">
      <div className="card border-brand/25 p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-brand-soft"><Handshake size={15} /> Contrat de la semaine</p>
        <p className="mt-1.5 text-xs leading-relaxed text-white/70">
          Un objectif unique, négocié, avec une vraie récompense au bout. Elle doit l’accepter dans son app —
          c’est cette acceptation qui crée l’adhésion, pas l’objectif lui-même.
        </p>
      </div>

      <div>
        <label className="label">Objectif</label>
        <input className="field" value={c.title ?? ''} onChange={(e) => setC({ ...c, title: e.target.value })}
               placeholder="Ex : une semaine complète sans aucun report" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Mesure</label>
          <select className="field" value={c.metric} onChange={(e) => setC({ ...c, metric: e.target.value as any })}>
            <option value="tasks_done">Tâches terminées</option>
            <option value="coins">Points gagnés</option>
            <option value="minutes">Minutes de travail</option>
            <option value="perfect_days">Journées parfaites</option>
          </select>
        </div>
        <div>
          <label className="label">Cible</label>
          <input type="number" className="field" value={c.target ?? 0} onChange={(e) => setC({ ...c, target: Number(e.target.value) })} />
        </div>
      </div>
      <div>
        <label className="label">Récompense promise</label>
        <input className="field" value={c.reward_text ?? ''} onChange={(e) => setC({ ...c, reward_text: e.target.value })}
               placeholder="Ex : 20 € et une sortie samedi" />
      </div>
      <div>
        <label className="label">Bonus en {settings.currency_name}</label>
        <input type="number" className="field" value={c.reward_coins ?? 0} onChange={(e) => setC({ ...c, reward_coins: Number(e.target.value) })} />
      </div>
      {c.status && c.status !== 'proposed' && (
        <p className="chip !border-mint/30 !bg-mint/10 !text-mint">
          {c.status === 'accepted' ? 'Accepté par Jeanne ✓' : c.status === 'achieved' ? '🏆 Rempli' : 'Non atteint'}
        </p>
      )}
      <button onClick={save} className="btn-primary w-full !py-3.5">Proposer le contrat</button>
    </div>
  );
}
