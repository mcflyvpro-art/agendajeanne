import type { Settings, Task, Profile } from './types';

/** Valeur suggérée d'une tâche, calculée depuis le barème du parent. */
export function suggestCoins(s: Settings, durationMin: number, difficulty: number): number {
  const mult = s.difficulty_mult?.[String(difficulty)] ?? 1;
  return Math.max(1, Math.round((s.base_coins + (s.coins_per_10min * durationMin) / 10) * mult));
}

export interface Award { coins: number; xp: number; bonuses: { label: string; pct: number }[]; }

/** Gain réel à la validation, bonus compris. */
export function computeAward(s: Settings, task: Task, opts: { onTime: boolean; streak: number }): Award {
  const bonuses: { label: string; pct: number }[] = [];
  let pct = 0;
  if (opts.onTime && s.punctuality_bonus_pct > 0) {
    bonuses.push({ label: 'À l’heure', pct: s.punctuality_bonus_pct });
    pct += s.punctuality_bonus_pct;
  }
  if (opts.streak >= 3 && s.streak_bonus_pct > 0) {
    bonuses.push({ label: `Série ${opts.streak} j`, pct: s.streak_bonus_pct });
    pct += s.streak_bonus_pct;
  }
  const mult = s.difficulty_mult?.[String(task.difficulty)] ?? 1;
  return {
    coins: Math.round(task.coins * (1 + pct / 100)),
    xp: Math.max(1, Math.round((s.xp_per_task ?? 20) * mult)),
    bonuses,
  };
}

export interface LevelInfo { level: number; into: number; per: number; pct: number; toNext: number; title: string; }

const TITLES = [
  'Débutante', 'Motivée', 'Régulière', 'Appliquée', 'Sérieuse',
  'Endurante', 'Redoutable', 'Experte', 'Championne', 'Légende',
];

export function levelOf(xp: number, perLevel: number): LevelInfo {
  const per = Math.max(1, perLevel);
  const level = Math.floor(xp / per) + 1;
  const into = xp % per;
  return {
    level, into, per,
    pct: Math.round((into / per) * 100),
    toNext: per - into,
    title: TITLES[Math.min(TITLES.length - 1, Math.floor((level - 1) / 3))],
  };
}

/** Durée minimale de travail avant de pouvoir valider (en secondes). */
export function minTimerSeconds(s: Settings, task: Task): number {
  const pct = task.min_timer_pct ?? s.default_min_timer_pct;
  return Math.round((task.duration_min * 60 * pct) / 100);
}

export const requiresPhoto = (s: Settings, t: Task) => t.require_photo ?? s.default_require_photo;
export const requiresValidation = (s: Settings, t: Task) => t.require_validation ?? s.default_require_validation;

/** Un jour compte pour la série si toutes les tâches non facultatives sont faites. */
export function dayIsComplete(tasks: Task[]): boolean {
  const real = tasks.filter((t) => t.status !== 'skipped');
  return real.length > 0 && real.every((t) => t.status === 'done' || t.status === 'submitted');
}

export function progressOf(tasks: Task[]) {
  const total = tasks.filter((t) => t.status !== 'skipped').length;
  const done = tasks.filter((t) => t.status === 'done' || t.status === 'submitted').length;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** XP gagnés aujourd'hui, pour la jauge d'objectif quotidien. */
export function xpToday(tasks: Task[]): number {
  return tasks.reduce((n, t) => n + (t.xp_awarded ?? 0), 0);
}

/** Badges à débloquer, d'après les compteurs courants. */
export function badgesToUnlock(
  all: { code: string; rule_kind: string; rule_value: number }[],
  owned: Set<string>,
  stats: { streak: number; tasksTotal: number; perfectDays: number; bestQuiz: number; earlyStarts: number; contractsDone: number; level: number }
): string[] {
  const value: Record<string, number> = {
    streak: stats.streak,
    tasks_total: stats.tasksTotal,
    perfect_days: stats.perfectDays,
    quiz_score: stats.bestQuiz,
    early_bird: stats.earlyStarts,
    contracts: stats.contractsDone,
    level: stats.level,
  };
  return all.filter((b) => !owned.has(b.code) && (value[b.rule_kind] ?? 0) >= b.rule_value).map((b) => b.code);
}
