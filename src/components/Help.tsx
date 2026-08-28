'use client';
import { useState } from 'react';
import { Sheet } from '@/components/ui';

/**
 * Petit « ? » à côté d'un réglage. Ouvre une explication claire.
 * Réservé à l'interface parent : côté enfant, tout doit se comprendre sans texte.
 */
export default function Help({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Aide : ${title}`}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-grape-light text-xs font-black text-grape no-select active:scale-90">
        ?
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}
             footer={<button onClick={() => setOpen(false)} className="btn-grape w-full">Compris</button>}>
        <div className="space-y-3 text-[15px] font-medium leading-relaxed text-ink">{children}</div>
      </Sheet>
    </>
  );
}

/** Titre de réglage accompagné de son aide. */
export function LabelHelp({ label, help, title }: { label: string; help: React.ReactNode; title?: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-sm font-extrabold text-ink">{label}</span>
      <Help title={title ?? label}>{help}</Help>
    </div>
  );
}
