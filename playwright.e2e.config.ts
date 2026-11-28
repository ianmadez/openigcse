import { defineConfig } from "@playwright/test";

/**
 * The Phase 8 exit gate: one full school day, end to end, against staging (the local Docker
 * Supabase). Start the app first (`pnpm build; pnpm start`, or `pnpm dev`), then `pnpm test:e2e`.
 * `--repeat-each=2` runs the day twice in a row, which is what the gate asks for.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 240_000,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: ".superpowers/e2e-results",
  expect: { timeout: 30_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    timezoneId: "Africa/Dar_es_Salaam",
    trace: "retain-on-failure",
    actionTimeout: 30_000,
  },
});
