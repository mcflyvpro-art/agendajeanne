'use client';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import ParentShell from '@/components/ParentShell';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { suggestCoins } from '@/lib/economy';
import { calibrate, REFERENCE_DURATION } from '@/lib/calibrate';
import { notifCopy } from '@/lib/tone';
import Help, { LabelHelp } from '@/components/Help';
import { resetChildAccount } from '@/lib/reset';
import { Loader, SegmentedTabs, Toggle, NumberField, Sheet, toast } from '@/components/ui';
import LevelRoad from '@/components/LevelRoad';
import type { Reward } from '@/lib/types';
import type { Settings, Tone, ParentNotifKind, ChildNotifKind } from '@/lib/types';

export default function RulesPage() { return <ParentShell><Rules /></ParentShell>; }

const CURRENCIES = ['🪙', '⭐', '💎', '🔶', '🍬', '⚡', '🏅', '🌟'];

/** Décalages proposés pour les rappels, en minutes autour de l'heure prévue. */
const OFFSETS = [-30, -15, -10, -5, 0, 5, 10, 15, 20, 30, 45, 60];

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
  { k: 'message_reaction', emoji: '💌', label: 'Réaction à un message' },
];

const CHILD_NOTIFS: { k: ChildNotifKind; emoji: string; label: string }[] = [
  { k: 'reminders',        emoji: '🔔', label: 'Rappels des tâches' },
  { k: 'task_created',     emoji: '📝', label: 'Nouvelle tâche' },
  { k: 'kudos',            emoji: '💜', label: 'Encouragements' },
  { k: 'message',          emoji: '✉️', label: 'Message reçu' },
  { k: 'validation',       emoji: '✅', label: 'Résultat de validation' },
  { k: 'reward_created',   emoji: '🎁', label: 'Nouvelle récompense' },
  { k: 'contract_created', emoji: '🤝', label: 'Nouveau contrat' },
  { k: 'level_up',         emoji: '⭐', label: 'Montée de niveau' },
  { k: 'quiz_assigned',    emoji: '🧠', label: 'Nouveau quiz reçu' },
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

  const Num = ({ k, label, suffix, help }: {
    k: keyof Settings; label: string; suffix?: string; help?: React.ReactNode;
  }) => (
    <div>
      {help ? <LabelHelp label={label} help={help} /> : <label className="label">{label}</label>}
      <NumberField value={s[k] as number} suffix={suffix} onChange={(n) => set(k, n as any)} />
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
      <SecretResetTitle />

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
        {tab === 'eco' && <Calibrator s={s} onApply={(v) => setS({ ...s, ...v })} />}

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

            <Num k="base_coins" label="Points de base par tâche"
                 help={<>
                   <p>Chaque tâche rapporte ce montant de départ, quelle que soit sa durée.</p>
                   <p>La formule complète est : <b>base + (points par 10 min × durée) × difficulté</b>.</p>
                   <p>Augmenter cette valeur récompense surtout le fait de <b>commencer</b> une tâche, pas d’y passer du temps.</p>
                 </>} />
            <Num k="coins_per_10min" label="Points par 10 minutes"
                 help={<>
                   <p>S’ajoute au montant de base, proportionnellement à la durée prévue.</p>
                   <p>Augmenter cette valeur récompense les <b>tâches longues</b>. À l’inverse, la baisser met tout le monde à égalité et pousse à enchaîner les petites tâches.</p>
                 </>} />

            <div className="card bg-soft p-4">
              <p className="mb-3 font-black text-ink">Ce que ça donne</p>
              <ul className="space-y-2">
                {[[30, 1], [45, 2], [60, 3], [90, 4]].map(([d, diff]) => (
                  <li key={d} className="flex justify-between font-extrabold">
                    <span className="text-muted">{d} min · {['🙂', '😐', '😤', '🔥'][diff - 1]}</span>
                    <span className="text-grape">{suggestCoins(s, d, diff)} {s.currency_emoji}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Num k="punctuality_bonus_pct" label="Bonus ponctualité" suffix="%"
                 help={<>
                   <p>Ajouté si elle démarre dans les 5 minutes suivant l’heure prévue.</p>
                   <p>C’est le bonus le plus utile : le vrai obstacle n’est pas de travailler, c’est de <b>s’y mettre</b>. Le récompenser attaque le problème à la racine.</p>
                 </>} />
            <Num k="streak_bonus_pct" label="Bonus série" suffix="%"
                 help={<>
                   <p>Ajouté à partir de <b>3 jours consécutifs</b> de journées complètes.</p>
                   <p>Il rend une série longue de plus en plus précieuse — donc de plus en plus dommage à casser.</p>
                 </>} />
            <Num k="perfect_day_bonus" label="Bonus journée parfaite" suffix={s.currency_emoji}
                 help={<>
                   <p>Versé une seule fois par jour, quand <b>toutes</b> les tâches prévues sont terminées.</p>
                   <p>C’est ce qui pousse à finir la dernière tâche plutôt qu’à s’arrêter à 80 %.</p>
                 </>} />
            <Num k="quiz_coins_per_answer" label="Points par bonne réponse" suffix={s.currency_emoji} />
          </>
        )}

        {tab === 'xp' && (
          <>
            <div className="card bg-soft p-4">
              <LabelHelp label="À quoi servent les XP ?" title="Points et XP, quelle différence ?"
                         help={<>
                           <p><b>Les points</b> se dépensent en boutique. C’est une monnaie : le solde monte et descend.</p>
                           <p><b>Les XP</b> ne se dépensent jamais. Ils ne font que monter et servent uniquement à passer les niveaux.</p>
                           <p>Les deux sont utiles ensemble : les points donnent une raison concrète de travailler, les XP donnent le sentiment de progresser même une semaine où elle dépense tout.</p>
                         </>} />
              <p className="text-sm font-medium text-muted">
                Les points s’achètent, les XP se cumulent. Un niveau se gagne, il ne se perd pas.
              </p>
            </div>

            <Num k="xp_per_task" label="XP par tâche" suffix="⚡"
                 help={<><p>Multiplié par la difficulté de la tâche, comme les points.</p></>} />
            <Num k="xp_per_quiz_answer" label="XP par bonne réponse" suffix="⚡" />
            <LevelPace s={s} onGoToEco={() => setTab('eco')} onChange={(v) => setS({ ...s, ...v })} />
            <Num k="level_up_coins" label="Bonus à chaque niveau" suffix={s.currency_emoji} />
            <Num k="daily_xp_goal" label="Objectif XP du jour" suffix="⚡"
                 help={<>
                   <p>La jauge affichée en haut de son écran d’accueil.</p>
                   <p>Cale-le sur une journée normale de travail : atteignable tous les jours, mais seulement si elle fait ce qui est prévu.</p>
                 </>} />

            <RoadPreviewButton s={s} />
          </>
        )}

        {tab === 'rules' && (
          <>
            <Toggle emoji="📷" label="Photo de preuve" checked={s.default_require_photo}
                    onChange={(v) => set('default_require_photo', v)} />
            <Toggle emoji="👁️" label="Validation parent" checked={s.default_require_validation}
                    onChange={(v) => set('default_require_validation', v)} />

            <div>
              <LabelHelp label={`⏱️ Minuteur minimum · ${s.default_min_timer_pct} %`} title="Minuteur minimum"
                         help={<>
                           <p>Part de la durée prévue qu’elle doit réellement passer sur la tâche avant que le bouton « J’ai fini » se débloque.</p>
                           <p>À <b>60 %</b>, une tâche de 45 min se valide au bout de 27 minutes.</p>
                           <p>À <b>0 %</b>, elle peut cocher instantanément.</p>
                           <p>Le chrono ne tourne que si l’app est affichée : sortir de l’app le met en pause.</p>
                         </>} />
              <input type="range" min={0} max={100} step={10} className="w-full accent-grape"
                     value={s.default_min_timer_pct} onChange={(e) => set('default_min_timer_pct', Number(e.target.value))} />
              <p className="mt-2 text-sm font-bold text-muted">
                Une tâche de 45 min se valide après {Math.round((45 * s.default_min_timer_pct) / 100)} min
              </p>
            </div>

            <Num k="max_postpones_per_day" label="Reports par jour"
                 help={<>
                   <p>Nombre de fois où elle peut repousser une tâche dans la journée.</p>
                   <p>La rareté est le point important : au-delà de 3, reporter ne coûte plus rien et l’option perd son sens.</p>
                 </>} />
            <Num k="postpone_minutes" label="Durée d’un report" suffix="min" />
            <Num k="max_daily_minutes" label="Charge max par jour" suffix="min"
                 help={<>
                   <p>Seuil au-delà duquel l’app vous prévient en construisant la journée.</p>
                   <p>Une journée irréaliste ne produit pas « un peu moins de travail » : elle produit souvent <b>zéro tâche faite</b>, parce que l’ensemble paraît insurmontable.</p>
                 </>} />
            <Num k="mood_per_day" label="Humeurs par jour"
                 help={<>
                   <p>Nombre de fois où elle peut déclarer son humeur dans la journée.</p>
                   <p>À 1, la question disparaît de son écran dès qu’elle a répondu.</p>
                 </>} />

            <div>
              <LabelHelp label="🧠 Création de quiz" title="Autoriser la création de quiz"
                         help={<>
                           <p>Quand c’est désactivé, le bouton photo disparaît de son écran quiz : elle ne peut plus en générer de nouveaux, seulement faire ceux que vous lui envoyez.</p>
                           <p>Utile pour éviter des photos inutiles, ou toujours la même leçon reprise en boucle.</p>
                         </>} />
              <Toggle emoji="📸" label="Elle peut créer ses propres quiz"
                      checked={s.child_can_create_quiz} onChange={(v) => set('child_can_create_quiz', v)} />
            </div>
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

            <TonePreview tone={s.notif_tone} currency={s.currency_emoji} />

            <div>
              <LabelHelp label="🔔 Quand la prévenir" title="Rappels d’une tâche"
                         help={<>
                           <p>Chaque pastille est un rappel envoyé sur son téléphone, situé par rapport à l’heure prévue.</p>
                           <p><b>−15 min</b> = un quart d’heure avant, pour préparer ses affaires.</p>
                           <p><b>À l’heure</b> = le signal de départ.</p>
                           <p><b>+10 min</b> et au-delà = relances si rien n’a démarré, avec un ton qui se durcit.</p>
                         </>} />
              <div className="flex flex-wrap gap-2">
                {OFFSETS.map((o) => {
                  const on = s.reminder_offsets.includes(o);
                  return (
                    <button key={o}
                            onClick={() => set('reminder_offsets',
                              (on ? s.reminder_offsets.filter((x) => x !== o) : [...s.reminder_offsets, o]).sort((a, b) => a - b))}
                            className={clsx('rounded-2xl border-2 px-3.5 py-2.5 text-sm font-extrabold transition no-select',
                              on ? 'border-grape bg-grape text-white' : 'border-line bg-card text-muted')}>
                      {o === 0 ? 'À l’heure' : o < 0 ? `${-o} min avant` : `+${o} min`}
                    </button>
                  );
                })}
              </div>
              {s.reminder_offsets.length === 0 && (
                <p className="mt-2 text-sm font-bold text-flame">Aucun rappel : elle ne sera jamais prévenue.</p>
              )}
            </div>

            <Num k="parent_alert_after" label="M’alerter après" suffix="min"
                 help={<>
                   <p>Délai après l’heure prévue au-delà duquel <b>vous</b> recevez une alerte si rien n’a démarré.</p>
                   <p>C’est le garde-fou du système : sans lui, une journée peut passer sans que personne ne s’en rende compte.</p>
                 </>} />

            <div className="grid grid-cols-1 gap-3">
              <Time k="morning_checkin_time" label="Réveil" />
              <Time k="tomorrow_preview_time" label="Aperçu de demain" />
              <Time k="evening_recap_time" label="Bilan du soir" />
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
              <label className="label">Ce que {child?.display_name ?? 'Jeanne'} reçoit</label>
              <div className="space-y-2.5">
                {CHILD_NOTIFS.map((n) => (
                  <Toggle key={n.k} emoji={n.emoji} label={n.label}
                          checked={s.notif_child?.[n.k] ?? true}
                          onChange={(v) => set('notif_child', { ...(s.notif_child ?? {}), [n.k]: v } as any)} />
                ))}
              </div>
            </div>
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

/* ------------------------------------------------------------ calibrage -- */
/**
 * Deux chiffres suffisent : le rythme visé et ce qu'une bonne semaine doit
 * rapporter. Le barème complet s'en déduit — voir `calibrate.ts`.
 */
function Calibrator({ s, onApply }: { s: Settings; onApply: (v: Partial<Settings>) => void }) {
  const [tasks, setTasks] = useState(s.calib_tasks_per_day ?? 4);
  const [target, setTarget] = useState(s.calib_weekly_target ?? 1200);
  // Un barème est toujours « en vigueur » (des valeurs par défaut existent
  // depuis le début) : le formulaire reste donc replié tant qu'on n'a pas
  // explicitement demandé à le modifier, pour ne pas envahir l'écran à chaque
  // visite.
  const [editing, setEditing] = useState(false);

  const calc = calibrate(s, tasks, target);
  const gap = calc.perWeek - target;

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)}
              className="card flex w-full items-center gap-3 p-4 text-left no-select active:scale-[.99]">
        <span className="text-2xl">🔧</span>
        <div className="min-w-0 flex-1">
          <p className="font-black text-ink">Barème actuel</p>
          <p className="text-sm font-bold text-muted">
            {s.calib_tasks_per_day ?? 4} tâches/jour · objectif {s.calib_weekly_target ?? 1200} {s.currency_emoji}/semaine
          </p>
        </div>
        <span className="chip !border-grape !text-grape">Modifier</span>
      </button>
    );
  }

  return (
    <section className="card bg-soft p-4">
      <div className="mb-1 flex items-center gap-2">
        <p className="text-base font-black text-ink">Calibrer automatiquement</p>
        <Help title="Comment ça marche ?">
          <p>Vous donnez deux chiffres, l’app calcule tout le barème à votre place.</p>
          <p><b>Tâches par jour</b> : le rythme que vous visez pour une journée normale.</p>
          <p><b>Objectif de la semaine</b> : ce qu’une semaine où tout est fait doit rapporter.</p>
          <p>Le repère utile est le prix de vos récompenses : si les 10 € d’argent de poche coûtent 1 200 points, mettez 1 200 pour qu’une semaine parfaite les rapporte tout juste.</p>
          <p>L’app répartit ensuite le montant entre une part fixe, versée dès qu’une tâche est finie, et une part proportionnelle à sa durée.</p>
        </Help>
      </div>
      <p className="mb-4 text-sm font-medium text-muted">
        Deux chiffres, et le barème se règle tout seul.
      </p>

      <div className="space-y-4">
        <div>
          <label className="label">Tâches par jour</label>
          <NumberField value={tasks} min={1} onChange={setTasks} />
        </div>

        <div>
          <label className="label">Objectif d’une bonne semaine</label>
          <NumberField value={target} min={0} suffix={s.currency_emoji} onChange={setTarget} />
          <div className="mt-2 flex flex-wrap gap-2">
            {[600, 900, 1200, 1800, 2400].map((n) => (
              <button key={n} onClick={() => setTarget(n)} className="chip">{n}</button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border-2 border-line bg-card p-4">
          <p className="mb-2.5 font-black text-ink">Ce que ça donnera</p>
          <ul className="space-y-1.5 text-sm font-bold">
            <li className="flex justify-between">
              <span className="text-muted">Une tâche de {REFERENCE_DURATION} min</span>
              <span className="text-ink">{calc.perTask} {s.currency_emoji}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted">…si elle démarre à l’heure</span>
              <span className="text-ink">{calc.perTaskWithBonus} {s.currency_emoji}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-muted">Une journée complète</span>
              <span className="text-ink">{calc.perDay} {s.currency_emoji}</span>
            </li>
            <li className="flex justify-between border-t-2 border-line pt-1.5">
              <span className="text-muted">Une semaine complète</span>
              <span className="text-grape">{calc.perWeek} {s.currency_emoji}</span>
            </li>
          </ul>
          {Math.abs(gap) > target * 0.03 && (
            <p className="mt-2.5 text-xs font-bold text-muted">
              {gap > 0 ? '+' : ''}{gap} par rapport à votre objectif (arrondis).
            </p>
          )}
        </div>

        <button
          onClick={() => {
            onApply({ ...calc.values, calib_tasks_per_day: tasks, calib_weekly_target: target });
            setEditing(false);
            toast('Barème calculé — pense à enregistrer');
          }}
          className="btn-grape w-full">
          Appliquer ce barème
        </button>
        <button onClick={() => setEditing(false)} className="btn-plain w-full">Annuler</button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------ rythme des niveaux */
/**
 * Plutôt que de fixer un nombre d'XP arbitraire, le parent choisit directement
 * en combien de jours un niveau doit tomber si Jeanne fait tout ce qui est
 * prévu. Le calcul se base sur le rythme quotidien déjà choisi dans l'onglet
 * Points : sans lui, impossible de savoir combien d'XP une journée rapporte.
 */
function LevelPace({ s, onChange, onGoToEco }: {
  s: Settings; onChange: (v: Partial<Settings>) => void; onGoToEco: () => void;
}) {
  const dailyXp = s.xp_per_task * Math.max(1, s.calib_tasks_per_day || 0);
  const notSet = !s.calib_tasks_per_day;
  const [days, setDays] = useState(Math.max(1, Math.round(s.xp_per_level / Math.max(1, dailyXp))));

  if (notSet) {
    return (
      <div className="card border-2 border-sun bg-sun-light p-4">
        <p className="font-extrabold text-ink">Rythme quotidien pas encore choisi</p>
        <p className="mt-1.5 text-sm font-medium text-muted">
          Réglez d’abord le nombre de tâches par jour visé, dans l’onglet Points — l’app calculera ensuite le rythme des niveaux à partir de là.
        </p>
        <button onClick={onGoToEco} className="btn-sun mt-3 w-full">Aller régler ça</button>
      </div>
    );
  }

  return (
    <div>
      <LabelHelp label="Jours pour monter d’un niveau" title="Le rythme des niveaux"
                 help={<>
                   <p>Vous dites en combien de jours un niveau doit tomber si Jeanne fait tout ce qui est prévu, et l’app calcule le nombre d’XP nécessaire à votre place.</p>
                   <p>Cela se base sur le rythme choisi dans l’onglet Points ({s.calib_tasks_per_day} tâches/jour × {s.xp_per_task} XP = {dailyXp} XP par jour).</p>
                   <p>Trop court, les niveaux perdent leur valeur ; trop long, elle ne les voit jamais arriver.</p>
                 </>} />
      <NumberField value={days} min={1} suffix="jours"
                   onChange={(n) => { setDays(n); onChange({ xp_per_level: Math.max(10, dailyXp * n) }); }} />
      <p className="mt-2 text-sm font-bold text-muted">Soit {dailyXp * days} ⚡ par niveau</p>
    </div>
  );
}

/* -------------------------------------------------------------- aperçu route */
function RoadPreviewButton({ s }: { s: Settings }) {
  const { child } = useApp();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Reward[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());

  const load = async () => {
    if (!child) return;
    const [r, o] = await Promise.all([
      supabase.from('rewards').select('*').eq('kind', 'item').not('unlock_level', 'is', null).order('unlock_level'),
      supabase.from('child_items').select('item_value').eq('child_id', child.id),
    ]);
    setItems((r.data ?? []) as Reward[]);
    setOwned(new Set((o.data ?? []).map((x: any) => x.item_value)));
  };

  return (
    <>
      <button onClick={async () => { await load(); setOpen(true); }} className="btn-plain w-full">
        🎖️ Aperçu des niveaux
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Route des niveaux">
        {child && <LevelRoad settings={s} xp={child.xp} avatarEmoji={child.avatar_emoji} items={items} owned={owned} />}
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------ aperçu ton */
function TonePreview({ tone, currency }: { tone: Tone; currency: string }) {
  const ctx = { task: 'Maths — exercices sur Thalès', time: '09:00', minutes: 10, count: 4,
                first: 'Maths', currency, coins: 190, streak: 4 };
  const rows: { kind: string; when: string }[] = [
    { kind: 'morning', when: 'Le matin' },
    { kind: 'start',   when: 'À l’heure de la tâche' },
    { kind: 'nudge',   when: 'Si rien n’a démarré' },
    { kind: 'recap',   when: 'Le soir' },
  ];
  return (
    <div className="card bg-soft p-4">
      <p className="mb-3 font-black text-ink">Ce qu’elle recevra</p>
      <div className="space-y-2.5">
        {rows.map((r) => {
          const c = notifCopy(r.kind, tone, ctx, 7);
          return (
            <div key={r.kind} className="rounded-3xl border-2 border-line bg-card p-3.5">
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-wide text-muted">{r.when}</p>
              <p className="font-extrabold text-ink">{c.title}</p>
              <p className="mt-0.5 text-sm font-medium leading-relaxed text-muted">{c.body}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- réinitialisation */
/**
 * Sept appuis sur le titre déclenchent une confirmation, puis effacent tout le
 * compte de l'enfant. Volontairement caché : ce n'est pas un bouton qu'on doit
 * pouvoir toucher par erreur.
 */
function SecretResetTitle() {
  const { child } = useApp();
  const [taps, setTaps] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tap = () => {
    if (timer.current) clearTimeout(timer.current);
    const n = taps + 1;
    if (n >= 7) { setTaps(0); setConfirm(true); return; }
    setTaps(n);
    timer.current = setTimeout(() => setTaps(0), 1500);
  };

  const doReset = async () => {
    if (!child) return;
    setBusy(true);
    try {
      await resetChildAccount(child.id);
      toast('Compte de ' + child.display_name + ' réinitialisé');
      setConfirm(false);
    } catch (e: any) {
      toast(e.message ?? 'Échec de la réinitialisation', 'err');
    } finally { setBusy(false); }
  };

  return (
    <>
      <h1 onClick={tap} className="select-none text-3xl font-black text-ink">Réglages</h1>
      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Tout effacer ?">
        <p className="font-medium leading-relaxed text-muted">
          Points, XP, niveau, série, tâches, routines, quiz, messages, badges, avatars débloqués,
          récompenses en attente — tout le compte de <b className="text-ink">{child?.display_name}</b> repart de zéro,
          comme à la toute première connexion.
        </p>
        <p className="mt-3 font-black text-flame">C'est irréversible.</p>
        <div className="mt-5 flex gap-2.5">
          <button onClick={() => setConfirm(false)} className="btn-plain flex-1">Annuler</button>
          <button onClick={doReset} disabled={busy} className="btn-flame flex-1">{busy ? '…' : 'Tout effacer'}</button>
        </div>
      </Sheet>
    </>
  );
}
