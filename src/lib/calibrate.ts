import type { Settings } from './types';

/**
 * Calibrage automatique de l'économie.
 *
 * Le parent ne donne que deux chiffres : combien de tâches Jeanne devrait faire
 * par jour, et combien de points une bonne semaine devrait rapporter. Le reste
 * du barème s'en déduit.
 *
 * On part de la valeur d'une tâche type (45 min, difficulté normale) :
 *
 *   semaine = 5 jours × (valeur_avec_bonus × tâches_par_jour + bonus_journée)
 *
 * En liant le bonus de journée parfaite à la valeur d'une tâche (il en vaut
 * une et demie), il ne reste plus qu'une inconnue :
 *
 *   valeur_tâche = cible_hebdo / (5 × (coef_bonus × tâches_par_jour + 1,5))
 *
 * Elle est ensuite répartie entre une part fixe (30 %, versée dès qu'une tâche
 * est terminée quelle que soit sa durée) et une part proportionnelle au temps
 * (70 %). Ce partage récompense à la fois le fait de s'y mettre et celui d'y
 * rester.
 */

export const REFERENCE_DURATION = 45;
const FIXED_SHARE = 0.3;        // part du montant qui ne dépend pas de la durée
const PERFECT_DAY_IN_TASKS = 1.5; // le bonus de journée vaut 1,5 tâche

export interface Calibration {
  perTask: number;
  perTaskWithBonus: number;
  perDay: number;
  perWeek: number;
  values: Pick<Settings, 'base_coins' | 'coins_per_10min' | 'perfect_day_bonus' | 'daily_xp_goal'>;
}

export function calibrate(
  s: Settings,
  tasksPerDay: number,
  weeklyTarget: number
): Calibration {
  const n = Math.max(1, tasksPerDay);
  const target = Math.max(50, weeklyTarget);
  const k = 1 + ((s.punctuality_bonus_pct ?? 0) + (s.streak_bonus_pct ?? 0)) / 100;

  const perTask = Math.max(1, target / (5 * (k * n + PERFECT_DAY_IN_TASKS)));

  const base = Math.max(1, Math.round(perTask * FIXED_SHARE));
  const per10 = Math.max(1, Math.round((perTask * (1 - FIXED_SHARE)) / (REFERENCE_DURATION / 10)));
  const perfectDay = Math.max(1, Math.round(perTask * PERFECT_DAY_IN_TASKS));

  // Recalcule avec les valeurs arrondies pour annoncer un chiffre honnête.
  const realPerTask = Math.round(base + (per10 * REFERENCE_DURATION) / 10);
  const realWithBonus = Math.round(realPerTask * k);
  const perDay = realWithBonus * n + perfectDay;

  return {
    perTask: realPerTask,
    perTaskWithBonus: realWithBonus,
    perDay,
    perWeek: perDay * 5,
    values: {
      base_coins: base,
      coins_per_10min: per10,
      perfect_day_bonus: perfectDay,
      daily_xp_goal: Math.max(10, (s.xp_per_task ?? 20) * n),
    },
  };
}
