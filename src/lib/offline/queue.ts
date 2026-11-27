/**
 * The offline write queue (Step 7.3). When /today loses its connection, Start, Finish, Skip and
 * study time are held on the device and sent, in order, when it returns. Only a
 * network failure queues a write: if Postgres refuses one, the learner is told, never retried.
 */

export type QueuedKind = "start" | "finish" | "skip" | "logTime";

export type QueuedWrite = {
  id: string;
  kind: QueuedKind;
  input: Record<string, unknown>;
  /** When the learner pressed the button, so a replay keeps the real time. */
  queuedAt: string;
};

export type SendResult = { ok: true } | { ok: false; error: string };

const KINDS: QueuedKind[] = ["start", "finish", "skip", "logTime"];

/** fetch rejects with a TypeError when there is no network; each browser words it differently. */
export function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  return /failed to fetch|networkerror|load failed|network request failed/i.test(error.message);
}

const same = (a: QueuedWrite, b: QueuedWrite) => a.kind === b.kind && JSON.stringify(a.input) === JSON.stringify(b.input);

/** Appends a write unless it repeats the last one exactly (a double tap while offline). */
export function enqueue(queue: QueuedWrite[], write: QueuedWrite): QueuedWrite[] {
  const last = queue.at(-1);
  return last && same(last, write) ? queue : [...queue, write];
}

export function parseQueue(raw: string | null): QueuedWrite[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (w): w is QueuedWrite =>
        typeof w === "object" &&
        w !== null &&
        typeof w.id === "string" &&
        KINDS.includes(w.kind) &&
        typeof w.input === "object" &&
        w.input !== null &&
        typeof w.queuedAt === "string",
    );
  } catch {
    return [];
  }
}

export type DrainResult = {
  remaining: QueuedWrite[];
  refused: Array<{ write: QueuedWrite; error: string }>;
  sent: number;
};

/** Sends writes oldest first; stops at the first network failure and keeps the rest in order. */
export async function drain(queue: QueuedWrite[], send: (write: QueuedWrite) => Promise<SendResult>): Promise<DrainResult> {
  const refused: DrainResult["refused"] = [];
  let sent = 0;
  for (let index = 0; index < queue.length; index += 1) {
    const write = queue[index]!;
    try {
      const result = await send(write);
      if (result.ok) sent += 1;
      else refused.push({ write, error: result.error });
    } catch (error) {
      if (isNetworkFailure(error)) return { remaining: queue.slice(index), refused, sent };
      refused.push({ write, error: error instanceof Error ? error.message : "The write failed." });
    }
  }
  return { remaining: [], refused, sent };
}
