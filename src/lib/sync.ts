'use client';
import { useEffect, useMemo, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { deviceId, deviceKind, deviceLabel, deviceEmoji, detectOS } from '@/lib/device';

/**
 * Cœur de la synchronisation multi-appareils.
 *
 * Un seul canal temps réel pour toute l'app (au lieu d'un par écran), avec :
 *  · reconnexion automatique et rechargement complet au retour du réseau ;
 *  · rechargement au retour au premier plan, quel que soit le temps passé ;
 *  · filet de sécurité : relecture périodique tant que la fenêtre est visible,
 *    au cas où un évènement temps réel se serait perdu ;
 *  · propagation entre les fenêtres d'un même appareil (BroadcastChannel), pour
 *    que deux onglets ou la PWA et le navigateur restent alignés ;
 *  · présence : chaque appareil connecté s'annonce, l'autre membre de la
 *    famille voit d'où l'on est connecté.
 *
 * Résultat côté usage : parent sur Mac + iPhone, enfant sur PC + iPhone, tout
 * le monde voit la même chose dans la seconde, sans jamais recharger la page.
 */

/** Toutes les tables suivies. Ajouter une table ici suffit à la rendre vivante. */
export const LIVE_TABLES = [
  'profiles', 'settings', 'subjects', 'tasks', 'subtasks', 'routines',
  'rewards', 'redemptions', 'child_items', 'ledger', 'messages', 'moods',
  'contracts', 'badges', 'earned_badges', 'quizzes', 'quiz_attempts',
] as const;

export type SyncState = 'connecting' | 'live' | 'reconnecting' | 'offline';

type Listener = { tables: Set<string>; fire: () => void };

const listeners = new Set<Listener>();
let channel: RealtimeChannel | null = null;
let presence: RealtimeChannel | null = null;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let poller: ReturnType<typeof setInterval> | null = null;
let started = false;
let identity: { id: string; role: string; name: string } | null = null;
let detach: (() => void) | null = null;

/* --------------------------------------------------------------- état ---- */

let state: SyncState = 'connecting';
const stateWatchers = new Set<(s: SyncState) => void>();

function setState(next: SyncState) {
  if (state === next) return;
  state = next;
  stateWatchers.forEach((w) => w(next));
}

export const syncState = () => state;

/* ---------------------------------------------------------- diffusion ---- */

/** Coalesce les rafales : dix lignes modifiées d'un coup = une seule relecture. */
function debounced(fn: () => void) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn(); }, 120);
  };
}

function fanout(table: string | null) {
  listeners.forEach((l) => {
    if (!table || l.tables.has(table)) l.fire();
  });
}

let bc: BroadcastChannel | null = null;
function bus(): BroadcastChannel | null {
  if (bc || typeof BroadcastChannel === 'undefined') return bc;
  bc = new BroadcastChannel('agenda-jeanne-sync');
  bc.onmessage = (e) => {
    const table = typeof e.data?.table === 'string' ? e.data.table : null;
    fanout(table);
  };
  return bc;
}

/**
 * À appeler après une écriture locale : les autres fenêtres du même appareil
 * se rafraîchissent sans attendre l'aller-retour par le serveur.
 */
export function announceLocalChange(tables: string[]) {
  const b = bus();
  for (const t of tables) b?.postMessage({ table: t });
}

/* --------------------------------------------------------------- canal --- */

function teardown() {
  if (channel) { supabase.removeChannel(channel); channel = null; }
}

function connect() {
  teardown();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { setState('offline'); return; }

  const ch = supabase.channel('agenda-live');
  for (const table of LIVE_TABLES) {
    ch.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
      fanout(payload.table ?? table);
      bus()?.postMessage({ table: payload.table ?? table });
    });
  }

  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      retry = 0;
      setState('live');
      // Le canal a pu manquer des évènements pendant la coupure : on relit tout.
      fanout(null);
      return;
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      setState(navigator.onLine === false ? 'offline' : 'reconnecting');
      scheduleRetry();
    }
  });

  channel = ch;
}

function scheduleRetry() {
  if (retryTimer) return;
  const delay = Math.min(30000, 1000 * 2 ** Math.min(retry, 5));
  retry += 1;
  retryTimer = setTimeout(() => { retryTimer = null; connect(); }, delay);
}

/** Vérifie que le canal est vivant ; le relance sinon. Puis relit tout. */
export function resync(reconnect = false) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { setState('offline'); return; }
  const joined = channel?.state === 'joined';
  if (!joined || reconnect) {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    retry = 0;
    connect();
  }
  fanout(null);
}

/* ------------------------------------------------------------ présence --- */

export interface PresenceEntry {
  device: string;
  profile_id: string;
  role: string;
  name: string;
  kind: 'desktop' | 'mobile';
  label: string;
  emoji: string;
  at: string;
}

let presenceList: PresenceEntry[] = [];
const presenceWatchers = new Set<(l: PresenceEntry[]) => void>();

function pushPresence() {
  const list = presenceList;
  presenceWatchers.forEach((w) => w(list));
}

function connectPresence() {
  if (!identity) return;
  if (presence) { supabase.removeChannel(presence); presence = null; }

  const me: PresenceEntry = {
    device: deviceId(),
    profile_id: identity.id,
    role: identity.role,
    name: identity.name,
    kind: deviceKind(),
    label: deviceLabel(detectOS()),
    emoji: deviceEmoji(detectOS()),
    at: new Date().toISOString(),
  };

  const ch = supabase.channel('agenda-presence', { config: { presence: { key: me.device } } });
  const read = () => {
    const raw = ch.presenceState() as Record<string, any[]>;
    presenceList = Object.values(raw).flat().filter((x) => x && x.profile_id) as PresenceEntry[];
    pushPresence();
  };
  ch.on('presence', { event: 'sync' }, read);
  ch.on('presence', { event: 'join' }, read);
  ch.on('presence', { event: 'leave' }, read);
  // Le compte observateur lit la présence de tout le monde, mais ne s'y
  // annonce jamais : il regarde sans se faire voir, et sans jamais influencer
  // ce que le parent ou l'enfant voient sur leur propre écran.
  ch.subscribe((status) => { if (status === 'SUBSCRIBED' && identity?.role !== 'admin') ch.track(me); });
  presence = ch;
}

/* ------------------------------------------------------------ démarrage -- */

/** Démarré une seule fois, dès qu'un profil est connu. */
export function startSync(who: { id: string; role: string; name: string }) {
  const changed = identity?.id !== who.id;
  identity = who;
  if (changed) connectPresence();
  if (started) return;
  started = true;

  connect();

  const onVisible = () => { if (document.visibilityState === 'visible') resync(); };
  const onOnline = () => { setState('reconnecting'); resync(true); };
  const onOffline = () => setState('offline');

  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  window.addEventListener('pageshow', onVisible);

  detach = () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    window.removeEventListener('pageshow', onVisible);
  };

  // Filet de sécurité : une relecture par minute, uniquement fenêtre visible.
  poller = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (channel?.state !== 'joined') resync(true);
    else fanout(null);
  }, 60000);
}

export function stopSync() {
  started = false;
  identity = null;
  detach?.();
  detach = null;
  teardown();
  if (presence) { supabase.removeChannel(presence); presence = null; }
  if (poller) { clearInterval(poller); poller = null; }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  presenceList = [];
  pushPresence();
}

/* --------------------------------------------------------------- hooks --- */

/** Abonne un écran à des tables. `reload` est rappelé à chaque changement. */
export function subscribeTables(tables: string[], reload: () => void): () => void {
  const entry: Listener = { tables: new Set(tables), fire: debounced(reload) };
  listeners.add(entry);
  return () => { listeners.delete(entry); };
}

export function useSyncState(): SyncState {
  const [s, setS] = useState<SyncState>(state);
  useEffect(() => {
    setS(state);
    stateWatchers.add(setS);
    return () => { stateWatchers.delete(setS); };
  }, []);
  return s;
}

/** Appareils actuellement connectés, hors le nôtre. */
export function usePresence(): PresenceEntry[] {
  const [list, setList] = useState<PresenceEntry[]>(presenceList);
  useEffect(() => {
    setList(presenceList);
    presenceWatchers.add(setList);
    return () => { presenceWatchers.delete(setList); };
  }, []);
  const self = typeof window === 'undefined' ? '' : deviceId();
  return useMemo(() => list.filter((p) => p.device !== self), [list, self]);
}

/** Tous les appareils connectés, y compris le sien — vue observateur. */
export function useAllPresence(): PresenceEntry[] {
  const [list, setList] = useState<PresenceEntry[]>(presenceList);
  useEffect(() => {
    setList(presenceList);
    presenceWatchers.add(setList);
    return () => { presenceWatchers.delete(setList); };
  }, []);
  return list;
}
