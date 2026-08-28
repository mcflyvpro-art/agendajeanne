'use client';
import clsx from 'clsx';
import { levelOf } from '@/lib/economy';
import type { Settings, Reward } from '@/lib/types';

interface Props {
  settings: Settings;
  xp: number;
  avatarEmoji: string;
  items: Reward[];      // récompenses de palier (kind: 'item', unlock_level renseigné)
  owned: Set<string>;   // item_value déjà possédés, pour révéler l'emoji avant même d'y être
  aheadOfCurrent?: number;
}

/** Route des niveaux — utilisée par l'écran de Jeanne et par l'aperçu du parent. */
export default function LevelRoad({ settings, xp, avatarEmoji, items, owned, aheadOfCurrent = 12 }: Props) {
  const cur = levelOf(xp, settings.xp_per_level);
  const maxLevel = Math.max(cur.level + aheadOfCurrent, ...items.map((i) => i.unlock_level ?? 0), 10);
  const levels = Array.from({ length: maxLevel }, (_, i) => i + 1);

  return (
    <>
      <section className="card bg-grape-light p-5 text-center">
        <p className="text-5xl">{avatarEmoji}</p>
        <p className="mt-2 text-3xl font-black text-grape">Niveau {cur.level}</p>
        <p className="text-lg font-extrabold text-ink">{cur.title}</p>
        <p className="mt-2 font-bold text-muted">Encore {cur.toNext} ⚡ pour le niveau {cur.level + 1}</p>
      </section>

      <ol className="relative mt-6">
        <span className="absolute bottom-4 left-[27px] top-4 w-1 rounded-full bg-line" aria-hidden />

        {levels.map((lv) => {
          const info = levelOf((lv - 1) * settings.xp_per_level, settings.xp_per_level);
          const reached = lv <= cur.level;
          const isNow = lv === cur.level;
          const prize = items.find((i) => i.unlock_level === lv);
          const titleChanges = lv === 1 || info.title !== levelOf((lv - 2) * settings.xp_per_level, settings.xp_per_level).title;

          return (
            <li key={lv} className="relative flex items-start gap-4 pb-3">
              <span className={clsx(
                'z-10 grid h-14 w-14 shrink-0 place-items-center rounded-full border-4 text-lg font-black transition',
                isNow ? 'border-grape bg-grape text-white shadow-lift scale-110'
                : reached ? 'border-leaf bg-leaf-light text-leaf-dark'
                : 'border-line bg-card text-muted')}>
                {prize ? (reached || owned.has(prize.item_value ?? '') ? prize.item_value : '🔒') : lv}
              </span>

              <div className={clsx('min-w-0 flex-1 rounded-3xl border-2 px-4 py-3 transition',
                isNow ? 'border-grape bg-card shadow-float'
                : reached ? 'border-line bg-card'
                : 'border-line bg-card opacity-60')}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-black text-ink">Niveau {lv}</p>
                  <p className="shrink-0 text-xs font-bold text-muted">{(lv - 1) * settings.xp_per_level} ⚡</p>
                </div>
                {titleChanges && <p className="mt-0.5 text-sm font-extrabold text-grape">🎖️ {info.title}</p>}
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {settings.level_up_coins > 0 && lv > 1 && (
                    <span className="chip !py-1 !text-[11px]">+{settings.level_up_coins} {settings.currency_emoji}</span>
                  )}
                  {prize && (
                    <span className={clsx('chip !py-1 !text-[11px]',
                      reached ? '!border-leaf !bg-leaf-light !text-leaf-dark' : '!border-grape !bg-grape-light !text-grape')}>
                      {prize.item_value} {reached ? 'obtenu' : 'à débloquer'}
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
