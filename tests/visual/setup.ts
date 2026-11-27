import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { chromium, type FullConfig } from "@playwright/test";

export const STATE = ".superpowers/visual-household.json";
export const storage = (role: "learner" | "guardian") => `.superpowers/visual-${role}.json`;

/** Creates the throwaway household and signs both roles in once. */
export default async function setup(config: FullConfig) {
  const env = { ...process.env, DEV_HOUSEHOLD_STATE: STATE };
  if (existsSync(STATE)) execSync("pnpm -s dev:household delete", { env, stdio: "inherit" });
  execSync("pnpm -s dev:household create", { env, stdio: "inherit" });
  const state = JSON.parse(readFileSync(STATE, "utf8"));
  const base = config.projects[0]!.use.baseURL!;

  const browser = await chromium.launch();
  for (const role of ["learner", "guardian"] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${base}/login`);
    await page.locator("#panel-password input[name=email]").fill(state[role].email);
    await page.locator("#panel-password input[name=password]").fill(state[role].password);
    await page.locator("#panel-password button[type=submit]").click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
    if (role === "guardian") {
      await page.goto(`${base}/parent`);
      await page.locator("input[name=pin]").fill(state.pin);
      await page.locator("input[name=pin]").press("Enter");
      await page.locator("input[name=pin]").waitFor({ state: "detached", timeout: 60_000 });
    }
    await context.storageState({ path: storage(role) });
    await context.close();
  }
  await browser.close();
}
