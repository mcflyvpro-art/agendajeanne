'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { startSync, stopSync, subscribeTables, resync } from '@/lib/sync';
import { isDesktopDevice } from '@/lib/device';
import type { Profile, Settings, Subject } from '@/lib/types';

interface Ctx {
  session: Session | null;
  profile: Profile | null;
  child: Profile | null;
  settings: Settings | null;
  subjects: Subject[];
  /** Faux tant que la session ET le profil ne sont pas résolus. */
  ready: boolean;
  loadError: string | null;
  isParent: boolean;
  refresh: () => Promise<void>;
  refreshChild: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

/**
 * Au-delà de ce délai en arrière-plan, la session parent est fermée.
 * Sur ordinateur, changer de fenêtre est le geste le plus banal qui soit :
 * fermer la session au bout de cinq minutes y rendrait l'app inutilisable.
 */
const PARENT_IDLE_MS = () => (isDesktopDevice() ? 60 * 60 * 1000 : 5 * 60 * 1000);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [child, setChild] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadAll = useCallback(async (uid: string) => {
    try {
      const [p, s, subj] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
        supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('subjects').select('*').eq('active', true).order('position'),
      ]);

      // Une erreur ici laissait l'app tourner en boucle sur un écran de
      // chargement : on la remonte pour pouvoir l'afficher.
      const err = p.error ?? s.error ?? subj.error;
      if (err) { setLoadError(err.message); return; }
      if (!p.data) { setLoadError('Aucun profil associé à ce compte.'); return; }

      setLoadError(null);
      setProfile(p.data as Profile);
      setSettings((s.data as Settings) ?? null);
      setSubjects((subj.data as Subject[]) ?? []);

      const me = p.data as Profile;
      if (me.role === 'child') {
        setChild(me);
      } else {
        const childId = (s.data as Settings | null)?.child_id;
        const c = childId
          ? await supabase.from('profiles').select('*').eq('id', childId).maybeSingle()
          : await supabase.from('profiles').select('*').eq('role', 'child').limit(1).maybeSingle();
        setChild((c.data as Profile) ?? null);
      }
    } catch (e: any) {
      setLoadError(e?.message ?? 'Connexion impossible');
    }
  }, []);

  const refresh = useCallback(async () => {
    if (session?.user?.id) await loadAll(session.user.id);
  }, [session?.user?.id, loadAll]);

  const refreshChild = useCallback(async () => {
    if (!child) return;
    const c = await supabase.from('profiles').select('*').eq('id', child.id).maybeSingle();
    if (c.data) {
      setChild(c.data as Profile);
      setProfile((p) => (p && p.id === c.data!.id ? (c.data as Profile) : p));
    }
  }, [child?.id]);

  /**
   * Amorçage. `ready` ne passe à vrai qu'une fois le profil résolu : sans ça,
   * un instant existe où la session est posée mais le profil pas encore, et
   * les écrans redirigent alors vers la mauvaise interface.
   */
  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (data.session?.user?.id) await loadAll(data.session.user.id);
      if (alive) setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (!alive) return;
      if (event === 'TOKEN_REFRESHED') { setSession(s); return; }

      setReady(false);
      setSession(s);
      if (s?.user?.id) await loadAll(s.user.id);
      else { setProfile(null); setChild(null); setLoadError(null); }
      if (alive) setReady(true);
    });

    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [loadAll]);

  /**
   * Synchronisation. Un seul canal pour toute l'app (`lib/sync`) : il gère la
   * reconnexion, la relecture au réveil de l'appareil, la propagation entre
   * fenêtres et la présence. Profil, réglages et matières se rechargent dès
   * qu'un autre appareil les modifie — Mac, PC ou téléphone.
   */
  useEffect(() => {
    if (!profile) return;
    startSync({ id: profile.id, role: profile.role, name: profile.display_name });
  }, [profile?.id, profile?.role, profile?.display_name]);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    return subscribeTables(['profiles', 'settings', 'subjects'], () => loadAll(uid));
  }, [session?.user?.id, loadAll]);

  /**
   * Retour au premier plan : on rafraîchit la session avant tout le reste.
   * Un jeton périmé pendant la nuit ferait échouer toutes les requêtes en
   * silence, et l'app semblerait « bloquée » sur des données de la veille.
   */
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    const wake = async () => {
      if (document.visibilityState !== 'visible') return;
      const { data } = await supabase.auth.getSession();
      if (data.session) setSession(data.session);
      await loadAll(uid);
      resync();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', wake);
    };
  }, [session?.user?.id, loadAll]);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  /**
   * Le compte parent ne reste pas connecté indéfiniment (il valide de l'argent
   * de poche). Mais fermer la session au moindre passage en arrière-plan rendait
   * l'app inutilisable : l'autofill du mot de passe suffisait à déconnecter.
   * On ne ferme donc qu'après une absence prolongée.
   */
  const hiddenAt = useRef<number | null>(null);
  useEffect(() => {
    if (!ready || profile?.role !== 'parent') return;
    const onChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current && Date.now() - hiddenAt.current > PARENT_IDLE_MS()) {
        hiddenAt.current = null;
        supabase.auth.signOut({ scope: 'local' });
      } else {
        hiddenAt.current = null;
      }
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, [ready, profile?.role]);

  const signOut = useCallback(async () => {
    stopSync();
    await supabase.auth.signOut();
    location.href = '/login';
  }, []);

  return (
    <AppCtx.Provider value={{
      session, profile, child, settings, subjects, ready, loadError,
      isParent: profile?.role === 'parent', refresh, refreshChild, signOut,
    }}>
      {children}
    </AppCtx.Provider>
  );
}
