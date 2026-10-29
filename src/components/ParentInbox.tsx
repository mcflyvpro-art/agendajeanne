'use client';
import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import PushManager from '@/components/PushManager';
import { useApp } from '@/components/AppProvider';
import { supabase } from '@/lib/supabase';
import { useLive } from '@/lib/useLive';
import { notify } from '@/lib/actions';
import { reactionEmoji } from '@/lib/reactions';
import { Sheet, SegmentedTabs, toast } from '@/components/ui';
import type { Message } from '@/lib/types';

const when = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Boîte aux lettres du parent. Toutes les notifications (tâche terminée,
 * demande de récompense, SOS, humeur, réactions…) arrivent ici au lieu
 * d'empiler des cartes sur le tableau de bord. Une pastille compte les non-lus ;
 * ouvrir la boîte vaut lecture. L'onglet « Envoyés » sert aussi à écrire.
 */
export default function ParentInbox() {
  const { profile, child } = useApp();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'in' | 'out'>('in');
  const [inbox, setInbox] = useState<Message[]>([]);
  const [sent, setSent] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!profile || !child) return;
    const [i, o] = await Promise.all([
      supabase.from('messages').select('*').eq('to_id', profile.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('messages').select('*').eq('to_id', child.id).in('kind', ['message', 'kudos'])
        .order('created_at', { ascending: false }).limit(20),
    ]);
    setInbox((i.data ?? []) as Message[]);
    setSent((o.data ?? []) as Message[]);
  }, [profile?.id, child?.id]);

  useEffect(() => { load(); }, [load]);
  useLive(['messages'], load, 'parent-inbox');

  const unread = inbox.filter((m) => !m.read_at);
  const sos = unread.some((m) => m.kind === 'blocked');

  const openBox = async () => {
    setTab('in');
    setOpen(true);
    if (unread.length) {
      const now = new Date().toISOString();
      setInbox((list) => list.map((m) => (m.read_at ? m : { ...m, read_at: now })));
      await supabase.from('messages').update({ read_at: now }).in('id', unread.map((m) => m.id));
    }
  };

  const send = async () => {
    if (!profile || !child || !text.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('messages').insert({
        from_id: profile.id, to_id: child.id, kind: 'message', body: text.trim(), emoji: '✉️',
      });
      if (error) throw error;
      notify('message', { body: text.trim() });
      setText('');
      toast('Message envoyé');
      load();
    } catch { toast('Non envoyé, réessaie', 'err'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <button onClick={openBox} aria-label={`Boîte aux lettres${unread.length ? `, ${unread.length} non lus` : ''}`}
              className="relative shrink-0 no-select active:scale-90">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-card text-2xl shadow-float">📬</span>
        {unread.length > 0 && (
          <span className={clsx('absolute -right-1 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full px-1 text-[11px] font-black text-white',
            sos ? 'animate-halo bg-flame' : 'bg-grape')}>
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Boîte aux lettres">
        <SegmentedTabs value={tab} onChange={setTab} options={[
          { value: 'in', label: '📥 Reçus' },
          { value: 'out', label: `✉️ À ${child?.display_name ?? 'elle'}` },
        ]} />

        {tab === 'in' ? (
          <div className="mt-4 space-y-2.5">
            <PushManager />
            {child && !child.push_enabled && (
              <p className="rounded-3xl bg-flame-light px-4 py-3 text-sm font-bold text-ink">
                🔕 <b className="text-flame-dark">{child.display_name} ne reçoit aucun rappel.</b> Sur son téléphone,
                ouvre l’app depuis l’icône et appuie sur « Activer ».
              </p>
            )}
            {inbox.length === 0 ? (
              <p className="py-10 text-center font-bold text-muted"><span className="block text-5xl">📭</span>Rien pour l’instant</p>
            ) : (
              <ul className="space-y-2">
                {inbox.map((m) => (
                  <li key={m.id}
                      className={clsx('flex items-start gap-3 rounded-3xl border-2 p-3.5',
                        m.kind === 'blocked' ? 'border-sun bg-sun-light' : 'border-line bg-card')}>
                    <span className="text-2xl leading-7">{m.emoji ?? '💬'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold leading-snug text-ink">{m.body}</p>
                      <p className="mt-0.5 text-xs font-bold text-muted">{when(m.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="mt-4">
            <textarea className="field min-h-[96px]" value={text} onChange={(e) => setText(e.target.value)}
                      placeholder={`Un mot pour ${child?.display_name ?? 'elle'}…`} />
            <button onClick={send} disabled={busy || !text.trim()} className="btn-grape mt-3 w-full">
              {busy ? 'Envoi…' : 'Envoyer'}
            </button>
            <ul className="mt-5 space-y-2">
              {sent.map((m) => (
                <li key={m.id} className="flex items-start gap-3 rounded-3xl border-2 border-line bg-card p-3.5">
                  <span className="text-2xl leading-7">{m.emoji ?? '✉️'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-snug text-ink">{m.body}</p>
                    <p className="mt-0.5 text-xs font-bold text-muted">{when(m.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={clsx('text-xs font-black', m.read_at ? 'text-leaf' : 'text-muted')}>
                      {m.read_at ? '✓✓ Lu' : '✓ Envoyé'}
                    </span>
                    {m.reaction && <span className="text-xl">{reactionEmoji(m.reaction)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Sheet>
    </>
  );
}
