import assert from "node:assert/strict";
import { test } from "node:test";

import { drain, enqueue, isNetworkFailure, parseQueue, type QueuedWrite } from "./queue";

const at = "2026-11-27T08:00:00.000Z";
const write = (over: Partial<QueuedWrite> = {}): QueuedWrite => ({
  id: "w1",
  kind: "finish",
  input: { id: "item-1", minutes: 20 },
  queuedAt: at,
  ...over,
});

test("network failures are told apart from server refusals", () => {
  assert.equal(isNetworkFailure(new TypeError("Failed to fetch")), true);
  assert.equal(isNetworkFailure(new TypeError("NetworkError when attempting to fetch resource.")), true);
  assert.equal(isNetworkFailure(new TypeError("Load failed")), true);
  assert.equal(isNetworkFailure(new Error("That item is not on your plan.")), false);
  assert.equal(isNetworkFailure("nope"), false);
});

test("enqueue keeps order and drops an exact repeat of the last write", () => {
  const one = enqueue([], write());
  const two = enqueue(one, write({ id: "w2" }));
  assert.equal(two.length, 1);
  const three = enqueue(two, write({ id: "w3", kind: "skip", input: { id: "item-1", reason: "ill" } }));
  assert.deepEqual(three.map((w) => w.id), ["w1", "w3"]);
});

test("a stored queue that is not a list of writes reads as empty", () => {
  assert.deepEqual(parseQueue(null), []);
  assert.deepEqual(parseQueue("{bad"), []);
  assert.deepEqual(parseQueue(JSON.stringify([{ kind: "finish" }])), []);
  assert.equal(parseQueue(JSON.stringify([write()])).length, 1);
});

test("drain sends in order, drops accepted and refused writes, keeps the rest after a network failure", async () => {
  const queue = [write({ id: "a" }), write({ id: "b", kind: "skip" }), write({ id: "c", kind: "start" })];
  const sent: string[] = [];
  const result = await drain(queue, async (w) => {
    sent.push(w.id);
    if (w.id === "a") return { ok: true };
    if (w.id === "b") return { ok: false, error: "That item is not on your plan." };
    throw new TypeError("Failed to fetch");
  });
  assert.deepEqual(sent, ["a", "b", "c"]);
  assert.deepEqual(result.remaining.map((w) => w.id), ["c"]);
  assert.deepEqual(result.refused, [{ write: queue[1], error: "That item is not on your plan." }]);
  assert.equal(result.sent, 1);
});

test("drain stops at the first network failure so later writes keep their order", async () => {
  const queue = [write({ id: "a" }), write({ id: "b", kind: "skip" })];
  const sent: string[] = [];
  const result = await drain(queue, async (w) => {
    sent.push(w.id);
    throw new TypeError("Failed to fetch");
  });
  assert.deepEqual(sent, ["a"]);
  assert.equal(result.remaining.length, 2);
});

test("an unexpected exception is a refusal, not a retry loop", async () => {
  const result = await drain([write()], async () => {
    throw new Error("boom");
  });
  assert.equal(result.remaining.length, 0);
  assert.equal(result.refused[0]?.error, "boom");
});
