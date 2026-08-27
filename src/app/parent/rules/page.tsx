'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Save, LogOut, Bell, Coins, ShieldCheck, Clock, Target } from 'lucide-react';
import ParentShell from '@/components/ParentShell';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { suggestCoins } from '@/lib/economy';
import { humanDuration } from '@/lib/dates';
import { notifCopy } from '@/lib/tone';
import { Loader, SegmentedTabs, toast } from '@/components/ui';
import type { Settings, Tone } from '@/lib/types';

export default function RulesPage() { return <ParentShell><Rules /></ParentShell>; }

const CURRENCIES = ['🪙','⭐','💎','🔶','🍬','⚡','🏅','🌟'];

function Rules() {
  const { settings, refresh, signOut, child } = useApp();
  const [s, setS] = useState<Settings | null>(null);
  const [tab, setTab] = useState<'eco' | 'rules' | 'notif' | 'frame'>('eco');
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
    else { await refresh(); toast('Réglages enregistrés ✅'); }
  };

  const Num = ({ k, label, hint, min = 0, max, step = 1, suffix }: {
    k: keyof Settings; label: string; hint?: string; min?: number; max?: number; step?: number; suffix?: string;
  }) => (
    <div>
      <label className="label !mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input type="number" min={min} max={max} step={step} className="field flex-1"
               value={s[k] as number} onChange={(e) => set(k, Number(e.target.value) as any)} />
        {suffix && <span className="shrink-0 text-sm text-muted">{suffix}</span>}
      </div>
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{hint}</p>}
    </div>
  );

  const Toggle = ({ k, label, hint }: { k: keyof Settings; label: string; hint?: string }) => (
    <label className="flex items-start gap-3 rounded-2xl border border-line bg-raised px-4 py-3.5">
      <input type="checkbox" checked={s[k] as boolean} onChange={(e) => set(k, e.target.checked as any)}
             className="mt-0.5 h-5 w-5 shrink-0 accent-[#7C5CFF]" />
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {hint && <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{hint}</p>}
      </div>
    </label>
  );

  const Time = ({ k, label, hint }: { k: keyof Settings; label: string; hint?: string }) => (
    <div>
      <label className="label !mb-1.5">{label}</label>
      <input type="time" className="field" value={String(s[k]).slice(0, 5)} onChange={(e) => set(k, e.target.value as any)} />
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{hint}</p>}
    </div>
  );

  return (
    <main className="mx-auto max-w-lg px-4 pb-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <h1 className="text-2xl font-black tracking-tight">Règles du jeu</h1>
      <p className="mt-1 text-sm text-muted">Tout est paramétrable. Ces valeurs s’appliquent par défaut à chaque tâche.</p>

      <div className="mt-4">
        <SegmentedTabs value={tab} onChange={setTab} options={[
          { value: 'eco', label: '💰 Économie' },
          { value: 'rules', label: '🛡️ Contraintes' },
          { value: 'notif', label: '🔔 Rappels' },
          { value: 'frame', label: '🎯 Cadre' },
        ]} />
      </div>

      <div className="mt-5 space-y-5">
        {tab === 'eco' && (
          <>
            <Section icon={<Coins size={14} />} title="La monnaie" />
            <div>
              <label className="label">Nom</label>
              <input className="field" value={s.currency_name} onChange={(e) => set('currency_name', e.target.value)}
                     placeholder="Jeannots, Points, Étoiles…" />
            </div>
            <div>
              <label className="label">Symbole</label>
              <div className="flex gap-2">
                {CURRENCIES.map((c) => (
                  <button key={c} onClick={() => set('currency_emoji', c)}
                          className={clsx('flex-1 rounded-xl border py-3 text-xl transition',
                            s.currency_emoji === c ? 'border-brand bg-brand/20' : 'border-line bg-raised')}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <Section icon={<Coins size={14} />} title="Barème automatique" />
            <Num k="base_coins" label="Points de base par tâche" />
            <Num k="coins_per_10min" label="Points par tranche de 10 minutes" />
            <div className="card bg-raised/60 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Aperçu du barème</p>
              <ul className="mt-2 space-y-1 text-sm">
                {[[30, 1], [45, 2], [60, 3], [90, 4]].map(([d, diff]) => (
                  <li key={d} className="flex justify-between">
                    <span className="text-white/70">{d} min · {['Facile', 'Normal', 'Dur', 'Costaud'][diff - 1]}</span>
                    <span className="font-black text-brand-soft">{suggestCoins(s, d, diff)} {s.currency_emoji}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Section icon={<Coins size={14} />} title="Bonus" />
            <Num k="punctuality_bonus_pct" label="Bonus de ponctualité" suffix="%"
                 hint="Appliqué si elle démarre à l’heure prévue (tolérance 5 min). C’est le bonus le plus efficace : il récompense le démarrage, qui est le vrai obstacle." />
            <Num k="streak_bonus_pct" label="Bonus de série" suffix="%" hint="Actif à partir de 3 jours consécutifs." />
            <Num k="perfect_day_bonus" label="Bonus journée parfaite" suffix={s.currency_emoji}
                 hint="Versé quand toutes les tâches du jour sont terminées." />
            <Num k="quiz_coins_per_answer" label="Points par bonne réponse au quiz" suffix={s.currency_emoji} />
            <Num k="xp_per_level" label="XP nécessaires par niveau" min={50} step={50} />
          </>
        )}

        {tab === 'rules' && (
          <>
            <Section icon={<ShieldCheck size={14} />} title="Preuve de travail" />
            <Toggle k="default_require_photo" label="📷 Photo de preuve par défaut"
                    hint="Elle doit photographier son cahier pour valider. Surchargeable tâche par tâche." />
            <Toggle k="default_require_validation" label="👁️ Ta validation avant les points"
                    hint="Les points n’arrivent qu’après ton feu vert. Efficace, mais si tu tardes à valider, la récompense perd son effet — n’active que sur les tâches qui comptent." />

            <Section icon={<Clock size={14} />} title="Minuteur bloquant" />
            <div>
              <label className="label !mb-1.5">Temps minimum avant validation · {s.default_min_timer_pct} %</label>
              <input type="range" min={0} max={100} step={10} className="w-full accent-[#7C5CFF]"
                     value={s.default_min_timer_pct} onChange={(e) => set('default_min_timer_pct', Number(e.target.value))} />
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                Sur une tâche de 45 min, elle ne pourra pas valider avant{' '}
                <b>{Math.round((45 * s.default_min_timer_pct) / 100)} min</b>. À 0 %, elle peut cocher instantanément.
              </p>
            </div>

            <Section icon={<ShieldCheck size={14} />} title="Reports" />
            <Num k="max_postpones_per_day" label="Reports autorisés par jour" max={10}
                 hint="La rareté force le choix. Au-delà de 3, le report perd tout son sens." />
            <Num k="postpone_minutes" label="Durée d’un report" suffix="min" step={5} />
            <Num k="max_daily_minutes" label="Charge maximale par jour" suffix="min" step={15}
                 hint={`Soit ${humanDuration(s.max_daily_minutes)}. Au-delà, l’app t’avertit quand tu construis la journée — une journée irréaliste finit à zéro tâche faite.`} />
          </>
        )}

        {tab === 'notif' && (
          <>
            <Section icon={<Bell size={14} />} title="Ton des messages" />
            <div className="grid grid-cols-2 gap-2">
              {(['doux', 'neutre', 'ferme', 'humour'] as Tone[]).map((t) => (
                <button key={t} onClick={() => set('notif_tone', t)}
                        className={clsx('rounded-2xl border px-3 py-3 text-sm font-semibold capitalize transition',
                          s.notif_tone === t ? 'border-brand bg-brand/20 text-white' : 'border-line bg-raised text-muted')}>
                  {{ doux: '🤍 Doux', neutre: '⚪ Neutre', ferme: '🎯 Ferme', humour: '😄 Humour' }[t]}
                </button>
              ))}
            </div>
            <div className="card bg-raised/60 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Ce qu’elle recevra</p>
              {(['morning', 'start', 'nudge'] as const).map((k) => {
                const c = notifCopy(k, s.notif_tone, { task: 'Maths — exercices', time: '09:00', minutes: 10, count: 4, first: 'Maths', currency: s.currency_emoji, coins: 60, streak: 4 }, 7);
                return (
                  <div key={k} className="mt-3 rounded-2xl border border-line bg-ink/60 px-3.5 py-3">
                    <p className="text-sm font-bold">{c.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-white/65">{c.body}</p>
                  </div>
                );
              })}
            </div>

            <Section icon={<Bell size={14} />} title="Escalade" />
            <div>
              <label className="label !mb-1.5">Moments des rappels (min)</label>
              <input className="field" value={s.reminder_offsets.join(', ')}
                     onChange={(e) => set('reminder_offsets', e.target.value.split(',').map((x) => Number(x.trim())).filter((n) => !isNaN(n)))} />
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                Négatif = avant l’heure. <b>-15, 0, 10, 20</b> signifie : 15 min avant, à l’heure, puis relances
                à 10 et 20 min de retard.
              </p>
            </div>
            <Num k="parent_alert_after" label="M’alerter si non démarré après" suffix="min"
                 hint="Tu reçois une notification sur ton iPhone. C’est le garde-fou du système : rien ne passe inaperçu." />
            <Time k="tomorrow_preview_time" label="Aperçu de demain, le soir" hint="Supprime l’effet de surprise, réduit la résistance du matin." />
            <Time k="morning_checkin_time" label="Réveil / début de journée" hint="Essentiel en CNED : c’est ce message qui remplace la sonnerie du collège." />
            <Time k="evening_recap_time" label="Bilan du soir" />
          </>
        )}

        {tab === 'frame' && (
          <>
            <Section icon={<Target size={14} />} title="Le pourquoi" />
            <div>
              <label className="label">Objectif de fond</label>
              <input className="field" value={s.goal_title} onChange={(e) => set('goal_title', e.target.value)}
                     placeholder="Décrocher le Brevet" />
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                Affiché en permanence dans son app. Un effort sans destination visible ne tient pas.
              </p>
            </div>
            <div>
              <label className="label">Date cible</label>
              <input type="date" className="field" value={s.goal_date ?? ''} onChange={(e) => set('goal_date', e.target.value || null)} />
            </div>

            <Section icon={<Clock size={14} />} title="Horaires de la journée" />
            <div className="grid grid-cols-2 gap-3">
              <Time k="day_start" label="Début" />
              <Time k="day_end" label="Fin" />
            </div>

            <Section icon={<ShieldCheck size={14} />} title="Compte" />
            <div className="card p-4">
              <p className="text-sm"><b>Enfant suivi :</b> {child?.display_name ?? '—'}</p>
              <p className="mt-1 text-xs text-muted">Fuseau : {s.timezone}</p>
            </div>
            <button onClick={signOut} className="btn-soft w-full text-sm"><LogOut size={15} /> Se déconnecter</button>
          </>
        )}
      </div>

      <button onClick={save} disabled={busy} className="btn-primary sticky bottom-24 mt-7 w-full !py-4 shadow-2xl">
        <Save size={18} /> {busy ? 'Enregistrement…' : 'Enregistrer les réglages'}
      </button>
    </main>
  );
}

function Section({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 pt-3 text-xs font-bold uppercase tracking-wider text-brand-soft">
      {icon}{title}
    </div>
  );
}
