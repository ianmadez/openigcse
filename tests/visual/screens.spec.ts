import { expect, test, type Page } from "@playwright/test";

import { storage } from "./setup";

/**
 * The eight highest-traffic screens (Step 7.2), on a phone (360 px, light and dark) and a desktop
 * (1280 px). Each must not scroll sideways, a phone must show the tab bar instead of the sidebar,
 * and the picture must match the recorded baseline. Dates and clocks are masked.
 */
const screens = [
  { role: "learner", path: "/today", name: "today" },
  { role: "learner", path: "/timetable", name: "timetable" },
  { role: "learner", path: "/review", name: "review" },
  { role: "learner", path: "/messages", name: "messages" },
  { role: "guardian", path: "/parent/live", name: "parent-live" },
  { role: "guardian", path: "/parent/messages", name: "parent-messages" },
  { role: "guardian", path: "/parent/marking-desk", name: "parent-marking" },
  { role: "guardian", path: "/parent/timetable", name: "parent-timetable" },
] as const;

const views = [
  { label: "360-light", width: 360, theme: "light", phone: true },
  { label: "360-dark", width: 360, theme: "dark", phone: true },
  { label: "1280-light", width: 1280, theme: "light", phone: false },
] as const;

// Anything that changes with the clock or the calendar.
const volatile = (page: Page) => [page.locator("time"), page.locator("[data-volatile]")];

for (const screen of screens) {
  for (const view of views) {
    test(`${screen.name} at ${view.label}`, async ({ browser }) => {
      const context = await browser.newContext({
        storageState: storage(screen.role),
        viewport: { width: view.width, height: 800 },
        hasTouch: view.phone,
        isMobile: view.phone,
        colorScheme: view.theme,
        reducedMotion: "reduce",
        // Live screens open a realtime socket; a fixed time zone keeps the rendered times stable.
        timezoneId: "Africa/Dar_es_Salaam",
      });
      await context.addInitScript((theme) => localStorage.setItem("openigcse-theme", theme), view.theme);
      const page = await context.newPage();
      await page.goto(screen.path, { waitUntil: "networkidle" });

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "page scrolls sideways").toBeLessThanOrEqual(1);

      const tabs = page.getByRole("navigation", { name: "Main tabs" });
      if (view.phone) await expect(tabs).toBeVisible();
      else await expect(tabs).toBeHidden();

      await expect(page).toHaveScreenshot(`${screen.name}-${view.label}.png`, { fullPage: true, mask: volatile(page) });
      await context.close();
    });
  }
}
