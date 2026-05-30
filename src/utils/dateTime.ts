/**
 * Shared date/time formatting utilities
 */

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function getClockStr(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function getDateStr(): string {
  const d = new Date();
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

export function formatDate(d: Date): string {
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}

export function getTimeStr(d: Date = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Matches WelcomeScreen / AppHeader — e.g. "19 Feb 2026" */
const HEADER_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export function formatHeaderDate(d: Date = new Date()): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = HEADER_MONTHS[d.getMonth()];
  return `${day} ${month} ${d.getFullYear()}`;
}

export function formatHeaderTime(d: Date = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
