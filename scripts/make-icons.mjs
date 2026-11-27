// Renders the app icons (Step 7.3) from the same mark the sidebar uses: a teal tile with an "O".
// node scripts/make-icons.mjs   (needs Playwright's Chromium; the PNGs are committed)
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const TEAL = "oklch(0.545 0.088 195)"; // --teal-600, the accent solid
const TEAL_DARK = "oklch(0.478 0.082 195)"; // --teal-700, the tile's lower edge
const ON = "oklch(0.99 0.004 195)"; // --on-accent

// `safe` is the share of the canvas the tile fills; maskable icons keep it inside the 80% safe zone.
const icons = [
  { file: "icon-192.png", size: 192, safe: 1, round: 0.22 },
  { file: "icon-512.png", size: 512, safe: 1, round: 0.22 },
  { file: "icon-maskable-512.png", size: 512, safe: 1, round: 0, maskable: true },
  { file: "apple-touch-icon.png", size: 180, safe: 1, round: 0 },
];

mkdirSync("public/icons", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const icon of icons) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  const font = Math.round(icon.size * (icon.maskable ? 0.42 : 0.56));
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
    <div style="width:${icon.size}px;height:${icon.size}px;display:flex;align-items:center;justify-content:center;
      background:${TEAL};border-radius:${icon.round * 100}%;box-shadow:inset 0 -${Math.round(icon.size * 0.06)}px 0 ${TEAL_DARK};
      font:700 ${font}px/1 system-ui,'Segoe UI',sans-serif;color:${ON};padding-bottom:${Math.round(icon.size * 0.04)}px;box-sizing:border-box">O</div>
  </body></html>`);
  await page.screenshot({ path: `public/icons/${icon.file}`, omitBackground: true });
  console.log("wrote", icon.file);
}
await browser.close();
