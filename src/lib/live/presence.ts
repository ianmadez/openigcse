/**
 * Online means a heartbeat within the last 90 seconds (three missed 30-second beats).
 * Pure so the parent screen and its tests agree.
 */
export const HEARTBEAT_MS = 30_000;
export const OFFLINE_AFTER_MS = 90_000;

export function isOnline(lastHeartbeatAt: string | null, now: Date = new Date()) {
  if (!lastHeartbeatAt) return false;
  return now.getTime() - Date.parse(lastHeartbeatAt) < OFFLINE_AFTER_MS;
}

/** Whole minutes idle, or null when not idle. */
export function idleMinutes(idleSince: string | null, now: Date = new Date()) {
  if (!idleSince) return null;
  return Math.max(0, Math.floor((now.getTime() - Date.parse(idleSince)) / 60_000));
}

export function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export type LockState = { locked: boolean; until: string | null };

/**
 * The focus lock as the device should honour it. A timed unlock (is_locked false with an end) that
 * has run out reads as locked again, without anyone having to write the row back.
 */
export function lockStateOf(isLocked: boolean, lockEndsAt: string | null, now: Date = new Date()): LockState {
  if (isLocked) return { locked: true, until: null };
  if (lockEndsAt && Date.parse(lockEndsAt) <= now.getTime()) return { locked: true, until: null };
  return { locked: false, until: lockEndsAt };
}

/** Minutes since local midnight in a household's time zone. */
export function localMinutes(now: Date, timeZone: string | null) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone || "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

/** The period running at `minutes`, from one day's slots. */
export function currentPeriodOf<T extends { startMinutes: number; endMinutes: number }>(slots: T[], minutes: number): T | null {
  return slots.find((slot) => minutes >= slot.startMinutes && minutes < slot.endMinutes) ?? null;
}
