const DAY = 24 * 60 * 60 * 1000;

/** Days between an ISO date and today, floored, never negative. */
export function daysUntil(date: string, now: Date = new Date()) {
  const target = new Date(`${date.slice(0, 10)}T00:00:00Z`).getTime();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.round((target - today) / DAY));
}

export function isoDate(offsetDays: number, now: Date = new Date()) {
  return new Date(now.getTime() + offsetDays * DAY).toISOString().slice(0, 10);
}

/**
 * Today's date as YYYY-MM-DD in the household's timezone. Without a usable timezone it falls
 * back to UTC, which is wrong for part of every day east or west of Greenwich.
 */
export function todayIso(now: Date = new Date(), timeZone?: string | null) {
  if (timeZone) {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    } catch {
      // Unknown zone: fall through to UTC.
    }
  }
  return now.toISOString().slice(0, 10);
}

/** "today", "tomorrow", "in 3 days", or "2 days ago" for a whole-day difference. */
export function relativeDays(days: number) {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
