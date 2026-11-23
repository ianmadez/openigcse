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

export function todayIso(now: Date = new Date()) {
  return now.toISOString().slice(0, 10);
}
