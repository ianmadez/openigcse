import { cookies } from "next/headers";

import { gateTokenIsValid, PARENT_GATE_COOKIE } from "@/lib/auth/gate";
import { getAuthContext } from "@/lib/auth/session";
import { resolveActiveHousehold, type ActiveHousehold } from "@/lib/data/household";

/**
 * Who may write parent-owned rows.
 *
 * A signed-in guardian is authoritative. A device that unlocked with the PIN
 * has no session, so the signed gate cookie stands in for it — that is the
 * single-device install this app started as. A paired student device holds a
 * real JWT but must never pass this check.
 */
export async function authorizeGuardian(): Promise<ActiveHousehold | null> {
  const context = await getAuthContext();

  if (context?.role === "parent_educator" || context?.role === "developer_admin") {
    return resolveActiveHousehold();
  }

  const store = await cookies();
  if (gateTokenIsValid(store.get(PARENT_GATE_COOKIE)?.value)) {
    return resolveActiveHousehold();
  }

  return null;
}
