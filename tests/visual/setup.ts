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
      // Wait for hydration: an Enter pressed before it is lost. One retry covers a slow first load.
      const pin = page.locator("input[name=pin]");
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await page.goto(`${base}/parent`, { waitUntil: "networkidle" });
        if (!(await pin.count())) break;
        await pin.fill(state.pin);
        await pin.press("Enter");
        const unlocked = await pin.waitFor({ state: "detached", timeout: 30_000 }).then(() => true, () => false);
        if (unlocked) break;
        if (attempt === 1) throw new Error("The PIN gate did not unlock for the visual household.");
      }
    }
    await context.storageState({ path: storage(role) });
    await context.close();
  }
  await browser.close();
}
