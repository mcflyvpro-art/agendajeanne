'use client';
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Plus, Trash2, Copy, Sparkles, Repeat, X } from 'lucide-react';
import ParentShell from '@/components/ParentShell';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { useDay } from '@/lib/useDay';
import { todayISO, addDaysISO, weekStart, dayShort, dowOf, hhmm, longDate, humanDuration } from '@/lib/dates';
import { suggestCoins } from '@/lib/economy';
import { notify } from '@/lib/actions';
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

  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart(day), i)), [day]);
  const load = useMemo(() => tasks.reduce((n, t) => n + (t.status === 'skipped' ? 0 : t.duration_min), 0), [tasks]);
  if (loading || !child || !settings) return <Loader />;
  const over = load > settings.max_daily_minutes;

  return (
    <main className="mx-auto max-w-lg px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-3xl font-black text-ink">Agenda</h1>
        <div className="flex gap-2">
          <button onClick={() => setRoutines(true)} className="chip"><Repeat size={14} /> Routines</button>
          <button onClick={() => setCopyOpen(true)} className="chip"><Copy size={14} /></button>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {week.map((d) => {
          const active = d === day;
          return (
            <button key={d} onClick={() => setDay(d)}
                    className={clsx('flex flex-1 flex-col items-center rounded-3xl border-2 py-2.5 no-select transition',
                      active ? 'border-grape bg-grape text-white' : d === todayISO() ? 'border-grape bg-card text-grape' : 'border-line bg-card text-muted')}>
              <span className="text-[10px] font-black uppercase">{dayShort(dowOf(d))}</span>
              <span className="text-xl font-black leading-tight">{Number(d.slice(-2))}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex justify-between">
        <button onClick={() => setDay(addDaysISO(day, -7))} className="chip">←</button>
        <button onClick={() => setDay(todayISO())} className="chip !border-grape !text-grape">Aujourd’hui</button>
        <button onClick={() => setDay(addDaysISO(day, 7))} className="chip">→</button>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <h2 className="text-lg font-black capitalize text-ink">{longDate(day)}</h2>
        <span className={clsx('chip', over && '!border-flame !bg-flame-light !text-flame-dark')}>
          ⏳ {humanDuration(load)}
        </span>
      </div>

      {tasks.length === 0 ? (
        <div className="mt-5"><Empty emoji="📝" title="Journée vide" /></div>
      ) : (
        <ul className="stagger mt-4 space-y-3">
          {tasks.map((t) => (
            <li key={t.id}>
              <button onClick={() => setDraft(toDraft(t))} className="card w-full p-4 text-left no-select active:scale-[.99]">
                <div className="flex items-start gap-3">
                  <span className="w-12 shrink-0 text-sm font-black tabular-nums text-ink">{t.start_time ? hhmm(t.start_time) : 'libre'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-ink">{t.title}</p>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs font-bold text-muted">
                      {t.subject && <span>{t.subject.emoji} {t.subject.name}</span>}
                      <span>{humanDuration(t.duration_min)}</span>
                      <span className="text-grape">+{t.coins} {settings.currency_emoji}</span>
                      {t.routine_id && <span>↻</span>}
                      {t.require_photo && <span>📷</span>}
                      {t.require_validation && <span>👁️</span>}
                    </div>
                  </div>
                  <span className="shrink-0 text-xl">
                    {t.status === 'done' ? '✅' : t.status === 'doing' ? '▶️' : t.status === 'submitted' ? '⏳' : ''}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button onClick={() => setDraft({ ...emptyDraft(), subject_id: subjects[0]?.id ?? '' })}
              className="btn-grape btn-lg mt-5 w-full"><Plus size={20} /> Ajouter</button>

      {draft && <TaskSheet draft={draft} day={day} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); reload(); }} />}
      <RoutinesSheet open={routines} onClose={() => setRoutines(false)} onGenerated={reload} />
      <CopySheet open={copyOpen} onClose={() => setCopyOpen(false)} day={day} tasks={tasks} onDone={reload} />
    </main>
  );
}

function toDraft(t: Task): Draft {
  return {
    id: t.id, title: t.title, description: t.description ?? '', subject_id: t.subject_id ?? '',
    start_time: t.start_time ? hhmm(t.start_time) : '09:00', duration_min: t.duration_min,
    difficulty: t.difficulty, is_flexible: t.is_flexible, coins: t.coins, coinsAuto: false,
    require_photo: t.require_photo, require_validation: t.require_validation, min_timer_pct: t.min_timer_pct,
    allow_postpone: t.allow_postpone, link_url: t.link_url ?? '', parent_note: t.parent_note ?? '',
    subtasks: (t.subtasks ?? []).map((s) => s.label),
  };
}

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
    if (!d.title.trim()) { toast('Titre manquant', 'err'); return; }
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
        notify('task_created', { title: d.title.trim(), day, time: d.is_flexible ? null : d.start_time });
      }
      const subs = d.subtasks.map((l) => l.trim()).filter(Boolean);
      if (subs.length) await supabase.from('subtasks').insert(subs.map((label, i) => ({ task_id: taskId, label, position: i })));
      toast(d.id ? 'Modifiée' : 'Ajoutée');
      onSaved();
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  const aiSplit = async () => {
    if (!d.title.trim()) return;
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
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setAiBusy(false); }
  };

  const Tri = ({ v, fb, on }: { v: boolean | null; fb: boolean; on: (x: boolean | null) => void }) => (
    <div className="flex gap-2">
      {([['Auto', null], ['Oui', true], ['Non', false]] as [string, boolean | null][]).map(([lbl, val]) => (
        <button key={lbl} onClick={() => on(val)}
                className={clsx('flex-1 rounded-2xl border-2 py-2.5 text-sm font-extrabold transition',
                  v === val ? 'border-grape bg-grape-light text-grape' : 'border-line bg-card text-muted')}>
          {lbl}
        </button>
      ))}
    </div>
  );

  return (
    <Sheet open onClose={onClose} title={d.id ? 'Modifier' : 'Nouvelle tâche'}
           footer={
             <div className="flex gap-2.5">
               {d.id && (
                 <button onClick={async () => { await supabase.from('tasks').delete().eq('id', d.id!); toast('Supprimée'); onSaved(); }}
                         className="btn-flame !px-5"><Trash2 size={18} /></button>
               )}
               <button onClick={save} disabled={busy} className="btn-grape btn-lg flex-1">
                 {busy ? '…' : d.id ? 'Enregistrer' : 'Ajouter'}
               </button>
             </div>
           }>
      <SegmentedTabs value={tab} onChange={setTab} options={[{ value: 'base', label: 'Contenu' }, { value: 'rules', label: 'Règles' }]} />

      {tab === 'base' ? (
        <div className="mt-5 space-y-4">
          <input className="field" value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="Titre" />

          <div className="scroll-x flex gap-2 pb-1">
            {subjects.map((s) => (
              <button key={s.id} onClick={() => set('subject_id', s.id)}
                      className={clsx('chip shrink-0', d.subject_id === s.id && '!border-grape !bg-grape-light !text-grape')}>
                {s.emoji} {s.name}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Heure</label>
              <input type="time" className="field" value={d.start_time} disabled={d.is_flexible}
                     onChange={(e) => set('start_time', e.target.value)} />
            </div>
            <div>
              <label className="label">Durée</label>
              <input type="number" min={5} step={5} className="field" value={d.duration_min}
                     onChange={(e) => set('duration_min', Math.max(5, Number(e.target.value) || 5))} />
            </div>
          </div>

          <button onClick={() => set('is_flexible', !d.is_flexible)}
                  className={clsx('flex w-full items-center gap-3 rounded-3xl border-2 px-4 py-3.5 text-left no-select',
                    d.is_flexible ? 'border-grape bg-grape-light' : 'border-line bg-card')}>
            <span className="text-2xl">{d.is_flexible ? '🔓' : '🔒'}</span>
            <span className="font-extrabold text-ink">Créneau libre</span>
          </button>

          <div>
            <label className="label">Difficulté</label>
            <div className="flex gap-2">
              {['🙂', '😐', '😤', '🔥'].map((e, i) => (
                <button key={i} onClick={() => set('difficulty', i + 1)}
                        className={clsx('flex-1 rounded-2xl border-2 py-3 text-2xl transition',
                          d.difficulty === i + 1 ? 'border-grape bg-grape-light' : 'border-line bg-card')}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Valeur</label>
            <div className="flex gap-2">
              <input type="number" className="field flex-1" value={coins} disabled={d.coinsAuto}
                     onChange={(e) => set('coins', Number(e.target.value) || 0)} />
              <button onClick={() => setD((x) => ({ ...x, coinsAuto: !x.coinsAuto, coins: auto }))}
                      className={clsx('chip !px-4', d.coinsAuto && '!border-grape !bg-grape-light !text-grape')}>
                {d.coinsAuto ? 'Auto' : 'Manuel'}
              </button>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="label !mb-0">Étapes</label>
              <button onClick={aiSplit} disabled={aiBusy} className="chip !border-grape !bg-grape-light !text-grape">
                <Sparkles size={13} /> {aiBusy ? '…' : 'IA'}
              </button>
            </div>
            <div className="space-y-2">
              {d.subtasks.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="field !py-2.5" value={s}
                         onChange={(e) => set('subtasks', d.subtasks.map((x, k) => (k === i ? e.target.value : x)))} />
                  <button onClick={() => set('subtasks', d.subtasks.filter((_, k) => k !== i))}
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-soft"><X size={16} /></button>
                </div>
              ))}
              <button onClick={() => set('subtasks', [...d.subtasks, ''])} className="btn-plain w-full text-sm">
                <Plus size={16} /> Étape
              </button>
            </div>
          </div>

          <input className="field" value={d.link_url} onChange={(e) => set('link_url', e.target.value)}
                 placeholder="Lien (facultatif)" inputMode="url" autoCapitalize="none" />
          <textarea className="field min-h-[80px]" value={d.parent_note} onChange={(e) => set('parent_note', e.target.value)}
                    placeholder="Mot pour Jeanne" />
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <div><label className="label">📷 Photo obligatoire</label><Tri v={d.require_photo} fb={settings.default_require_photo} on={(v) => set('require_photo', v)} /></div>
          <div><label className="label">👁️ Validation parent</label><Tri v={d.require_validation} fb={settings.default_require_validation} on={(v) => set('require_validation', v)} /></div>
          <div>
            <label className="label">⏱️ Minuteur · {d.min_timer_pct ?? settings.default_min_timer_pct}%</label>
            <input type="range" min={0} max={100} step={10} className="w-full accent-grape"
                   value={d.min_timer_pct ?? settings.default_min_timer_pct}
                   onChange={(e) => set('min_timer_pct', Number(e.target.value))} />
          </div>
          <button onClick={() => set('allow_postpone', !d.allow_postpone)}
                  className={clsx('flex w-full items-center gap-3 rounded-3xl border-2 px-4 py-3.5 no-select',
                    d.allow_postpone ? 'border-grape bg-grape-light' : 'border-line bg-card')}>
            <span className="text-2xl">⏭️</span><span className="font-extrabold text-ink">Report autorisé</span>
          </button>
        </div>
      )}
    </Sheet>
  );
}

function RoutinesSheet({ open, onClose, onGenerated }: { open: boolean; onClose: () => void; onGenerated: () => void }) {
  const { subjects } = useApp();
  const [list, setList] = useState<Routine[]>([]);
  const [form, setForm] = useState<Partial<Routine> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('routines').select('*').order('start_time');
    setList((data ?? []) as Routine[]);
  };
  useEffect(() => { if (open) load(); }, [open]);

  const save = async () => {
    if (!form?.title || !form.start_time) { toast('Titre et heure', 'err'); return; }
    setBusy(true);
    const payload = {
      title: form.title, subject_id: form.subject_id || null,
      days_of_week: form.days_of_week ?? [1, 2, 3, 4, 5],
      start_time: form.start_time, duration_min: form.duration_min ?? 45,
      difficulty: form.difficulty ?? 2, active: true,
    };
    if (form.id) await supabase.from('routines').update(payload).eq('id', form.id);
    else await supabase.from('routines').insert(payload);
    setForm(null); await load(); setBusy(false); toast('Enregistrée');
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
      toast(`${j.created} tâches créées`);
      onGenerated();
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Routines"
           footer={<button onClick={generate} disabled={busy} className="btn-grape btn-lg w-full"><Repeat size={18} /> Générer 14 jours</button>}>
      {form ? (
        <div className="space-y-4">
          <input className="field" placeholder="Titre" value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <div className="scroll-x flex gap-2 pb-1">
            {subjects.map((s) => (
              <button key={s.id} onClick={() => setForm({ ...form, subject_id: s.id })}
                      className={clsx('chip shrink-0', form.subject_id === s.id && '!border-grape !bg-grape-light !text-grape')}>
                {s.emoji} {s.name}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5, 6, 0].map((n) => {
              const on = (form.days_of_week ?? [1, 2, 3, 4, 5]).includes(n);
              return (
                <button key={n}
                        onClick={() => {
                          const cur = form.days_of_week ?? [1, 2, 3, 4, 5];
                          setForm({ ...form, days_of_week: on ? cur.filter((x) => x !== n) : [...cur, n] });
                        }}
                        className={clsx('flex-1 rounded-2xl border-2 py-2.5 text-[11px] font-black uppercase',
                          on ? 'border-grape bg-grape-light text-grape' : 'border-line bg-card text-muted')}>
                  {dayShort(n)}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="time" className="field" value={form.start_time ?? '09:00'} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            <input type="number" className="field" value={form.duration_min ?? 45} onChange={(e) => setForm({ ...form, duration_min: Number(e.target.value) })} />
          </div>
          <div className="flex gap-2.5">
            <button onClick={() => setForm(null)} className="btn-plain flex-1">Annuler</button>
            <button onClick={save} disabled={busy} className="btn-grape flex-1">Enregistrer</button>
          </div>
        </div>
      ) : (
        <>
          <ul className="space-y-2.5">
            {list.map((r) => (
              <li key={r.id} className="card flex items-center gap-3 p-3.5">
                <button onClick={() => setForm(r)} className="min-w-0 flex-1 text-left">
                  <p className="truncate font-extrabold text-ink">{r.title}</p>
                  <p className="text-xs font-bold text-muted">
                    {hhmm(r.start_time)} · {r.duration_min} min · {r.days_of_week.map((d) => dayShort(d)).join(' ')}
                  </p>
                </button>
                <button onClick={async () => { await supabase.from('routines').delete().eq('id', r.id); load(); }}
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-flame-light"><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
          {list.length === 0 && <Empty emoji="↻" title="Aucune routine" />}
          <button onClick={() => setForm({ days_of_week: [1, 2, 3, 4, 5], start_time: '09:00', duration_min: 45, difficulty: 2 })}
                  className="btn-plain mt-4 w-full"><Plus size={18} /> Nouvelle</button>
        </>
      )}
    </Sheet>
  );
}

function CopySheet({ open, onClose, day, tasks, onDone }: {
  open: boolean; onClose: () => void; day: string; tasks: Task[]; onDone: () => void;
}) {
  const { child, profile } = useApp();
  const [target, setTarget] = useState(addDaysISO(day, 1));
  const [busy, setBusy] = useState(false);

  const copy = async () => {
    if (!tasks.length) return;
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
    setBusy(false); onClose(); onDone(); toast(`${tasks.length} copiées`);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Dupliquer"
           footer={<button onClick={copy} disabled={busy} className="btn-grape btn-lg w-full">Copier {tasks.length} tâches</button>}>
      <input type="date" className="field" value={target} onChange={(e) => setTarget(e.target.value)} />
      <div className="mt-3 flex gap-2">
        {[1, 2, 7].map((n) => (
          <button key={n} onClick={() => setTarget(addDaysISO(day, n))} className="chip">+{n} j</button>
        ))}
      </div>
    </Sheet>
  );
}
