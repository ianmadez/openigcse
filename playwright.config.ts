import { defineConfig } from "@playwright/test";

/**
 * Screenshot tests for the eight highest-traffic screens (Step 7.2). They run against a server
 * you start yourself (`pnpm build; pnpm start`), on a throwaway household the setup creates and
 * the teardown deletes. `pnpm test:visual` compares; `pnpm test:visual --update-snapshots`
 * records new baselines after an intended change.
 */
export default defineConfig({
  testDir: "tests/visual",
  globalSetup: "./tests/visual/setup.ts",
  globalTeardown: "./tests/visual/teardown.ts",
  timeout: 90_000,
  workers: 2,
  reporter: [["list"]],
  outputDir: ".superpowers/visual-results",
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled", caret: "hide" },
  },
  use: {
    baseURL: process.env.VISUAL_BASE_URL ?? "http://localhost:3000",
  },
});
