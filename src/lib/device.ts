'use client';
import { useEffect, useState } from 'react';

/**
 * Reconnaissance de l'appareil.
 *
 * Elle sert à une règle de fond de l'app : sur un ordinateur, quitter la
 * fenêtre ne met pas le minuteur en pause (l'enfant travaille sur son cahier,
 * change de fenêtre, ouvre le manuel…), alors que sur un téléphone, sortir de
 * l'app veut dire qu'elle a arrêté de travailler.
 *
 * La détection est volontairement prudente et peut être forcée à la main
 * depuis « Moi → Cet appareil » si jamais elle se trompe.
 */

export type DeviceKind = 'desktop' | 'mobile';
export type DeviceOS = 'mac' | 'windows' | 'ios' | 'android' | 'linux' | 'autre';

const OVERRIDE_KEY = 'agenda-device-kind';
const ID_KEY = 'agenda-device-id';

function ua(): string {
  return typeof navigator === 'undefined' ? '' : navigator.userAgent;
}

export function detectOS(): DeviceOS {
  const u = ua();
  if (/iphone|ipod/i.test(u)) return 'ios';
  if (/ipad/i.test(u)) return 'ios';
  // iPadOS se fait passer pour un Mac : seul l'écran tactile le trahit.
  if (/macintosh/i.test(u)) return (navigator.maxTouchPoints ?? 0) > 1 ? 'ios' : 'mac';
  if (/android/i.test(u)) return 'android';
  if (/windows/i.test(u)) return 'windows';
  if (/linux|x11|cros/i.test(u)) return 'linux';
  return 'autre';
}

/** Détection brute, sans tenir compte du forçage manuel. */
export function detectKind(): DeviceKind {
  if (typeof window === 'undefined') return 'mobile';

  const data = (navigator as any).userAgentData;
  if (data && typeof data.mobile === 'boolean') return data.mobile ? 'mobile' : 'desktop';

  const os = detectOS();
  if (os === 'ios' || os === 'android') return 'mobile';
  if (os === 'mac' || os === 'windows' || os === 'linux') return 'desktop';

  // Dernier recours : un vrai pointeur et pas d'écran tactile principal.
  const fine = window.matchMedia?.('(pointer: fine)').matches ?? false;
  const coarse = window.matchMedia?.('(any-pointer: coarse)').matches ?? false;
  return fine && !coarse ? 'desktop' : 'mobile';
}

export function deviceOverride(): DeviceKind | null {
  if (typeof localStorage === 'undefined') return null;
  const v = localStorage.getItem(OVERRIDE_KEY);
  return v === 'desktop' || v === 'mobile' ? v : null;
}

export function setDeviceOverride(kind: DeviceKind | null) {
  if (typeof localStorage === 'undefined') return;
  if (kind) localStorage.setItem(OVERRIDE_KEY, kind);
  else localStorage.removeItem(OVERRIDE_KEY);
  window.dispatchEvent(new Event('agenda-device-change'));
}

/** Verdict final : forçage manuel s'il existe, sinon détection. */
export function deviceKind(): DeviceKind {
  return deviceOverride() ?? detectKind();
}

export const isDesktopDevice = () => deviceKind() === 'desktop';

/** Identifiant stable de cet appareil : sert à savoir qui pilote le minuteur. */
export function deviceId(): string {
  if (typeof localStorage === 'undefined') return 'inconnu';
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = `${detectOS()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.matchMedia?.('(display-mode: window-controls-overlay)').matches
    || (navigator as any).standalone === true;
}

const OS_LABEL: Record<DeviceOS, string> = {
  mac: 'Mac', windows: 'PC Windows', ios: 'iPhone', android: 'Android', linux: 'Ordinateur', autre: 'Appareil',
};
const OS_EMOJI: Record<DeviceOS, string> = {
  mac: '🖥️', windows: '💻', ios: '📱', android: '📱', linux: '💻', autre: '🖥️',
};

export function deviceLabel(os: DeviceOS = detectOS()): string { return OS_LABEL[os]; }
export function deviceEmoji(os: DeviceOS = detectOS()): string { return OS_EMOJI[os]; }

export interface DeviceInfo {
  kind: DeviceKind;
  os: DeviceOS;
  desktop: boolean;
  mac: boolean;
  standalone: boolean;
  label: string;
  emoji: string;
  /** Vrai tant que le rendu serveur n'a pas été rejoint par le navigateur. */
  hydrating: boolean;
}

const SERVER: DeviceInfo = {
  kind: 'mobile', os: 'autre', desktop: false, mac: false, standalone: false,
  label: 'Appareil', emoji: '📱', hydrating: true,
};

function read(): DeviceInfo {
  const os = detectOS();
  const kind = deviceKind();
  return {
    kind, os,
    desktop: kind === 'desktop',
    mac: os === 'mac',
    standalone: isStandalone(),
    label: OS_LABEL[os],
    emoji: OS_EMOJI[os],
    hydrating: false,
  };
}

/**
 * Hook d'appareil. Le premier rendu reste identique au rendu serveur pour ne
 * pas casser l'hydratation ; la valeur réelle arrive juste après.
 */
export function useDevice(): DeviceInfo {
  const [info, setInfo] = useState<DeviceInfo>(SERVER);

  useEffect(() => {
    const sync = () => setInfo(read());
    sync();
    window.addEventListener('agenda-device-change', sync);
    const mq = window.matchMedia?.('(display-mode: standalone)');
    mq?.addEventListener?.('change', sync);
    return () => {
      window.removeEventListener('agenda-device-change', sync);
      mq?.removeEventListener?.('change', sync);
    };
  }, []);

  return info;
}
