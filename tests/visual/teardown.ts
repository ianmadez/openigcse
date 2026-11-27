import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

import { STATE, storage } from "./setup";

/** Deletes the household the setup made, by the ids it recorded. */
export default async function teardown() {
  if (existsSync(STATE)) {
    execSync("pnpm -s dev:household delete", { env: { ...process.env, DEV_HOUSEHOLD_STATE: STATE }, stdio: "inherit" });
  }
  for (const role of ["learner", "guardian"] as const) rmSync(storage(role), { force: true });
}
