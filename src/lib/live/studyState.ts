"use client";

/**
 * What the study device is doing right now, for the heartbeat (Step 5.4). The timers and the
 * period list write here; the dock reads it every 30 seconds. Module state, not React state: the
 * heartbeat must not re-render the page.
 */
type StudyState = { timerRunning: boolean; itemId: string | null };

const state: StudyState = { timerRunning: false, itemId: null };
const sources = new Map<string, StudyState>();

/** Each source (a timer, the period list) reports its own state; any running source counts. */
export function reportStudyState(source: string, next: StudyState | null) {
  if (next) sources.set(source, next);
  else sources.delete(source);
  const running = [...sources.values()].find((entry) => entry.timerRunning);
  state.timerRunning = Boolean(running);
  state.itemId = running?.itemId ?? [...sources.values()].find((entry) => entry.itemId)?.itemId ?? null;
}

export function readStudyState(): StudyState {
  return { ...state };
}
