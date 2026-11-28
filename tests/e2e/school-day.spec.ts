import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

import { addCheckpoint, addDraftQuiz, createHousehold, deleteHousehold, todaysObjective, type E2EState } from "./household";

/**
 * Phase 8 exit gate: sign in, timetable, lesson, checkpoint, break request, quiz, marking, review.
 * Every step goes through the real screens; only content a parent would author ahead of time (the
 * checkpoint question and the quiz paper) is seeded.
 */
let state: E2EState;

test.beforeEach(async () => {
  state = await createHousehold();
});

test.afterEach(() => {
  deleteHousehold();
});

async function signIn(browser: Browser, role: "guardian" | "learner"): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.locator("#panel-password input[name=email]").fill(state[role].email);
  await page.locator("#panel-password input[name=password]").fill(state[role].password);
  await page.locator("#panel-password button[type=submit]").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
  return page;
}

/**
 * Taps until the screen shows the result. A tap that lands before React has hydrated does nothing,
 * exactly as on a slow phone, so the test taps again the way a person would.
 */
async function tapUntil(button: Locator, done: Locator) {
  await expect(async () => {
    if (await done.isVisible()) return;
    if (await button.isVisible()) await button.click();
    await expect(done).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 45_000 });
}

async function unlockParent(page: Page) {
  await page.goto("/parent", { waitUntil: "networkidle" });
  const pin = page.locator("input[name=pin]");
  if (await pin.count()) {
    await pin.fill(state.pin);
    await pin.press("Enter");
    await pin.waitFor({ state: "detached", timeout: 30_000 });
  }
}

test("a full school day", async ({ browser }) => {
  // ---- sign in
  const guardian = await signIn(browser, "guardian");
  await unlockParent(guardian);
  const learner = await signIn(browser, "learner");

  // ---- timetable: the parent builds today from the week, the learner sees it
  await guardian.goto("/parent/timetable", { waitUntil: "networkidle" });
  await guardian.getByRole("button", { name: "Build today's plan" }).click();
  await expect.poll(() => todaysObjective(state).then(() => true, () => false), { timeout: 30_000 }).toBe(true);
  await learner.goto("/timetable", { waitUntil: "networkidle" });
  await expect(learner.getByRole("listitem").filter({ hasText: /00:05.*0455 Economics/ }).first()).toBeVisible();

  const objective = await todaysObjective(state);
  await addCheckpoint(state, objective);
  const quizId = await addDraftQuiz(state, objective);

  // ---- lesson: start the planned task
  await learner.goto("/today", { waitUntil: "networkidle" });
  const periods = learner.getByRole("list").filter({ hasText: "min planned" }).first();
  await periods.getByRole("button", { name: "Start", exact: true }).click();
  await expect(periods.getByRole("button", { name: "Finish", exact: true })).toBeVisible();

  // ---- checkpoint: a wrong answer, which goes to the mistake notebook
  const options = learner.getByRole("radiogroup", { name: "Answer options" });
  await options.getByRole("radio").filter({ hasText: "Surplus" }).click();
  await learner.getByRole("button", { name: "Check answer" }).click();
  await learner.getByRole("button", { name: "Add to my notebook" }).click();
  await expect(learner.getByRole("button", { name: "Add to my notebook" })).toBeHidden({ timeout: 30_000 });

  // ---- break request, answered by the parent
  const sheet = learner.getByRole("dialog");
  // A tap that lands before hydration does nothing, as on a real slow phone; tap again until it opens.
  await expect(async () => {
    if (!(await sheet.count())) await learner.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(sheet).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  await sheet.getByRole("button", { name: /take a break/i }).click();
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  await sheet.getByRole("button", { name: "Back to work" }).click();
  await guardian.goto("/parent/live", { waitUntil: "networkidle" });
  const ask = guardian.getByRole("article").filter({ hasText: /break/i }).first();
  await expect(ask).toBeVisible({ timeout: 30_000 });
  await tapUntil(ask.getByRole("button", { name: "10 min" }), guardian.getByText("No open requests"));

  // ---- finish the lesson
  await learner.goto("/today", { waitUntil: "networkidle" });
  await periods.getByRole("button", { name: "Finish", exact: true }).click();
  await expect(periods.getByText("Done").first()).toBeVisible();

  // ---- quiz: the parent schedules it, the learner sits it
  await guardian.goto(`/parent/assessments/${quizId}`, { waitUntil: "networkidle" });
  await guardian.getByRole("button", { name: /^Schedule/ }).click();
  await expect(guardian.getByText("Scheduled").first()).toBeVisible({ timeout: 30_000 });

  await learner.goto(`/assessments/${quizId}`, { waitUntil: "networkidle" });
  await learner.getByRole("button", { name: "Start", exact: true }).click();
  await learner.getByRole("textbox").first().fill("Scarcity is when resources are limited but wants are unlimited.");
  learner.once("dialog", (dialog) => void dialog.accept());
  await learner.getByRole("button", { name: "Hand in", exact: true }).click();
  await expect(learner.getByText(/Handed in/).first()).toBeVisible({ timeout: 30_000 });

  // ---- marking
  await guardian.goto("/parent/marking-desk", { waitUntil: "networkidle" });
  await guardian.getByText("E2E weekly quiz").first().click();
  const mark = guardian.getByRole("group", { name: "Mark" });
  await tapUntil(mark.getByRole("button", { name: "2", exact: true }), mark.locator('button[aria-pressed="true"]', { hasText: "2" }));
  // Either the confirmation or the emptied list proves the save; the list can refresh a moment after.
  await tapUntil(
    guardian.getByRole("button", { name: "Save marks" }),
    guardian.getByText(/^Marked: 2 of 2/).or(guardian.getByRole("heading", { name: "To mark (0)" })).first(),
  );

  // ---- review: the learner sees the mark and the mistake waiting
  await learner.goto("/assessments", { waitUntil: "networkidle" });
  await expect(learner.getByText("E2E weekly quiz").first()).toBeVisible();
  await expect(learner.getByRole("link", { name: /E2E weekly quiz/ })).not.toContainText("Waiting for marks");
  await learner.getByRole("link", { name: /E2E weekly quiz/ }).click();
  await expect(learner.getByText(/2\s*(\/|of)\s*2/).first()).toBeVisible();
  await learner.goto("/review", { waitUntil: "networkidle" });
  await expect(learner.getByRole("tab", { name: "Mistake notebook (1)" })).toBeVisible();
});
