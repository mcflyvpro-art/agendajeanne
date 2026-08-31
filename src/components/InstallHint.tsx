'use client';
import { useEffect, useState } from 'react';
import { useDevice } from '@/lib/device';

/**
 * Installation en application de bureau.
 *
 * Chrome et Edge proposent l'installation par un évènement qu'on capte ici ;
 * Safari sur macOS n'a pas d'équivalent, on y explique le geste (Fichier →
 * Ajouter au Dock), qui est aussi ce qui débloque les notifications.
 */
export default function InstallHint() {
  const { desktop, mac, standalone, hydrating } = useDevice();
  const [prompt, setPrompt] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);
  const [safari, setSafari] = useState(false);

  useEffect(() => {
    const onPrompt = (e: any) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    const ua = navigator.userAgent;
    setSafari(/safari/i.test(ua) && !/chrome|chromium|edg\//i.test(ua));
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (hydrating || !desktop || standalone || dismissed) return null;
  if (!prompt && !safari) return null;

  if (prompt) {
    return (
      <button onClick={async () => { prompt.prompt(); await prompt.userChoice; setPrompt(null); }}
              className="btn-grape w-full !py-2.5 text-sm">
        ⬇️ Installer l’app
      </button>
    );
  }

  return (
    <div className="rounded-2xl bg-soft px-3 py-2 text-[11px] font-bold leading-relaxed text-muted">
      <p className="text-ink">Installer sur {mac ? 'le Mac' : 'cet ordinateur'}</p>
      <p>Fichier → « Ajouter au Dock », puis ouvrir depuis le Dock pour recevoir les rappels.</p>
      <button onClick={() => setDismissed(true)} className="mt-1 font-black text-grape">Ne plus afficher</button>
    </div>
  );
}
