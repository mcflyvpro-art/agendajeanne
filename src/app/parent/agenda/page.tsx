'use client';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Plus, Trash2, Copy, Sparkles, Repeat, GripVertical, X, AlertTriangle } from 'lucide-react';
import ParentShell from '@/components/ParentShell';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { useDay } from '@/lib/useDay';
import { todayISO, addDaysISO, weekStart, dayShort, dowOf, hhmm, longDate, humanDuration } from '@/lib/dates';
import { suggestCoins } from '@/lib/economy';
import { Loader, Sheet, Empty, SegmentedTabs, toast } from '@/components/ui';
import type { Task, Routine } from '@/lib/types';

export default function AgendaPage() { return <ParentShell><Agenda /></ParentShell>; }

const emptyDraft = () => ({
  id: null as string | null,
  title: '', description: '', subject_id: '' as string,
  start_time: '09:00', duration_min: 45, difficulty: 2,
  is_flexible: false, coins: 0, coinsAuto: true,
  require_photo: null as boolean | null,
  require_validation: null as boolean | null,
  min_timer_pct: null as number | null,
  allow_postpone: true,
  link_url: '', parent_note: '',
  subtasks: [] as string[],
});
type Draft = ReturnType<typeof emptyDraft>;

function Agenda() {
  const { child, settings, subjects } = useApp();
  const [day, setDay] = useState(todayISO());
  const { tasks, loading, reload } = useDay(child?.id, day);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [routines, setRoutines] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);

  const week = useMemo(() => {
    const ws = weekStart(day);
    return Array.from({ length: 7 }, (_, i) => addDaysISO(ws, i));
  }, [day]);

  const load = useMemo(() => tasks.reduce((n, t) => n + (t.status === 'skipped' ? 0 : t.duration_min), 0), [tasks]);
  if (loading || !child || !settings) return <Loader />;
  const overloaded = load > settings.max_daily_minutes;

  return (
    <main className="mx-auto max-w-lg px-4 pb-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight">Agenda</h1>
        <div className="flex gap-1.5">
          <button onClick={() => setRoutines(true)} className="btn-soft !px-3 !py-2 text-xs"><Repeat size={14} /> Routines</button>
          <button onClick={() => setCopyOpen(true)} className="btn-soft !px-3 !py-2 text-xs"><Copy size={14} /></button>
        </div>
      </div>

      <div className="scroll-x mt-4 flex gap-2 pb-1">
        {week.map((d) => {
          const active = d === day;
          return (
            <button key={d} onClick={() => setDay(d)}
                    className={clsx('flex min-w-[52px] flex-col items-center rounded-2xl border px-2 py-2.5 transition',
                      active ? 'border-brand bg-brand text-white' : 'border-line bg-raised text-muted',
                      d === todayISO() && !active && 'border-brand/50 text-brand-soft')}>
              <span className="text-[10px] font-bold uppercase">{dayShort(dowOf(d))}</span>
              <span className="text-lg font-black leading-tight">{Number(d.slice(-2))}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between">
        <button onClick={() => setDay(addDaysISO(day, -7))} className="text-xs font-semibold text-muted">← semaine</button>
        <button onClick={() => setDay(todayISO())} className="text-xs font-semibold text-brand-soft">aujourd’hui</button>
        <button onClick={() => setDay(addDaysISO(day, 7))} className="text-xs font-semibold text-muted">semaine →</button>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <h2 className="font-bold capitalize">{longDate(day)}</h2>
        <span className={clsx('chip', overloaded && '!border-coral/35 !bg-coral/10 !text-coral')}>
          {overloaded && <AlertTriangle size={11} />}{humanDuration(load)}
        </span>
      </div>
      {overloaded && (
        <p className="mt-2 rounded-2xl border border-coral/25 bg-coral/[.08] px-3 py-2.5 text-xs leading-relaxed text-coral">
          Au-delà de {humanDuration(settings.max_daily_minutes)}, une journée devient irréaliste — et une journée irréaliste
          se solde souvent par zéro tâche faite plutôt que par quelques-unes.
        </p>
      )}

      {tasks.length === 0 ? (
        <div className="mt-5"><Empty emoji="📝" title="Journée vide" hint="Ajoute une première tâche ci-dessous." /></div>
      ) : (
        <ul className="stagger mt-4 space-y-2.5">
          {tasks.map((t) => (
            <li key={t.id}>
              <button onClick={() => setDraft(taskToDraft(t))} className="card w-full p-4 text-left active:scale-[.99]">
                <div className="flex items-start gap-3">
                  <span className="w-11 shrink-0 pt-0.5 font-mono text-xs font-bold text-white/70">
                    {t.start_time ? hhmm(t.start_time) : 'libre'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-snug">{t.title}</p>
                    <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-muted">
                      {t.subject && <span>{t.subject.emoji} {t.subject.name}</span>}
                      <span>{humanDuration(t.duration_min)}</span>
                      <span className="text-brand-soft">+{t.coins} {settings.currency_emoji}</span>
                      {t.routine_id && <span className="text-sky">↻ routine</span>}
                      {t.require_photo && <span>📷</span>}
                      {t.require_validation && <span>👁️</span>}
                      {!!t.subtasks?.length && <span>{t.subtasks.length} étapes</span>}
                    </div>
                  </div>
                  <span className={clsx('shrink-0 text-xs font-bold',
                    t.status === 'done' ? 'text-mint' : t.status === 'doing' ? 'text-mint' :
                    t.status === 'submitted' ? 'text-sun' : 'text-muted')}>
                    {t.status === 'done' ? '✓' : t.status === 'doing' ? '●' : t.status === 'submitted' ? '⏳' : ''}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button onClick={() => setDraft({ ...emptyDraft(), subject_id: subjects[0]?.id ?? '' })}
              className="btn-primary mt-5 w-full !py-4">
        <Plus size={19} /> Ajouter une tâche
      </button>

      {draft && <TaskSheet draft={draft} day={day} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); reload(); }} />}
      <RoutinesSheet open={routines} onClose={() => setRoutines(false)} onGenerated={reload} />
      <CopySheet open={copyOpen} onClose={() => setCopyOpen(false)} day={day} tasks={tasks} onDone={reload} />
    </main>
  );
}

function taskToDraft(t: Task): Draft {
  return {
    id: t.id, title: t.title, description: t.description ?? '', subject_id: t.subject_id ?? '',
    start_time: t.start_time ? hhmm(t.start_time) : '09:00', duration_min: t.duration_min,
    difficulty: t.difficulty, is_flexible: t.is_flexible, coins: t.coins, coinsAuto: false,
    require_photo: t.require_photo, require_validation: t.require_validation, min_timer_pct: t.min_timer_pct,
    allow_postpone: t.allow_postpone, link_url: t.link_url ?? '', parent_note: t.parent_note ?? '',
    subtasks: (t.subtasks ?? []).map((s) => s.label),
  };
}

/* ------------------------------------------------------ formulaire tâche */
function TaskSheet({ draft, day, onClose, onSaved }: { draft: Draft; day: string; onClose: () => void; onSaved: () => void }) {
  const { child, settings, subjects, profile } = useApp();
  const [d, setD] = useState<Draft>(draft);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [tab, setTab] = useState<'base' | 'rules'>('base');
  if (!settings || !child) return null;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const auto = suggestCoins(settings, d.duration_min, d.difficulty);
  const coins = d.coinsAuto ? auto : d.coins;

  const save = async () => {
    if (!d.title.trim()) { toast('Il faut un titre', 'err'); return; }
    setBusy(true);
    try {
      const payload = {
        child_id: child.id, created_by: profile!.id, day,
        title: d.title.trim(), description: d.description.trim() || null,
        subject_id: d.subject_id || null,
        start_time: d.is_flexible ? null : d.start_time,
        duration_min: d.duration_min, is_flexible: d.is_flexible, difficulty: d.difficulty,
        coins, require_photo: d.require_photo, require_validation: d.require_validation,
        min_timer_pct: d.min_timer_pct, allow_postpone: d.allow_postpone,
        link_url: d.link_url.trim() || null, parent_note: d.parent_note.trim() || null,
      };
      let taskId = d.id;
      if (taskId) {
        await supabase.from('tasks').update(payload).eq('id', taskId);
        await supabase.from('subtasks').delete().eq('task_id', taskId);
      } else {
        const { data, error } = await supabase.from('tasks').insert(payload).select('id').single();
        if (error) throw error;
        taskId = data.id;
      }
      const subs = d.subtasks.map((l) => l.trim()).filter(Boolean);
      if (subs.length) {
        await supabase.from('subtasks').insert(subs.map((label, i) => ({ task_id: taskId, label, position: i })));
      }
      toast(d.id ? 'Tâche modifiée' : 'Tâche ajoutée ✅');
      onSaved();
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!d.id) return;
    await supabase.from('tasks').delete().eq('id', d.id);
    toast('Supprimée'); onSaved();
  };

  const aiSplit = async () => {
    if (!d.title.trim()) { toast('Écris d’abord le titre', 'err'); return; }
    setAiBusy(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch('/api/ai/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` },
        body: JSON.stringify({ title: d.title, description: d.description }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      set('subtasks', json.steps);
      toast('Étapes générées ✨');
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setAiBusy(false); }
  };

  const tri = (v: boolean | null, fallback: boolean, onChange: (v: boolean | null) => void) => (
    <div className="flex gap-1.5">
      {([['Défaut', null], ['Oui', true], ['Non', false]] as [string, boolean | null][]).map(([lbl, val]) => (
        <button key={lbl} onClick={() => onChange(val)}
                className={clsx('flex-1 rounded-xl border px-2 py-2 text-xs font-semibold transition',
                  v === val ? 'border-brand bg-brand/20 text-white' : 'border-line bg-raised text-muted')}>
          {lbl}{val === null && <span className="ml-1 opacity-60">({fallback ? 'oui' : 'non'})</span>}
        </button>
      ))}
    </div>
  );

  return (
    <Sheet open onClose={onClose} title={d.id ? 'Modifier la tâche' : 'Nouvelle tâche'}
           footer={
             <div className="flex gap-2">
               {d.id && <button onClick={remove} className="btn-danger !px-4"><Trash2 size={16} /></button>}
               <button onClick={save} disabled={busy} className="btn-primary flex-1 !py-3.5">
                 {busy ? 'Enregistrement…' : d.id ? 'Enregistrer' : 'Ajouter'}
               </button>
             </div>
           }>
      <SegmentedTabs value={tab} onChange={setTab}
                     options={[{ value: 'base', label: 'Contenu' }, { value: 'rules', label: 'Règles' }]} />

      {tab === 'base' ? (
        <div className="mt-5 space-y-4">
          <div>
            <label className="label">Titre</label>
            <input className="field" value={d.title} onChange={(e) => set('title', e.target.value)}
                   placeholder="Ex : Maths — exercices sur Thalès" />
          </div>

          <div>
            <label className="label">Matière</label>
            <div className="scroll-x flex gap-2 pb-1">
              {subjects.map((s) => (
                <button key={s.id} onClick={() => set('subject_id', s.id)}
                        className={clsx('chip shrink-0 !px-3 !py-2 transition',
                          d.subject_id === s.id && '!border-brand !bg-brand/20 !text-white')}>
                  {s.emoji} {s.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Heure</label>
              <input type="time" className="field" value={d.start_time} disabled={d.is_flexible}
                     onChange={(e) => set('start_time', e.target.value)} />
            </div>
            <div>
              <label className="label">Durée (min)</label>
              <input type="number" min={5} step={5} className="field" value={d.duration_min}
                     onChange={(e) => set('duration_min', Math.max(5, Number(e.target.value) || 5))} />
            </div>
          </div>

          <label className="flex items-center gap-3 rounded-2xl border border-line bg-raised px-4 py-3">
            <input type="checkbox" checked={d.is_flexible} onChange={(e) => set('is_flexible', e.target.checked)}
                   className="h-5 w-5 accent-[#7C5CFF]" />
            <div>
              <p className="text-sm font-semibold">Créneau libre</p>
              <p className="text-[11px] leading-snug text-muted">Elle choisit quand la faire dans la journée — plus d’autonomie, meilleure adhésion.</p>
            </div>
          </label>

          <div>
            <label className="label">Difficulté</label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4].map((n) => (
                <button key={n} onClick={() => set('difficulty', n)}
                        className={clsx('flex-1 rounded-xl border py-2.5 text-sm font-bold transition',
                          d.difficulty === n ? 'border-brand bg-brand/20 text-white' : 'border-line bg-raised text-muted')}>
                  {['Facile', 'Normal', 'Dur', 'Costaud'][n - 1]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Valeur · {settings.currency_name}</label>
            <div className="flex items-center gap-2">
              <input type="number" className="field flex-1" value={coins} disabled={d.coinsAuto}
                     onChange={(e) => set('coins', Number(e.target.value) || 0)} />
              <button onClick={() => setD((x) => ({ ...x, coinsAuto: !x.coinsAuto, coins: auto }))}
                      className={clsx('btn-soft shrink-0 !px-3 text-xs', d.coinsAuto && '!border-brand/40 !text-brand-soft')}>
                {d.coinsAuto ? 'Auto' : 'Manuel'}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted">
              Barème : {settings.base_coins} + {settings.coins_per_10min}/10 min × difficulté → <b>{auto}</b>
            </p>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="label !mb-0">Micro-étapes</label>
              <button onClick={aiSplit} disabled={aiBusy} className="chip !border-brand/35 !bg-brand/12 !text-brand-soft">
                <Sparkles size={12} /> {aiBusy ? 'Génération…' : 'Découper avec l’IA'}
              </button>
            </div>
            <p className="mb-2.5 text-[11px] leading-relaxed text-muted">
              Le levier le plus efficace contre la procrastination : la première étape doit être ridiculement facile.
            </p>
            <div className="space-y-2">
              {d.subtasks.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <GripVertical size={15} className="shrink-0 text-muted" />
                  <input className="field !py-2.5 text-sm" value={s}
                         onChange={(e) => set('subtasks', d.subtasks.map((x, k) => (k === i ? e.target.value : x)))} />
                  <button onClick={() => set('subtasks', d.subtasks.filter((_, k) => k !== i))}
                          className="btn-soft h-9 w-9 shrink-0 !rounded-full !p-0"><X size={14} /></button>
                </div>
              ))}
              <button onClick={() => set('subtasks', [...d.subtasks, ''])} className="btn-soft w-full text-xs">
                <Plus size={14} /> Ajouter une étape
              </button>
            </div>
          </div>

          <div>
            <label className="label">Lien à ouvrir (facultatif)</label>
            <input className="field" value={d.link_url} onChange={(e) => set('link_url', e.target.value)}
                   placeholder="https://… (Pronote, un PDF, une vidéo)" inputMode="url" autoCapitalize="none" />
          </div>

          <div>
            <label className="label">Mot pour Jeanne</label>
            <textarea className="field min-h-[70px]" value={d.parent_note} onChange={(e) => set('parent_note', e.target.value)}
                      placeholder="Un message perso qui s’affiche avec la tâche. Ça marche bien mieux qu’un texte générique." />
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <p className="rounded-2xl border border-line bg-raised px-3.5 py-3 text-xs leading-relaxed text-muted">
            Chaque règle peut suivre le <b>réglage général</b> (onglet Règles) ou être forcée pour cette tâche précise.
          </p>
          <div>
            <label className="label">📷 Photo de preuve obligatoire</label>
            {tri(d.require_photo, settings.default_require_photo, (v) => set('require_photo', v))}
          </div>
          <div>
            <label className="label">👁️ Ta validation avant les points</label>
            {tri(d.require_validation, settings.default_require_validation, (v) => set('require_validation', v))}
          </div>
          <div>
            <label className="label">
              ⏱️ Temps minimum avant de pouvoir valider · {d.min_timer_pct ?? settings.default_min_timer_pct} %
            </label>
            <input type="range" min={0} max={100} step={10} className="w-full accent-[#7C5CFF]"
                   value={d.min_timer_pct ?? settings.default_min_timer_pct}
                   onChange={(e) => set('min_timer_pct', Number(e.target.value))} />
            <div className="mt-1 flex justify-between text-[11px] text-muted">
              <span>soit {Math.round((d.duration_min * (d.min_timer_pct ?? settings.default_min_timer_pct)) / 100)} min bloquées</span>
              {d.min_timer_pct !== null && (
                <button onClick={() => set('min_timer_pct', null)} className="font-semibold text-brand-soft">réglage général</button>
              )}
            </div>
          </div>
          <label className="flex items-center gap-3 rounded-2xl border border-line bg-raised px-4 py-3">
            <input type="checkbox" checked={d.allow_postpone} onChange={(e) => set('allow_postpone', e.target.checked)}
                   className="h-5 w-5 accent-[#7C5CFF]" />
            <div>
              <p className="text-sm font-semibold">Report autorisé</p>
              <p className="text-[11px] text-muted">Décoche pour une tâche non négociable.</p>
            </div>
          </label>
        </div>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------- routines */
function RoutinesSheet({ open, onClose, onGenerated }: { open: boolean; onClose: () => void; onGenerated: () => void }) {
  const { subjects, settings, child } = useApp();
  const [list, setList] = useState<Routine[]>([]);
  const [form, setForm] = useState<Partial<Routine> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('routines').select('*').order('start_time');
    setList((data ?? []) as Routine[]);
  };
  useEffect(() => { if (open) load(); }, [open]);

  const save = async () => {
    if (!form?.title || !form.start_time) { toast('Titre et heure obligatoires', 'err'); return; }
    setBusy(true);
    const payload = {
      title: form.title, subject_id: form.subject_id || null,
      days_of_week: form.days_of_week ?? [1, 2, 3, 4, 5],
      start_time: form.start_time, duration_min: form.duration_min ?? 45,
      difficulty: form.difficulty ?? 2, coins: form.coins ?? null,
      subtasks: form.subtasks ?? [], active: true,
    };
    if (form.id) await supabase.from('routines').update(payload).eq('id', form.id);
    else await supabase.from('routines').insert(payload);
    setForm(null); await load(); setBusy(false);
    toast('Routine enregistrée');
  };

  const generate = async () => {
    setBusy(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch('/api/routines/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.session?.access_token ?? ''}` },
        body: JSON.stringify({ days: 14 }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      toast(`${j.created} tâche${j.created > 1 ? 's' : ''} générée${j.created > 1 ? 's' : ''} sur 14 jours`);
      onGenerated();
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Routines récurrentes"
           footer={
             <button onClick={generate} disabled={busy} className="btn-primary w-full">
               <Repeat size={16} /> Générer les 14 prochains jours
             </button>
           }>
      <p className="mb-4 text-sm leading-relaxed text-muted">
        Sa journée type. Tu la construis une fois, elle se recrée automatiquement — c’est le cadre qui manque au CNED.
      </p>

      {form ? (
        <div className="space-y-4">
          <input className="field" placeholder="Titre" value={form.title ?? ''}
                 onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="scroll-x flex gap-2 pb-1">
            {subjects.map((s) => (
              <button key={s.id} onClick={() => setForm({ ...form, subject_id: s.id })}
                      className={clsx('chip shrink-0', form.subject_id === s.id && '!border-brand !bg-brand/20 !text-white')}>
                {s.emoji} {s.name}
              </button>
            ))}
          </div>
          <div>
            <label className="label">Jours</label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5, 6, 0].map((n) => {
                const on = (form.days_of_week ?? [1, 2, 3, 4, 5]).includes(n);
                return (
                  <button key={n}
                          onClick={() => {
                            const cur = form.days_of_week ?? [1, 2, 3, 4, 5];
                            setForm({ ...form, days_of_week: on ? cur.filter((x) => x !== n) : [...cur, n] });
                          }}
                          className={clsx('flex-1 rounded-xl border py-2.5 text-[11px] font-bold uppercase transition',
                            on ? 'border-brand bg-brand/20 text-white' : 'border-line bg-raised text-muted')}>
                    {dayShort(n)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Heure</label>
              <input type="time" className="field" value={form.start_time ?? '09:00'}
                     onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
            <div><label className="label">Durée (min)</label>
              <input type="number" className="field" value={form.duration_min ?? 45}
                     onChange={(e) => setForm({ ...form, duration_min: Number(e.target.value) })} /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setForm(null)} className="btn-soft flex-1">Annuler</button>
            <button onClick={save} disabled={busy} className="btn-primary flex-1">Enregistrer</button>
          </div>
        </div>
      ) : (
        <>
          <ul className="space-y-2.5">
            {list.map((r) => (
              <li key={r.id} className="card flex items-center gap-3 p-3.5">
                <button onClick={() => setForm(r)} className="min-w-0 flex-1 text-left">
                  <p className="truncate font-semibold">{r.title}</p>
                  <p className="text-[11px] text-muted">
                    {hhmm(r.start_time)} · {r.duration_min} min · {r.days_of_week.map((d) => dayShort(d)).join(' ')}
                  </p>
                </button>
                <button onClick={async () => { await supabase.from('routines').delete().eq('id', r.id); load(); }}
                        className="btn-soft h-9 w-9 shrink-0 !rounded-full !p-0"><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
          {list.length === 0 && <Empty emoji="↻" title="Aucune routine" hint="Crée sa journée type une bonne fois." />}
          <button onClick={() => setForm({ days_of_week: [1, 2, 3, 4, 5], start_time: '09:00', duration_min: 45, difficulty: 2 })}
                  className="btn-ghost mt-4 w-full"><Plus size={16} /> Nouvelle routine</button>
        </>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------ duplication */
function CopySheet({ open, onClose, day, tasks, onDone }: {
  open: boolean; onClose: () => void; day: string; tasks: Task[]; onDone: () => void;
}) {
  const { child, profile } = useApp();
  const [target, setTarget] = useState(addDaysISO(day, 1));
  const [busy, setBusy] = useState(false);

  const copy = async () => {
    if (!tasks.length) { toast('Rien à copier', 'err'); return; }
    setBusy(true);
    for (const t of tasks) {
      const { data } = await supabase.from('tasks').insert({
        child_id: child!.id, created_by: profile!.id, day: target, subject_id: t.subject_id,
        title: t.title, description: t.description, start_time: t.start_time, duration_min: t.duration_min,
        is_flexible: t.is_flexible, difficulty: t.difficulty, coins: t.coins,
        require_photo: t.require_photo, require_validation: t.require_validation,
        min_timer_pct: t.min_timer_pct, allow_postpone: t.allow_postpone,
        link_url: t.link_url, parent_note: t.parent_note,
      }).select('id').single();
      if (data && t.subtasks?.length) {
        await supabase.from('subtasks').insert(t.subtasks.map((s, i) => ({ task_id: data.id, label: s.label, position: i })));
      }
    }
    setBusy(false); onClose(); onDone();
    toast(`${tasks.length} tâches copiées`);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Dupliquer la journée"
           footer={<button onClick={copy} disabled={busy} className="btn-primary w-full">Copier les {tasks.length} tâches</button>}>
      <p className="mb-4 text-sm text-muted">Copie toutes les tâches de {longDate(day)} vers un autre jour.</p>
      <label className="label">Vers le</label>
      <input type="date" className="field" value={target} onChange={(e) => setTarget(e.target.value)} />
      <div className="mt-3 flex gap-2">
        {[1, 2, 7].map((n) => (
          <button key={n} onClick={() => setTarget(addDaysISO(day, n))} className="chip">
            +{n} {n === 7 ? 'semaine' : 'jour' + (n > 1 ? 's' : '')}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
