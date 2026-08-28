/** Palette d'humeurs : uniquement des emojis, aucun libellé à lire. */
export interface MoodOption { code: string; emoji: string; value: number; label: string; }

/** Du plus joyeux au moins joyeux. */
export const MOOD_SCALE: MoodOption[] = [
  { code: 'great', emoji: '🤩', value: 5, label: 'Super' },
  { code: 'good',  emoji: '😄', value: 4, label: 'Bien' },
  { code: 'ok',    emoji: '🙂', value: 3, label: 'Ça va' },
  { code: 'meh',   emoji: '😐', value: 2, label: 'Bof' },
  { code: 'bad',   emoji: '😞', value: 1, label: 'Pas bien' },
];

/** Cas particuliers, hors échelle de joie. */
export const MOOD_SPECIAL: MoodOption[] = [
  { code: 'tired',    emoji: '😴', value: 2, label: 'Fatiguée' },
  { code: 'sick',     emoji: '🤒', value: 1, label: 'Malade' },
  { code: 'stressed', emoji: '😰', value: 2, label: 'Stressée' },
  { code: 'angry',    emoji: '😤', value: 2, label: 'Énervée' },
];

export const ALL_MOODS = [...MOOD_SCALE, ...MOOD_SPECIAL];

export const moodByCode = (code: string | null | undefined): MoodOption | null =>
  ALL_MOODS.find((m) => m.code === code) ?? null;

/** Emoji à afficher, avec repli sur l'ancienne échelle numérique. */
export function moodEmoji(code: string | null | undefined, value?: number): string {
  const m = moodByCode(code);
  if (m) return m.emoji;
  return MOOD_SCALE.find((x) => x.value === value)?.emoji ?? '🙂';
}

/** Une humeur qui mérite l'attention du parent. */
export const isMoodConcerning = (code: string | null | undefined, value: number) =>
  value <= 2 || ['sick', 'stressed', 'angry', 'bad'].includes(code ?? '');
