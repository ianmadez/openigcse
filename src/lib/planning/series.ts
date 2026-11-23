import { examSeriesMonths } from "@/lib/config/site";

const MONTH_INDEX: Record<string, number> = { March: 3, June: 6, November: 11 };

/**
 * Weeks until an exam series such as "June 2028". Cambridge publishes the exact
 * timetable per zone, which this app does not fetch, so the countdown runs to
 * the first day of the series month and the UI labels it that way.
 */
export function seriesCountdown(
  label: string | null,
  now: Date = new Date(),
): { monthStart: string; weeks: number; passed: boolean } | null {
  const match = /^(\w+)\s+(\d{4})$/.exec((label ?? "").trim());
  if (!match) return null;

  const [, month, year] = match;
  if (!month || !year || !(examSeriesMonths as readonly string[]).includes(month)) return null;

  const monthNumber = MONTH_INDEX[month]!;
  const monthStart = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const days = (Date.parse(`${monthStart}T00:00:00Z`) - now.getTime()) / 86_400_000;

  return days <= 0
    ? { monthStart, weeks: 0, passed: true }
    : { monthStart, weeks: Math.floor(days / 7), passed: false };
}
