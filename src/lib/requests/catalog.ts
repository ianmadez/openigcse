/**
 * Structured requests (Step 5.1). One entry per type: what the learner asks, the parent's
 * one-tap answers, and whether each answer approves. `request_decision_outcome()` in
 * `20261125000001_phase5_requests.sql` is the authority; `catalog.test.ts` pins this twin to it.
 */

export const REQUEST_TYPES = ["stuck", "break", "more_time", "swap", "unlock", "check_work", "day_off"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];
export type RequestStatus = "pending" | "approved" | "declined" | "expired";

export type Decision = { value: string; label: string; approves: boolean };

export type RequestSpec = {
  type: RequestType;
  label: string;
  /** Shown to the learner on the ask button. */
  ask: string;
  /** Example placeholder for the optional note. */
  placeholder: string;
  decisions: Decision[];
  /** Asks that only make sense from a specific screen are hidden from the general menu. */
  contextual: boolean;
};

export const REQUESTS: Record<RequestType, RequestSpec> = {
  stuck: {
    type: "stuck",
    label: "Stuck",
    ask: "I'm stuck",
    placeholder: "What are you stuck on?",
    decisions: [
      { value: "coming", label: "I'm coming", approves: true },
      { value: "hint", label: "Try the hint", approves: true },
      { value: "skip", label: "Skip it today", approves: true },
    ],
    contextual: false,
  },
  break: {
    type: "break",
    label: "Break",
    ask: "Can I take a break?",
    placeholder: "Anything your parent should know?",
    decisions: [
      { value: "5", label: "5 min", approves: true },
      { value: "10", label: "10 min", approves: true },
      { value: "15", label: "15 min", approves: true },
      { value: "not_now", label: "Not now", approves: false },
    ],
    contextual: false,
  },
  more_time: {
    type: "more_time",
    label: "More time",
    ask: "I need more time",
    placeholder: "Why do you need more time?",
    decisions: [
      { value: "approve", label: "Approve", approves: true },
      { value: "decline", label: "Decline", approves: false },
    ],
    contextual: true,
  },
  swap: {
    type: "swap",
    label: "Swap periods",
    ask: "Can I swap two periods?",
    placeholder: "Why swap?",
    decisions: [
      { value: "approve", label: "Approve", approves: true },
      { value: "decline", label: "Decline", approves: false },
    ],
    contextual: false,
  },
  unlock: {
    type: "unlock",
    label: "Unlock",
    ask: "I need the browser for research",
    placeholder: "What do you need to look up?",
    decisions: [
      { value: "15", label: "15 min", approves: true },
      { value: "30", label: "30 min", approves: true },
      { value: "decline", label: "Decline", approves: false },
    ],
    contextual: false,
  },
  check_work: {
    type: "check_work",
    label: "Check my work",
    ask: "Please check my work",
    placeholder: "Which page or task?",
    decisions: [{ value: "reviewing", label: "Open evidence review", approves: true }],
    contextual: false,
  },
  day_off: {
    type: "day_off",
    label: "Day off",
    ask: "I'm feeling unwell",
    placeholder: "How are you feeling?",
    decisions: [
      { value: "approve", label: "Approve", approves: true },
      { value: "call_me", label: "Call me", approves: false },
    ],
    contextual: false,
  },
};

export function isRequestType(value: string): value is RequestType {
  return (REQUEST_TYPES as readonly string[]).includes(value);
}

/** The status an answer leads to, or null when the answer does not fit the type. */
export function outcomeOf(type: RequestType, decision: string): "approved" | "declined" | null {
  const match = REQUESTS[type].decisions.find((entry) => entry.value === decision);
  if (!match) return null;
  return match.approves ? "approved" : "declined";
}

export function decisionLabel(type: string, decision: string | null) {
  if (!decision || !isRequestType(type)) return null;
  return REQUESTS[type].decisions.find((entry) => entry.value === decision)?.label ?? decision;
}

/** Whole seconds left on a timed effect (a break or an unlock), never negative. */
export function secondsUntil(until: string | null, now: Date = new Date()) {
  if (!until) return 0;
  return Math.max(0, Math.ceil((Date.parse(until) - now.getTime()) / 1000));
}

/** A pending ask goes stale after four hours (`expire_stale_requests()`). */
export const REQUEST_TTL_MS = 4 * 60 * 60 * 1000;
