'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import ParentShell from '@/components/ParentShell';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { suggestCoins, levelOf } from '@/lib/economy';
import { Loader, SegmentedTabs, Toggle, toast } from '@/components/ui';
import type { Settings, Tone, ParentNotifKind, ChildNotifKind } from '@/lib/types';

export default function RulesPage() { return <ParentShell><Rules /></ParentShell>; }

const CURRENCIES = ['🪙', '⭐', '💎', '🔶', '🍬', '⚡', '🏅', '🌟'];

const PARENT_NOTIFS: { k: ParentNotifKind; emoji: string; label: string }[] = [
  { k: 'task_submitted', emoji: '👁️', label: 'Demande de validation' },
  { k: 'not_started',    emoji: '⏰', label: 'Tâche non démarrée' },
  { k: 'blocked',        emoji: '🆘', label: 'Elle bloque' },
  { k: 'quiz_done',      emoji: '🧠', label: 'Quiz terminé' },
  { k: 'purchase',       emoji: '🎁', label: 'Achat en boutique' },
  { k: 'badge',          emoji: '🏆', label: 'Badge débloqué' },
  { k: 'level_up',       emoji: '⭐', label: 'Montée de niveau' },
  { k: 'mood',           emoji: '💭', label: 'Humeur déclarée' },
  { k: 'recap',          emoji: '📊', label: 'Bilan du soir' },
];

const CHILD_NOTIFS: { k: ChildNotifKind; emoji: string; label: string }[] = [
  { k: 'reminders',        emoji: '🔔', label: 'Rappels des tâches' },
  { k: 'task_created',     emoji: '📝', label: 'Nouvelle tâche ajoutée' },
  { k: 'kudos',            emoji: '💜', label: 'Encouragements' },
  { k: 'validation',       emoji: '✅', label: 'Résultat de validation' },
  { k: 'reward_created',   emoji: '🎁', label: 'Nouvelle récompense' },
  { k: 'contract_created', emoji: '🤝', label: 'Nouveau contrat' },
  { k: 'level_up',         emoji: '⭐', label: 'Montée de niveau' },
];

function Rules() {
  const { settings, refresh, signOut, child } = useApp();
  const [s, setS] = useState<Settings | null>(null);
  const [tab, setTab] = useState<'eco' | 'xp' | 'rules' | 'notif' | 'goal'>('eco');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (settings) setS(settings); }, [settings]);
  if (!s) return <Loader />;

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });

  const save = async () => {
    setBusy(true);
    const { id, ...rest } = s;
    const { error } = await supabase.from('settings').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', 1);
    setBusy(false);
    if (error) toast(error.message, 'err');
    else { await refresh(); toast('Enregistré'); }
  };

  const Num = ({ k, label, suffix }: { k: keyof Settings; label: string; suffix?: string }) => (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <input type="number" className="field flex-1" value={s[k] as number}
               onChange={(e) => set(k, Number(e.target.value) as any)} />
        {suffix && <span className="shrink-0 text-lg font-black text-muted">{suffix}</span>}
      </div>
    </div>
  );

  const Time = ({ k, label }: { k: keyof Settings; label: string }) => (
    <div>
      <label className="label">{label}</label>
      <input type="time" className="field" value={String(s[k]).slice(0, 5)} onChange={(e) => set(k, e.target.value as any)} />
    </div>
  );

  return (
    <main className="mx-auto max-w-lg px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <h1 className="text-3xl font-black text-ink">Réglages</h1>

      <div className="mt-4">
        <SegmentedTabs value={tab} onChange={setTab} options={[
          { value: 'eco',   label: '💰 Points' },
          { value: 'xp',    label: '⚡ XP' },
          { value: 'rules', label: '🛡️ Règles' },
          { value: 'notif', label: '🔔 Notifs' },
          { value: 'goal',  label: '🎯 Cadre' },
        ]} />
      </div>

      <div className="mt-5 space-y-5">
        {tab === 'eco' && (
          <>
            <div>
              <label className="label">Nom de la monnaie</label>
              <input className="field" value={s.currency_name} onChange={(e) => set('currency_name', e.target.value)} />
            </div>
            <div>
              <label className="label">Symbole</label>
              <div className="grid grid-cols-8 gap-2">
                {CURRENCIES.map((c) => (
                  <button key={c} onClick={() => set('currency_emoji', c)}
                          className={clsx('grid aspect-square place-items-center rounded-2xl border-2 text-xl',
                            s.currency_emoji === c ? 'border-grape bg-grape-light' : 'border-line bg-card')}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <Num k="base_coins" label="Points de base par tâche" />
            <Num k="coins_per_10min" label="Points par 10 minutes" />
            <div className="card bg-soft p-4">
              <ul className="space-y-2">
                {[[30, 1], [45, 2], [60, 3], [90, 4]].map(([d, diff]) => (
                  <li key={d} className="flex justify-between font-extrabold">
                    <span className="text-muted">{d} min · {['🙂', '😐', '😤', '🔥'][diff - 1]}</span>
                    <span className="text-grape">{suggestCoins(s, d, diff)} {s.currency_emoji}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Num k="punctuality_bonus_pct" label="Bonus ponctualité" suffix="%" />
            <Num k="streak_bonus_pct" label="Bonus série" suffix="%" />
            <Num k="perfect_day_bonus" label="Bonus journée parfaite" suffix={s.currency_emoji} />
            <Num k="quiz_coins_per_answer" label="Points par bonne réponse" suffix={s.currency_emoji} />
          </>
        )}

        {tab === 'xp' && (
          <>
            <Num k="xp_per_task" label="XP par tâche" suffix="⚡" />
            <Num k="xp_per_quiz_answer" label="XP par bonne réponse" suffix="⚡" />
            <Num k="xp_per_level" label="XP pour monter d’un niveau" suffix="⚡" />
            <Num k="level_up_coins" label="Bonus à chaque niveau" suffix={s.currency_emoji} />
            <Num k="daily_xp_goal" label="Objectif XP quotidien" suffix="⚡" />
            <div className="card bg-soft p-4">
              <p className="mb-3 font-black text-ink">Aperçu des niveaux</p>
              <ul className="space-y-2">
                {[1, 5, 10, 20, 30].map((lv) => {
                  const info = levelOf((lv - 1) * s.xp_per_level, s.xp_per_level);
                  return (
                    <li key={lv} className="flex justify-between font-extrabold">
                      <span className="text-muted">Niveau {lv}</span>
                      <span className="text-grape">{info.title} · {(lv - 1) * s.xp_per_level} ⚡</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}

        {tab === 'rules' && (
          <>
            <Toggle emoji="📷" label="Photo de preuve" checked={s.default_require_photo}
                    onChange={(v) => set('default_require_photo', v)} />
            <Toggle emoji="👁️" label="Validation parent" checked={s.default_require_validation}
                    onChange={(v) => set('default_require_validation', v)} />
            <div>
              <label className="label">⏱️ Minuteur minimum · {s.default_min_timer_pct}%</label>
              <input type="range" min={0} max={100} step={10} className="w-full accent-grape"
                     value={s.default_min_timer_pct} onChange={(e) => set('default_min_timer_pct', Number(e.target.value))} />
            </div>
            <Num k="max_postpones_per_day" label="Reports par jour" />
            <Num k="postpone_minutes" label="Durée d’un report" suffix="min" />
            <Num k="max_daily_minutes" label="Charge max par jour" suffix="min" />
          </>
        )}

        {tab === 'notif' && (
          <>
            <div>
              <label className="label">Ton des messages</label>
              <div className="grid grid-cols-2 gap-2.5">
                {(['doux', 'neutre', 'ferme', 'humour'] as Tone[]).map((t) => (
                  <button key={t} onClick={() => set('notif_tone', t)}
                          className={clsx('rounded-3xl border-2 py-3.5 font-extrabold capitalize transition',
                            s.notif_tone === t ? 'border-grape bg-grape-light text-grape' : 'border-line bg-card text-muted')}>
                    {{ doux: '🤍 Doux', neutre: '⚪ Neutre', ferme: '🎯 Ferme', humour: '😄 Humour' }[t]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label">Ce que je reçois</label>
              <div className="space-y-2.5">
                {PARENT_NOTIFS.map((n) => (
                  <Toggle key={n.k} emoji={n.emoji} label={n.label}
                          checked={s.notif_parent?.[n.k] ?? true}
                          onChange={(v) => set('notif_parent', { ...(s.notif_parent ?? {}), [n.k]: v } as any)} />
                ))}
              </div>
            </div>

            <div>
              <label className="label">Ce que Jeanne reçoit</label>
              <div className="space-y-2.5">
                {CHILD_NOTIFS.map((n) => (
                  <Toggle key={n.k} emoji={n.emoji} label={n.label}
                          checked={s.notif_child?.[n.k] ?? true}
                          onChange={(v) => set('notif_child', { ...(s.notif_child ?? {}), [n.k]: v } as any)} />
                ))}
              </div>
            </div>

            <div>
              <label className="label">Rappels (minutes)</label>
              <input className="field" value={s.reminder_offsets.join(', ')}
                     onChange={(e) => set('reminder_offsets', e.target.value.split(',').map((x) => Number(x.trim())).filter((n) => !isNaN(n)))} />
            </div>
            <Num k="parent_alert_after" label="M’alerter après" suffix="min" />
            <Time k="morning_checkin_time" label="Réveil" />
            <Time k="tomorrow_preview_time" label="Aperçu de demain" />
            <Time k="evening_recap_time" label="Bilan du soir" />
          </>
        )}

        {tab === 'goal' && (
          <>
            <div>
              <label className="label">Objectif de fond</label>
              <input className="field" value={s.goal_title} onChange={(e) => set('goal_title', e.target.value)} />
            </div>
            <div>
              <label className="label">Date cible</label>
              <input type="date" className="field" value={s.goal_date ?? ''} onChange={(e) => set('goal_date', e.target.value || null)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Time k="day_start" label="Début de journée" />
              <Time k="day_end" label="Fin de journée" />
            </div>
            <div className="card p-4">
              <p className="font-extrabold text-ink">👧 {child?.display_name ?? '—'}</p>
            </div>
            <button onClick={signOut} className="btn-plain w-full">Se déconnecter</button>
          </>
        )}
      </div>

      <button onClick={save} disabled={busy} className="btn-grape btn-lg sticky bottom-28 mt-7 w-full shadow-lift">
        {busy ? '…' : '💾 Enregistrer'}
      </button>
    </main>
  );
}
