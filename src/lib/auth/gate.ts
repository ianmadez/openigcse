import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "openigcse_parent";
const TTL_MS = 8 * 60 * 60 * 1000;

/**
 * The gate cookie is a signed expiry, not a bare flag. A flag would let anyone
 * on the device paste `openigcse_parent=1` into the console and walk into the
 * parent area, which would make the PIN and its lockout decorative.
 */
function secret() {
  return (
    process.env.PARENT_GATE_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.PARENT_MASTER_PIN ??
    "openigcse-local-gate"
  );
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export { COOKIE as PARENT_GATE_COOKIE };

export function createGateToken() {
  const expiresAt = Date.now() + TTL_MS;
  const payload = `v1.${expiresAt}`;
  return { value: `${payload}.${sign(payload)}`, expiresAt };
}

export function gateTokenIsValid(token: string | undefined) {
  if (!token) return false;

  const [version, expiresAt, signature] = token.split(".");
  if (version !== "v1" || !expiresAt || !signature) return false;

  const payload = `${version}.${expiresAt}`;
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);

  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;

  return Number(expiresAt) > Date.now();
}

export { TTL_MS as PARENT_GATE_TTL_MS };
