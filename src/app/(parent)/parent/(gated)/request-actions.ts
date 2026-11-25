"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { getAuthContext } from "@/lib/auth/session";
import { decideRequest } from "@/lib/data/requests";
import { pushPending } from "@/lib/push/notify";

/**
 * One-tap answer to a learner's request (Step 5.1). `decide_request()` checks the caller is a
 * guardian of the request's household and applies the effect, so no extra guard runs first: on
 * the exit gate every round trip before the write was latency on the study device.
 */
export async function decideRequestAction(input: { id: string; decision: string; note?: string }) {
  const parsed = z
    .object({ id: z.string().uuid(), decision: z.string().trim().min(1).max(20), note: z.string().trim().max(300).optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "That answer could not be read." };

  const result = await decideRequest(parsed.data.id, parsed.data.decision, parsed.data.note || null);
  if (!result.ok) {
    if (/guardian/i.test(result.error) || /JWT|permission/i.test(result.error)) {
      return { ok: false as const, error: "Sign in with the guardian account to answer requests." };
    }
    return result;
  }

  after(async () => {
    const context = await getAuthContext().catch(() => null);
    if (context?.householdId) await pushPending(context.householdId, ["request_decided"]).catch(() => null);
  });
  revalidatePath("/parent");
  revalidatePath("/parent/live");
  return { ok: true as const, status: result.status, effectUntil: result.effectUntil };
}
