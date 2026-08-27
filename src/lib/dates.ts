export const TZ = 'Europe/Paris';

/** Date « YYYY-MM-DD » dans le fuseau de la famille. */
export function todayISO(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Minutes écoulées depuis minuit, dans le fuseau de la famille. */
export function nowMinutes(d: Date = new Date()): number {
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const h = Number(p.find((x) => x.type === 'hour')?.value ?? 0);
  const m = Number(p.find((x) => x.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

export function dowOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Lundi de la semaine contenant `iso`. */
export function weekStart(iso: string): string {
  const dow = dowOf(iso);
  return addDaysISO(iso, dow === 0 ? -6 : 1 - dow);
}

export function toMinutes(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(m: number): string {
  const h = Math.floor(((m % 1440) + 1440) % 1440 / 60);
  const mm = ((m % 60) + 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function hhmm(t: string | null): string {
  return t ? t.slice(0, 5) : '';
}

export function humanDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const DAYS_SHORT = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export const dayName = (iso: string) => DAYS[dowOf(iso)];
export const dayShort = (n: number) => DAYS_SHORT[n];

export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${DAYS[dowOf(iso)]} ${d} ${MONTHS[m - 1]}`;
}

export function relativeDay(iso: string): string {
  const t = todayISO();
  if (iso === t) return "aujourd'hui";
  if (iso === addDaysISO(t, 1)) return 'demain';
  if (iso === addDaysISO(t, -1)) return 'hier';
  return longDate(iso);
}
