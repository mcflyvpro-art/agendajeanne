'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, Settings, Subject } from '@/lib/types';

interface Ctx {
  session: Session | null;
  profile: Profile | null;
  child: Profile | null;
  settings: Settings | null;
  subjects: Subject[];
  loading: boolean;
  isParent: boolean;
  refresh: () => Promise<void>;
  refreshChild: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [child, setChild] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async (uid: string) => {
    const [p, s, subj] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('subjects').select('*').eq('active', true).order('position'),
    ]);
    setProfile((p.data as Profile) ?? null);
    setSettings((s.data as Settings) ?? null);
    setSubjects((subj.data as Subject[]) ?? []);

    const childId = (s.data as Settings | null)?.child_id;
    if ((p.data as Profile)?.role === 'child') {
      setChild(p.data as Profile);
    } else if (childId) {
      const c = await supabase.from('profiles').select('*').eq('id', childId).maybeSingle();
      setChild((c.data as Profile) ?? null);
    } else {
      const c = await supabase.from('profiles').select('*').eq('role', 'child').limit(1).maybeSingle();
      setChild((c.data as Profile) ?? null);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (session?.user?.id) await loadAll(session.user.id);
  }, [session, loadAll]);

  const refreshChild = useCallback(async () => {
    if (!child) return;
    const c = await supabase.from('profiles').select('*').eq('id', child.id).maybeSingle();
    if (c.data) {
      setChild(c.data as Profile);
      if (profile?.id === child.id) setProfile(c.data as Profile);
    }
  }, [child, profile]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session?.user?.id) await loadAll(data.session.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      if (s?.user?.id) await loadAll(s.user.id);
      else { setProfile(null); setChild(null); }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadAll]);

  /**
   * Synchronisation permanente des profils et des réglages.
   * Le solde, la série, le niveau et le barème changent depuis l'autre
   * appareil : sans cet abonnement il fallait recharger la page pour les voir.
   */
  useEffect(() => {
    if (!session) return;
    const applyProfile = (row: Profile) => {
      setProfile((p) => (p && p.id === row.id ? { ...p, ...row } : p));
      setChild((c) => (c && c.id === row.id ? { ...c, ...row } : c));
    };
    const ch = supabase
      .channel('app-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' },
        (payload) => { if (payload.new && (payload.new as Profile).id) applyProfile(payload.new as Profile); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' },
        (payload) => { if (payload.new) setSettings(payload.new as Settings); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [session?.user?.id]);

  /**
   * Filet de sécurité : au retour dans l'app (déverrouillage, changement
   * d'onglet, reprise réseau), on resynchronise. Le temps réel peut avoir
   * manqué des événements pendant la mise en veille de l'appareil.
   */
  useEffect(() => {
    if (!session?.user?.id) return;
    const resync = () => {
      if (document.visibilityState === 'visible') loadAll(session.user.id);
    };
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('online', resync);
    return () => {
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('online', resync);
    };
  }, [session?.user?.id, loadAll]);

  // Enregistrement du service worker (indispensable aux notifications iOS)
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  /**
   * Le parent doit se reconnecter à chaque utilisation (il valide de l'argent
   * de poche et des récompenses). L'enfant, elle, reste connectée à vie —
   * comportement par défaut de Supabase, rien à faire de ce côté.
   */
  useEffect(() => {
    if (profile?.role !== 'parent') return;
    const onHide = () => {
      if (document.visibilityState === 'hidden') supabase.auth.signOut({ scope: 'local' });
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [profile?.role]);

  const signOut = useCallback(async () => { await supabase.auth.signOut(); location.href = '/login'; }, []);

  return (
    <AppCtx.Provider value={{
      session, profile, child, settings, subjects, loading,
      isParent: profile?.role === 'parent', refresh, refreshChild, signOut,
    }}>
      {children}
    </AppCtx.Provider>
  );
}
