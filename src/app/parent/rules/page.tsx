'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import ParentShell from '@/components/ParentShell';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { suggestCoins, levelOf } from '@/lib/economy';
import { PRESETS, project } from '@/lib/presets';
import { notifCopy } from '@/lib/tone';
import Help, { LabelHelp } from '@/components/Help';
import { Loader, SegmentedTabs, Toggle, toast } from '@/components/ui';
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
];

const CHILD_NOTIFS: { k: ChildNotifKind; emoji: string; label: string }[] = [
  { k: 'reminders',        emoji: '🔔', label: 'Rappels des tâches' },
  { k: 'task_created',     emoji: '📝', label: 'Nouvelle tâche' },
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

  const applyPreset = (values: Partial<Settings>) => {
    setS({ ...s, ...values });
    toast('Scénario appliqué — pense à enregistrer');
  };

  const Num = ({ k, label, suffix, help }: {
    k: keyof Settings; label: string; suffix?: string; help?: React.ReactNode;
  }) => (
    <div>
      {help ? <LabelHelp label={label} help={help} /> : <label className="label">{label}</label>}
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
        {(tab === 'eco' || tab === 'xp') && <Presets onApply={applyPreset} current={s} />}

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
            <Num k="xp_per_level" label="XP pour monter d’un niveau" suffix="⚡"
                 help={<>
                   <p>Plus la valeur est basse, plus les niveaux s’enchaînent vite.</p>
                   <p>Trop vite, ils perdent leur valeur ; trop lentement, elle ne les voit jamais arriver. Vise <b>un niveau tous les 4 à 6 jours</b> — l’aperçu ci-dessous vous le dit.</p>
                 </>} />
            <Num k="level_up_coins" label="Bonus à chaque niveau" suffix={s.currency_emoji} />
            <Num k="daily_xp_goal" label="Objectif XP du jour" suffix="⚡"
                 help={<>
                   <p>La jauge affichée en haut de son écran d’accueil.</p>
                   <p>Cale-le sur une journée normale de travail : atteignable tous les jours, mais seulement si elle fait ce qui est prévu.</p>
                 </>} />

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

/* -------------------------------------------------------------- scénarios */
function Presets({ onApply, current }: { onApply: (v: Partial<Settings>) => void; current: Settings }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="card bg-soft p-4">
      <div className="mb-1 flex items-center gap-2">
        <p className="text-base font-black text-ink">Réglages tout faits</p>
        <Help title="Comment choisir un scénario ?">
          <p>Ces trois réglages remplacent d’un coup toutes les valeurs de points, d’XP et de contraintes.</p>
          <p>Ils sont calibrés pour qu’une <b>bonne semaine</b> rapporte à peu près la même chose dans les trois cas — autour de 1 200 points, soit exactement les 10 € d’argent de poche de la boutique.</p>
          <p>Ce qui change n’est donc pas la valeur des récompenses, mais <b>l’effort demandé</b> pour les atteindre. Vous pouvez changer d’avis en cours de route sans dérégler les prix.</p>
          <p>Après application, tout reste modifiable ligne par ligne.</p>
        </Help>
      </div>
      <p className="mb-4 text-sm font-medium text-muted">Une bonne semaine ≈ 1 200 points dans les trois cas.</p>

      <div className="space-y-2.5">
        {PRESETS.map((p) => {
          const proj = project(p.values, p.tasksPerDay);
          const isOpen = open === p.id;
          return (
            <div key={p.id} className={clsx('rounded-3xl border-2 bg-card transition', isOpen ? 'border-grape' : 'border-line')}>
              <button onClick={() => setOpen(isOpen ? null : p.id)} className="flex w-full items-center gap-3 p-4 text-left no-select">
                <span className="text-3xl">{p.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-black text-ink">{p.name}</p>
                  <p className="text-xs font-bold text-muted">{p.tasksPerDay} tâches/jour · ~{proj.perWeek} pts/semaine</p>
                </div>
                <span className="text-lg text-muted">{isOpen ? '▴' : '▾'}</span>
              </button>

              {isOpen && (
                <div className="border-t-2 border-line p-4">
                  <p className="text-sm font-medium leading-relaxed text-muted">{p.summary}</p>
                  <ul className="mt-3 space-y-1.5 text-sm font-bold">
                    <li className="flex justify-between"><span className="text-muted">Une tâche de 45 min</span><span className="text-ink">{proj.perTask} pts</span></li>
                    <li className="flex justify-between"><span className="text-muted">…avec les bonus</span><span className="text-ink">{proj.perTaskBonus} pts</span></li>
                    <li className="flex justify-between"><span className="text-muted">Une journée complète</span><span className="text-ink">{proj.perDay} pts</span></li>
                    <li className="flex justify-between"><span className="text-muted">Une semaine complète</span><span className="text-grape">{proj.perWeek} pts</span></li>
                    <li className="flex justify-between"><span className="text-muted">Un niveau tous les</span><span className="text-ink">{proj.daysPerLevel} jours</span></li>
                    <li className="flex justify-between"><span className="text-muted">Preuve photo</span><span className="text-ink">{p.values.default_require_photo ? 'oui' : 'non'}</span></li>
                    <li className="flex justify-between"><span className="text-muted">Validation parent</span><span className="text-ink">{p.values.default_require_validation ? 'oui' : 'non'}</span></li>
                    <li className="flex justify-between"><span className="text-muted">Minuteur bloquant</span><span className="text-ink">{p.values.default_min_timer_pct} %</span></li>
                    <li className="flex justify-between"><span className="text-muted">Reports par jour</span><span className="text-ink">{p.values.max_postpones_per_day}</span></li>
                  </ul>
                  <button onClick={() => onApply(p.values)} className="btn-grape mt-4 w-full">Appliquer ce scénario</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
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
