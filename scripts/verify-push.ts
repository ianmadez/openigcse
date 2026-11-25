/**
 * Web Push delivery (Step 5.3) end to end, without a phone: a throwaway household's guardian
 * registers a subscription whose endpoint is a local HTTP server, the learner raises a request,
 * and `pushPending()` must deliver an encrypted payload that decrypts to the request's
 * notification. Quiet hours must hold it.
 *
 *   pnpm verify:push
 */
import { createECDH, createHmac, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

import { loadEnv } from "./lib/env";

loadEnv();
// web-push only speaks HTTPS; the stand-in endpoint uses a throwaway self-signed certificate,
// trusted by this probe process only.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const TAG = `push-probe-${Date.now()}`;
const PASSWORD = `${randomUUID()}Aa1!`;
const created = { households: [] as string[], users: [] as string[] };
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${!ok && detail ? ` - ${detail}` : ""}`);
};

// RFC 8291 decryption (aes128gcm), so the probe reads exactly what a browser would.
function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number) {
  const prk = createHmac("sha256", salt).update(ikm).digest();
  return createHmac("sha256", prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, length);
}
function decrypt(body: Buffer, receiver: ReturnType<typeof createECDH>, authSecret: Buffer) {
  const salt = body.subarray(0, 16);
  const idLength = body.readUInt8(20);
  const senderKey = body.subarray(21, 21 + idLength);
  const ciphertext = body.subarray(21 + idLength);
  const shared = receiver.computeSecret(senderKey);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), receiver.getPublicKey(), senderKey]);
  const ikm = hkdf(authSecret, shared, keyInfo, 32);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()]);
  const end = plain.lastIndexOf(2);
  return plain.subarray(0, end).toString("utf8");
}

async function person(householdId: string, role: string, label: string) {
  const email = `${TAG}-${label}@example.com`;
  const { data: user } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  created.users.push(user.user!.id);
  const { data: profile } = await admin
    .from("profiles")
    .insert({ household_id: householdId, display_name: `${TAG} ${label}`, role, auth_user_id: user.user!.id })
    .select("id")
    .single();
  const client = createClient(url, anon, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  return { client, profileId: profile!.id as string };
}

async function run() {
  const received: Array<{ body: Buffer; headers: Record<string, unknown> }> = [];
  const dir = mkdtempSync(join(tmpdir(), "push-probe-"));
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=127.0.0.1",
    "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"),
  ], { stdio: "ignore" });
  const tls = { key: readFileSync(join(dir, "key.pem")), cert: readFileSync(join(dir, "cert.pem")) };
  const server = createServer(tls, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      received.push({ body: Buffer.concat(chunks), headers: req.headers });
      res.writeHead(201).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;

  try {
    const { data: household } = await admin.from("households").insert({ name: TAG, timezone: "UTC" }).select("id").single();
    created.households.push(household!.id);
    const guardian = await person(household!.id, "parent_educator", "guardian");
    const learner = await person(household!.id, "student", "learner");

    const receiver = createECDH("prime256v1");
    receiver.generateKeys();
    const authSecret = randomBytes(16);
    const { error: subError } = await guardian.client.from("push_subscriptions").insert({
      household_id: household!.id,
      profile_id: guardian.profileId,
      endpoint: `https://127.0.0.1:${port}/push/${TAG}`,
      p256dh: receiver.getPublicKey().toString("base64url"),
      auth_secret: authSecret.toString("base64url"),
    });
    check("guardian registers a subscription", !subError, subError?.message);

    // Imported here so the env is loaded first; the module is server-only.
    const { pushPending } = await import("../src/lib/push/notify");

    const { error: askError } = await learner.client
      .from("requests")
      .insert({ household_id: household!.id, student_id: learner.profileId, request_type: "break", student_note: "ten please" });
    check("learner raises a break", !askError, askError?.message);
    const first = await pushPending(household!.id, ["request"]);
    check("one push is sent", first.sent === 1, JSON.stringify(first));
    const payload = received[0] ? JSON.parse(decrypt(received[0].body, receiver, authSecret)) : null;
    check("it decrypts to the request notification", payload?.body === "ten please" && /Break/.test(payload?.title), JSON.stringify(payload));
    check("it is sent urgent with a TTL", received[0]?.headers.urgency === "high" && Boolean(received[0]?.headers.ttl));
    const again = await pushPending(household!.id, ["request"]);
    check("a notification is pushed once", again.sent === 0 && received.length === 1, JSON.stringify(again));

    // Quiet hours: a window that covers now holds the push.
    const hour = new Date().getUTCHours();
    await admin
      .from("households")
      .update({ quiet_hours_start: `${String(hour).padStart(2, "0")}:00`, quiet_hours_end: `${String((hour + 2) % 24).padStart(2, "0")}:00` })
      .eq("id", household!.id);
    await learner.client
      .from("requests")
      .insert({ household_id: household!.id, student_id: learner.profileId, request_type: "unlock", student_note: "research" });
    const quiet = await pushPending(household!.id, ["request"]);
    check("quiet hours hold the push", quiet.sent === 0 && received.length === 1, JSON.stringify(quiet));
    const { data: held } = await guardian.client.from("notifications").select("id, read_at").eq("kind", "request");
    check("the held notification is still in the in-app centre", (held ?? []).length === 2);
  } finally {
    server.close();
  }
}

run()
  .catch((error) => check("probe ran to the end", false, (error as Error).message))
  .finally(async () => {
    for (const id of created.households) await admin.from("households").delete().eq("id", id);
    for (const id of created.users) await admin.auth.admin.deleteUser(id);
    console.log(failed ? `\n${failed} check(s) failed` : "\nall push checks passed");
    if (failed) process.exitCode = 1;
    process.exit();
  });
