import type { Tone } from './types';

const pick = <T,>(arr: T[], seed: number): T => arr[Math.abs(seed) % arr.length];

export interface NotifCopy { title: string; body: string; }

interface Ctx {
  task?: string;
  time?: string;
  minutes?: number;
  count?: number;
  coins?: number;
  currency?: string;
  streak?: number;
  child?: string;
  first?: string;
}

/** Rappel la veille au soir : la journée de demain. */
function preview(tone: Tone, c: Ctx, s: number): NotifCopy {
  const n = c.count ?? 0;
  const t: Record<Tone, NotifCopy[]> = {
    doux: [{ title: 'Ta journée de demain 🌙', body: `${n} chose${n > 1 ? 's' : ''} au programme. On commence par « ${c.first} » à ${c.time}. Dors bien.` }],
    neutre: [{ title: 'Demain', body: `${n} tâche${n > 1 ? 's' : ''}. Première : « ${c.first} » à ${c.time}.` }],
    ferme: [{ title: 'Demain — programme', body: `${n} tâche${n > 1 ? 's' : ''}. Ça commence à ${c.time} avec « ${c.first} ». Prépare tes affaires ce soir.` }],
    humour: [{ title: 'Spoiler de demain 🔮', body: `${n} mission${n > 1 ? 's' : ''}. Le générique démarre à ${c.time} : « ${c.first} ».` }],
  };
  return pick(t[tone], s);
}

/** Check-in du matin — crucial en CNED : marquer le début de la journée. */
function morning(tone: Tone, c: Ctx, s: number): NotifCopy {
  const t: Record<Tone, NotifCopy[]> = {
    doux: [
      { title: 'Bonjour ☀️', body: `Nouvelle journée. ${c.count} tâche${(c.count ?? 0) > 1 ? 's' : ''} t’attendent, rien d’insurmontable.` },
      { title: 'On y va doucement 🌤️', body: `Lève-toi, habille-toi, et on commence quand tu es prête.` },
    ],
    neutre: [{ title: 'Début de journée', body: `${c.count} tâche${(c.count ?? 0) > 1 ? 's' : ''} aujourd’hui. Première : « ${c.first} » à ${c.time}.` }],
    ferme: [
      { title: 'La journée commence', body: `Debout, habillée, au bureau. ${c.count} tâche${(c.count ?? 0) > 1 ? 's' : ''} aujourd’hui — la première à ${c.time}.` },
      { title: 'Journée de cours', body: `Pas de sonnerie ici, mais le programme est le même. On démarre à ${c.time}.` },
    ],
    humour: [
      { title: 'Réveil, chef 🐓', body: `Le lycée à la maison ouvre ses portes. ${c.count} truc${(c.count ?? 0) > 1 ? 's' : ''} au menu, et le café est déjà froid.` },
      { title: 'Debout la marmotte 🦥', body: `Ton pyjama a assez travaillé cette nuit. À toi de jouer à ${c.time}.` },
    ],
  };
  return pick(t[tone], s);
}

/** Rappel avant l'heure. */
function before(tone: Tone, c: Ctx, s: number): NotifCopy {
  const m = c.minutes ?? 15;
  const t: Record<Tone, NotifCopy[]> = {
    doux: [{ title: `Dans ${m} min`, body: `« ${c.task} ». Prends le temps de sortir tes affaires tranquillement.` }],
    neutre: [{ title: `${c.task} — dans ${m} min`, body: `Prépare ton matériel.` }],
    ferme: [{ title: `${m} minutes`, body: `« ${c.task} » commence bientôt. Range le téléphone, sors le cahier.` }],
    humour: [{ title: `T-${m} avant décollage 🚀`, body: `« ${c.task} » en approche. Dernier scroll autorisé.` }],
  };
  return pick(t[tone], s);
}

/** L'heure de démarrer. */
function start(tone: Tone, c: Ctx, s: number): NotifCopy {
  const t: Record<Tone, NotifCopy[]> = {
    doux: [
      { title: `C’est le moment 💜`, body: `« ${c.task} ». Commence juste 2 minutes, tu verras après.` },
      { title: `On y va ?`, body: `« ${c.task} » t’attend. Une seule chose à la fois.` },
    ],
    neutre: [{ title: c.task ?? 'Tâche', body: `Ça commence maintenant. ${c.minutes} min prévues.` }],
    ferme: [
      { title: `Maintenant : ${c.task}`, body: `${c.minutes} min. Appuie sur « Je commence ».` },
      { title: `C’est l’heure`, body: `« ${c.task} ». Pas dans dix minutes — maintenant.` },
    ],
    humour: [
      { title: `Ding ding 🔔`, body: `« ${c.task} ». La cloche a sonné, et elle est incorruptible.` },
      { title: `Ton public t’attend 🎬`, body: `« ${c.task} », ${c.minutes} min, action.` },
    ],
  };
  return pick(t[tone], s);
}

/** Relance : rien n'a démarré. */
function nudge(tone: Tone, c: Ctx, s: number): NotifCopy {
  const m = c.minutes ?? 10;
  const t: Record<Tone, NotifCopy[]> = {
    doux: [
      { title: `Toujours là ?`, body: `« ${c.task} » n’a pas commencé. Même 5 minutes, c’est déjà quelque chose.` },
      { title: `Petit coup de pouce 🤍`, body: `Si c’est trop dur, appuie sur « Je bloque » plutôt que de laisser tomber.` },
    ],
    neutre: [{ title: `Pas encore commencé`, body: `« ${c.task} » — ${m} min de retard.` }],
    ferme: [
      { title: `${m} min de retard`, body: `« ${c.task} » n’est pas lancée. Tu perds ton bonus de ponctualité.` },
      { title: `Toujours rien`, body: `« ${c.task} ». Chaque minute d’attente rend le démarrage plus dur, pas moins.` },
    ],
    humour: [
      { title: `Le cahier s’ennuie 📕`, body: `« ${c.task} » attend depuis ${m} min. Il commence à se sentir rejeté.` },
      { title: `Toc toc 🚪`, body: `C’est « ${c.task} ». Je sais que tu es là, ton téléphone t’a balancée.` },
    ],
  };
  return pick(t[tone], s);
}

/** Encouragement en cours de session. */
function midway(tone: Tone, c: Ctx, s: number): NotifCopy {
  const t: Record<Tone, NotifCopy[]> = {
    doux: [{ title: 'Mi-parcours 🌿', body: `Tu es à la moitié de « ${c.task} ». Tiens bon, c’est le plus dur qui est passé.` }],
    neutre: [{ title: 'Moitié faite', body: `« ${c.task} » — encore ${c.minutes} min.` }],
    ferme: [{ title: 'Moitié', body: `Encore ${c.minutes} min sur « ${c.task} ». On ne s’arrête pas là.` }],
    humour: [{ title: 'Mi-temps ⚽', body: `Pas d’oranges, pas de vestiaire. Encore ${c.minutes} min.` }],
  };
  return pick(t[tone], s);
}

/** Bilan du soir. */
function recap(tone: Tone, c: Ctx, s: number): NotifCopy {
  const done = c.count ?? 0;
  const cur = c.currency ?? '🪙';
  const t: Record<Tone, NotifCopy[]> = {
    doux: [{ title: `Ta journée 🌙`, body: done ? `${done} tâche${done > 1 ? 's' : ''} terminée${done > 1 ? 's' : ''}, ${c.coins} ${cur} gagnés. Fière de toi.` : `Journée compliquée. Demain est un autre jour, vraiment.` }],
    neutre: [{ title: 'Bilan', body: done ? `${done} terminée${done > 1 ? 's' : ''} · ${c.coins} ${cur}` : `Aucune tâche terminée aujourd’hui.` }],
    ferme: [{ title: 'Bilan de la journée', body: done ? `${done} terminée${done > 1 ? 's' : ''}, ${c.coins} ${cur}. Série : ${c.streak} j.` : `Zéro tâche terminée. Ta série est cassée. On reprend demain.` }],
    humour: [{ title: 'Les résultats du soir 📊', body: done ? `${done} au compteur, ${c.coins} ${cur} en poche. Le jury est satisfait.` : `Score du jour : 0. Le jury est perplexe mais patient.` }],
  };
  return pick(t[tone], s);
}

export function notifCopy(kind: string, tone: Tone, c: Ctx, seed = Date.now()): NotifCopy {
  switch (kind) {
    case 'preview': return preview(tone, c, seed);
    case 'morning': return morning(tone, c, seed);
    case 'before': return before(tone, c, seed);
    case 'start': return start(tone, c, seed);
    case 'nudge': return nudge(tone, c, seed);
    case 'midway': return midway(tone, c, seed);
    case 'recap': return recap(tone, c, seed);
    default: return { title: 'Agenda', body: c.task ?? '' };
  }
}

/** Notifications côté parent. */
export const parentCopy = {
  notStarted: (child: string, task: string, min: number): NotifCopy => ({
    title: `🔴 ${child} n’a pas commencé`,
    body: `« ${task} » — ${min} min de retard, aucune activité.`,
  }),
  blocked: (child: string, task: string, note: string): NotifCopy => ({
    title: `🆘 ${child} bloque`,
    body: `Sur « ${task} » : ${note || 'sans précision'}`,
  }),
  submitted: (child: string, task: string): NotifCopy => ({
    title: `✅ ${child} a terminé`,
    body: `« ${task} » attend ta validation.`,
  }),
  redemption: (child: string, reward: string, cost: number): NotifCopy => ({
    title: `🎁 ${child} demande une récompense`,
    body: `« ${reward} » pour ${cost} points.`,
  }),
  pushOff: (child: string): NotifCopy => ({
    title: `⚠️ Notifications coupées`,
    body: `${child} ne reçoit plus les rappels sur son téléphone.`,
  }),
  moodLow: (child: string): NotifCopy => ({
    title: `💭 ${child} ne va pas fort`,
    body: `Humeur basse déclarée aujourd’hui. Un mot lui ferait sûrement du bien.`,
  }),
};

export const KUDOS = [
  { emoji: '🔥', text: 'Bravo, continue comme ça' },
  { emoji: '💪', text: 'Je suis fier de toi' },
  { emoji: '👏', text: 'Excellent travail' },
  { emoji: '⚡', text: 'Quelle efficacité !' },
  { emoji: '💜', text: 'Merci d’avoir tenu bon' },
  { emoji: '🎯', text: 'Pile dans le mille' },
  { emoji: '🚀', text: 'Tu décolles cette semaine' },
  { emoji: '🌟', text: 'Ça, c’est du sérieux' },
];
