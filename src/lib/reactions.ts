import type { MessageReaction } from './types';

export const REACTIONS: { code: MessageReaction; emoji: string }[] = [
  { code: 'thumb_up',   emoji: '👍' },
  { code: 'thumb_down', emoji: '👎' },
  { code: 'check',      emoji: '✅' },
  { code: 'cross',      emoji: '❌' },
  { code: 'heart',      emoji: '❤️' },
];

export const reactionEmoji = (code: string | null | undefined): string | null =>
  REACTIONS.find((r) => r.code === code)?.emoji ?? null;
