const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function dayKey(text: string | undefined): number | null {
  if (!text) return null;
  const match = /^(\d{1,2})-(\d{1,2})$/.exec(text.trim());
  if (!match) return null;
  const month = Number(match[1]), day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]) return null;
  return month * 100 + day;
}

// Both ends are included. A season may run over New Year.
export function inSeason(from: string | undefined, until: string | undefined, now: Date = new Date()): boolean {
  const start = dayKey(from), end = dayKey(until);
  if (start === null && end === null) return true;
  const first = start ?? 101, last = end ?? 1231;
  const today = (now.getMonth() + 1) * 100 + now.getDate();
  return first <= last ? today >= first && today <= last : today >= first || today <= last;
}
