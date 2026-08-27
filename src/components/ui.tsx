'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';

export function Loader({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-muted">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-line border-t-brand" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function Empty({ emoji, title, hint }: { emoji: string; title: string; hint?: string }) {
  return (
    <div className="card mx-auto flex max-w-sm flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="text-5xl">{emoji}</span>
      <p className="mt-2 font-semibold text-white/90">{title}</p>
      {hint && <p className="text-sm leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

/** Feuille modale qui monte du bas — le pattern iOS naturel. */
export function Sheet({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm animate-[pop_.2s_ease-out]" onClick={onClose} />
      <div className="sheet animate-[rise_.3s_cubic-bezier(.2,.9,.3,1)] flex flex-col">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-5 pb-3 pt-3 backdrop-blur">
          <div className="absolute left-1/2 top-1.5 h-1 w-10 -translate-x-1/2 rounded-full bg-line" />
          <h2 className="pt-2 text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="btn-soft h-9 w-9 !rounded-full !p-0 text-lg">✕</button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="sticky bottom-0 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur"
               style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + .75rem)' }}>
            {footer}
          </div>
        )}
      </div>
    </>
  );
}

export function Ring({ pct, size = 200, stroke = 12, color = '#7C5CFF', children }: {
  pct: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="ring absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2A2A3C" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
                strokeLinecap="round" strokeDasharray={c}
                strokeDashoffset={c - (Math.min(100, Math.max(0, pct)) / 100) * c} />
      </svg>
      <div className="relative z-10 text-center">{children}</div>
    </div>
  );
}

export function Bar({ pct, color = '#7C5CFF', className }: { pct: number; color?: string; className?: string }) {
  return (
    <div className={clsx('h-2 w-full overflow-hidden rounded-full bg-line', className)}>
      <div className="h-full rounded-full transition-[width] duration-700"
           style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

export function Stat({ value, label, emoji, color }: { value: React.ReactNode; label: string; emoji?: string; color?: string }) {
  return (
    <div className="card flex-1 px-3 py-3 text-center">
      {emoji && <div className="text-lg leading-none">{emoji}</div>}
      <div className="mt-1 text-xl font-black tabular-nums" style={color ? { color } : undefined}>{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

/** Petit toast en haut de l'écran. */
let pushToast: ((m: string, t?: 'ok' | 'err') => void) | null = null;
export const toast = (m: string, t: 'ok' | 'err' = 'ok') => pushToast?.(m, t);

export function Toaster() {
  const [items, setItems] = useState<{ id: number; m: string; t: string }[]>([]);
  useEffect(() => {
    pushToast = (m, t = 'ok') => {
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { id, m, t }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3200);
    };
    return () => { pushToast = null; };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4"
         style={{ paddingTop: 'calc(env(safe-area-inset-top) + .75rem)' }}>
      {items.map((i) => (
        <div key={i.id}
             className={clsx('animate-pop rounded-2xl border px-4 py-2.5 text-sm font-semibold shadow-2xl backdrop-blur-xl',
               i.t === 'err' ? 'border-coral/40 bg-coral/20 text-coral' : 'border-mint/40 bg-mint/15 text-mint')}>
          {i.m}
        </div>
      ))}
    </div>
  );
}

/** Pluie de confettis à la validation d'une tâche. */
export function Confetti({ fire }: { fire: number }) {
  const [bits, setBits] = useState<{ id: number; x: number; d: number; c: string; r: number }[]>([]);
  useEffect(() => {
    if (!fire) return;
    const colors = ['#7C5CFF', '#2FD8A5', '#FFC44D', '#FF6B6B', '#4DA6FF'];
    setBits(Array.from({ length: 40 }, (_, i) => ({
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
        <span key={b.id} className="absolute h-2.5 w-2 rounded-[2px]"
              style={{
                left: `${b.x}%`, top: '-5%', background: b.c,
                transform: `rotate(${b.r}deg)`,
                animation: `fall 2.2s cubic-bezier(.3,.7,.5,1) ${b.d}s forwards`,
              }} />
      ))}
      <style>{`@keyframes fall{to{transform:translateY(108vh) rotate(720deg);opacity:0}}`}</style>
    </div>
  );
}

export function SegmentedTabs<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  return (
    <div className="flex gap-1 rounded-2xl border border-line bg-raised p-1">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
                className={clsx('flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition',
                  value === o.value ? 'bg-brand text-white shadow-lg shadow-brand/25' : 'text-muted')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
