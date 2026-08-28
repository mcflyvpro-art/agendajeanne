import type { Settings } from './types';

/**
 * Trois réglages tout faits.
 *
 * Ils sont calibrés pour qu'une **bonne semaine** (5 jours, tout terminé, à
 * l'heure, série active) rapporte à peu près la même chose — autour de
 * 1 200 points — quel que soit le scénario. Ce qui change, c'est l'effort
 * demandé pour y arriver, pas la valeur de la récompense. Les prix de la
 * boutique restent donc valables si on change d'avis en cours de route.
 *
 * Repère : 1 200 points = les 10 € d'argent de poche.
 */
export interface Preset {
  id: 'doux' | 'equilibre' | 'exigeant';
  name: string;
  emoji: string;
  summary: string;
  tasksPerDay: number;
  values: Partial<Settings>;
}

export const PRESETS: Preset[] = [
  {
    id: 'doux',
    name: 'Doux',
    emoji: '🌱',
    summary: 'On installe l’habitude. Peu de tâches, bien payées, presque aucune contrainte.',
    tasksPerDay: 3,
    values: {
      base_coins: 15, coins_per_10min: 6,
      punctuality_bonus_pct: 30, streak_bonus_pct: 25, perfect_day_bonus: 80,
      quiz_coins_per_answer: 4,
      xp_per_task: 25, xp_per_quiz_answer: 6, xp_per_level: 300,
      level_up_coins: 120, daily_xp_goal: 75,
      default_require_photo: false, default_require_validation: false,
      default_min_timer_pct: 40, max_postpones_per_day: 3, postpone_minutes: 20,
      max_daily_minutes: 180,
    },
  },
  {
    id: 'equilibre',
    name: 'Équilibré',
    emoji: '⚖️',
    summary: 'Le réglage de croisière. Rythme soutenable, minuteur qui empêche de tricher.',
    tasksPerDay: 4,
    values: {
      base_coins: 10, coins_per_10min: 5,
      punctuality_bonus_pct: 25, streak_bonus_pct: 20, perfect_day_bonus: 50,
      quiz_coins_per_answer: 3,
      xp_per_task: 20, xp_per_quiz_answer: 5, xp_per_level: 400,
      level_up_coins: 100, daily_xp_goal: 80,
      default_require_photo: false, default_require_validation: false,
      default_min_timer_pct: 60, max_postpones_per_day: 2, postpone_minutes: 20,
      max_daily_minutes: 240,
    },
  },
  {
    id: 'exigeant',
    name: 'Exigeant',
    emoji: '🎯',
    summary: 'Cadre serré. Journée pleine, preuve photo et validation obligatoires.',
    tasksPerDay: 5,
    values: {
      base_coins: 8, coins_per_10min: 4,
      punctuality_bonus_pct: 20, streak_bonus_pct: 15, perfect_day_bonus: 40,
      quiz_coins_per_answer: 3,
      xp_per_task: 15, xp_per_quiz_answer: 4, xp_per_level: 450,
      level_up_coins: 80, daily_xp_goal: 75,
      default_require_photo: true, default_require_validation: true,
      default_min_timer_pct: 80, max_postpones_per_day: 1, postpone_minutes: 15,
      max_daily_minutes: 300,
    },
  },
];

export interface Projection {
  perTask: number;      // valeur brute d'une tâche de 45 min, difficulté normale
  perTaskBonus: number; // la même, bonus de ponctualité et de série inclus
  perDay: number;       // journée complète, bonus « journée parfaite » compris
  perWeek: number;      // 5 jours de suite
  xpPerDay: number;
  daysPerLevel: number;
}

/** Projection chiffrée d'un réglage, pour une tâche type de 45 min. */
export function project(s: Partial<Settings>, tasksPerDay: number, durationMin = 45): Projection {
  const base = s.base_coins ?? 10;
  const per10 = s.coins_per_10min ?? 5;
  const perTask = Math.round(base + (per10 * durationMin) / 10);

  const bonusPct = (s.punctuality_bonus_pct ?? 0) + (s.streak_bonus_pct ?? 0);
  const perTaskBonus = Math.round(perTask * (1 + bonusPct / 100));

  const perDay = perTaskBonus * tasksPerDay + (s.perfect_day_bonus ?? 0);
  const xpPerDay = (s.xp_per_task ?? 20) * tasksPerDay;

  return {
    perTask, perTaskBonus, perDay,
    perWeek: perDay * 5,
    xpPerDay,
    daysPerLevel: Math.max(1, Math.round((s.xp_per_level ?? 400) / Math.max(1, xpPerDay))),
  };
}
