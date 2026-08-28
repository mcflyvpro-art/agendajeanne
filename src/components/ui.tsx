'use client';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

export function Loader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-line border-t-grape" />
    </div>
  );
}

export function Empty({ emoji, title }: { emoji: string; title: string }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="animate-bob text-6xl">{emoji}</span>
      <p className="text-lg font-extrabold text-ink">{title}</p>
    </div>
  );
}

export function Sheet({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);

  /**
   * Verrouillage du fond. `overflow: hidden` seul ne suffit pas sur iOS : la
   * page continue de défiler derrière la feuille. On la fige en `position:
   * fixed` en mémorisant le défilement, restauré à la fermeture.
   */
  useEffect(() => {
    if (!open) return;
    const y = window.scrollY;
    const b = document.body.style;
    const prev = { position: b.position, top: b.top, width: b.width, overflow: b.overflow };
    b.position = 'fixed';
    b.top = `-${y}px`;
    b.width = '100%';
    b.overflow = 'hidden';
    return () => {
      b.position = prev.position; b.top = prev.top;
      b.width = prev.width; b.overflow = prev.overflow;
      window.scrollTo(0, y);
    };
  }, [open]);

  if (!open) return null;

  // Le glissement ne démarre que si le contenu est déjà en haut : sinon on
  // laisse l'utilisateur faire défiler normalement.
  const onTouchStart = (e: React.TouchEvent) => {
    startY.current = (scroller.current?.scrollTop ?? 0) <= 0 ? e.touches[0].clientY : null;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    setDrag(dy > 0 ? dy : 0);
  };
  const onTouchEnd = () => {
    if (drag > 110) onClose();
    setDrag(0);
    startY.current = null;
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/35 backdrop-blur-[2px] animate-[pop_.18s_ease-out]"
           style={{ opacity: Math.max(0, 1 - drag / 300) }} onClick={onClose} />
      <div className="sheet flex flex-col shadow-lift"
           style={{
             transform: `translateY(${drag}px)`,
             transition: drag ? 'none' : 'transform .28s cubic-bezier(.2,.9,.3,1)',
             animation: drag ? undefined : 'rise .32s cubic-bezier(.2,.9,.3,1)',
           }}>
        <div className="shrink-0 bg-canvas px-5 pb-3 pt-4"
             onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-line" />
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-ink">{title}</h2>
            <button onClick={onClose} aria-label="Fermer"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-soft text-lg font-black text-muted no-select active:scale-90">
              ✕
            </button>
          </div>
        </div>

        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-5 pb-4"
             style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
             onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          {children}
        </div>

        {footer && (
          <div className="shrink-0 bg-canvas px-5 pt-3"
               style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + .9rem)' }}>
            {footer}
          </div>
        )}
      </div>
    </>
  );
}

export function Ring({ pct, size = 200, stroke = 16, color = '#7C4DEE', track = '#EBE3F9', children }: {
  pct: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="ring absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
                strokeLinecap="round" strokeDasharray={c}
                strokeDashoffset={c - (Math.min(100, Math.max(0, pct)) / 100) * c} />
      </svg>
      <div className="relative z-10 text-center">{children}</div>
    </div>
  );
}

export function Bar({ pct, color = '#7C4DEE', className, height = 14 }: {
  pct: number; color?: string; className?: string; height?: number;
}) {
  return (
    <div className={clsx('w-full overflow-hidden rounded-full bg-line', className)} style={{ height }}>
      <div className="h-full rounded-full transition-[width] duration-700"
           style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

export function Stat({ value, label, emoji, color }: {
  value: React.ReactNode; label: string; emoji: string; color?: string;
}) {
  return (
    <div className="tile flex-1 px-2 py-3 text-center">
      <div className="text-xl leading-none">{emoji}</div>
      <div className="mt-1.5 text-xl font-black tabular-nums" style={color ? { color } : undefined}>{value}</div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

/**
 * Champ numérique libre. Un champ contrôlé qui recopie `Number(valeur) || 0`
 * force un « 0 » visible dès que l'utilisateur vide le champ, ce qui décale
 * le curseur en pleine saisie. Ici, la valeur tapée reste un texte libre tant
 * que le champ a le focus ; elle n'est validée (et l'erreur éventuelle
 * affichée) qu'à la sortie du champ.
 */
export function NumberField({ value, onChange, suffix, min = 0, placeholder, className }: {
  value: number; onChange: (n: number) => void; suffix?: string; min?: number;
  placeholder?: string; className?: string;
}) {
  const [raw, setRaw] = useState(String(value));
  const [focused, setFocused] = useState(false);
  const [empty, setEmpty] = useState(false);

  useEffect(() => { if (!focused) setRaw(String(value)); }, [value, focused]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="number" inputMode="numeric" placeholder={placeholder}
          className={clsx('field flex-1', empty && '!border-flame', className)}
          value={raw}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            setRaw(e.target.value);
            setEmpty(false);
            if (e.target.value.trim() !== '') onChange(Number(e.target.value) || 0);
          }}
          onBlur={() => {
            setFocused(false);
            if (raw.trim() === '') { setEmpty(true); setRaw(String(min)); onChange(min); }
            else { const n = Number(raw); setRaw(String(n)); onChange(n); }
          }}
        />
        {suffix && <span className="shrink-0 text-lg font-black text-muted">{suffix}</span>}
      </div>
      {empty && <p className="mt-1.5 text-xs font-bold text-flame">Indique une valeur</p>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, emoji }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; emoji?: string;
}) {
  return (
    <button onClick={() => onChange(!checked)}
            className="flex w-full items-center gap-3 rounded-3xl border-2 border-line bg-card px-4 py-3.5 text-left no-select active:scale-[.99]">
      {emoji && <span className="text-xl">{emoji}</span>}
      <span className="flex-1 font-bold text-ink">{label}</span>
      <span className={clsx('relative h-7 w-12 shrink-0 rounded-full transition', checked ? 'bg-leaf' : 'bg-line')}>
        <span className={clsx('absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-6' : 'left-1')} />
      </span>
    </button>
  );
}

let pushToast: ((m: string, t?: 'ok' | 'err') => void) | null = null;
export const toast = (m: string, t: 'ok' | 'err' = 'ok') => pushToast?.(m, t);

export function Toaster() {
  const [items, setItems] = useState<{ id: number; m: string; t: string }[]>([]);
  useEffect(() => {
    pushToast = (m, t = 'ok') => {
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { id, m, t }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3000);
    };
    return () => { pushToast = null; };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4"
         style={{ paddingTop: 'calc(env(safe-area-inset-top) + .75rem)' }}>
      {items.map((i) => (
        <div key={i.id}
             className={clsx('animate-pop rounded-full px-5 py-3 text-sm font-extrabold text-white shadow-lift',
               i.t === 'err' ? 'bg-flame' : 'bg-leaf')}>
          {i.m}
        </div>
      ))}
    </div>
  );
}

export function Confetti({ fire }: { fire: number }) {
  const [bits, setBits] = useState<{ id: number; x: number; d: number; c: string; r: number }[]>([]);
  useEffect(() => {
    if (!fire) return;
    const colors = ['#7C4DEE', '#E6438B', '#1FC08A', '#F5A524', '#2E9BF0'];
    setBits(Array.from({ length: 46 }, (_, i) => ({
      id: fire * 100 + i, x: Math.random() * 100, d: Math.random() * 0.5,
      c: colors[i % colors.length], r: Math.random() * 360,
    })));
    const t = setTimeout(() => setBits([]), 2600);
    return () => clearTimeout(t);
  }, [fire]);
  if (!bits.length) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {bits.map((b) => (
        <span key={b.id} className="absolute h-3 w-2.5 rounded-[3px]"
              style={{ left: `${b.x}%`, top: '-5%', background: b.c, transform: `rotate(${b.r}deg)`,
                       animation: `fall 2.2s cubic-bezier(.3,.7,.5,1) ${b.d}s forwards` }} />
      ))}
      <style>{`@keyframes fall{to{transform:translateY(110vh) rotate(720deg);opacity:0}}`}</style>
    </div>
  );
}

export function SegmentedTabs<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  return (
    <div className="scroll-x flex gap-1.5 rounded-3xl border-2 border-line bg-card p-1.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
                className={clsx('flex-1 whitespace-nowrap rounded-2xl px-3 py-2.5 text-sm font-extrabold transition no-select',
                  value === o.value ? 'bg-grape text-white shadow-float' : 'text-muted')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
