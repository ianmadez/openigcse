/**
 * Quiet hours (Step 5.3): a household-local window, possibly across midnight, when pushes are held.
 * `start`/`end` are "HH:MM" or "HH:MM:SS"; either missing means no quiet hours.
 */
export function inQuietHours(now: Date, timeZone: string | null, start: string | null, end: string | null) {
  if (!start || !end) return false;
  const toMinutes = (value: string) => {
    const [h, m] = value.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (from === to) return false;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone || "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const local = hour * 60 + minute;

  return from < to ? local >= from && local < to : local >= from || local < to;
}
