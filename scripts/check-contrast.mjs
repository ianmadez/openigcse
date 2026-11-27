#!/usr/bin/env node
/**
 * Measures the declared colour tokens and reports every rendered pair.
 *
 * Tokens live in src/app/globals.css as raw oklch channels. This script
 * resolves the primitive -> semantic chain for both appearances, converts to
 * sRGB, and checks the pairs the interface actually renders.
 *
 * Usage: node scripts/check-contrast.mjs [--verbose]
 */
import { readFile } from "node:fs/promises";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const CSS_PATH = path.resolve(process.cwd(), "src/app/globals.css");
const verbose = process.argv.includes("--verbose");

/** WCAG 2.2 minimum for normal text. */
const BODY = 4.5;
/** WCAG 2.2 minimum for large text (>= 24px, or >= 18.66px bold). */
const LARGE = 3;
/** WCAG 2.2 minimum for non-text UI (borders, icons, focus rings). */
const UI = 3;

const css = await readFile(CSS_PATH, "utf8");

/** Extract every `--name: value;` declaration, per selector block. */
function readBlock(selector) {
  const index = css.indexOf(selector);
  if (index === -1) throw new Error(`Missing ${selector} block in globals.css`);

  const open = css.indexOf("{", index);
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const body = css.slice(open + 1, end);
  const tokens = new Map();
  for (const match of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

// Primitives are declared twice under :root, so merge both blocks in order.
const rootBlocks = [];
{
  const re = /:root\s*\{/g;
  let match;
  while ((match = re.exec(css)) !== null) {
    const idx = match.index + match[0].length - 1;
    let depth = 0;
    let end = idx;
    for (let i = idx; i < css.length; i += 1) {
      if (css[i] === "{") depth += 1;
      if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = css.slice(idx + 1, end);
    const tokens = new Map();
    for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) tokens.set(m[1], m[2].trim());
    rootBlocks.push(tokens);
  }
}

const light = new Map();
for (const block of rootBlocks) for (const [k, v] of block) light.set(k, v);
const dark = new Map([...light, ...readBlock(".dark {")]);

function resolve(tokens, name, seen = new Set()) {
  const raw = tokens.get(name);
  if (!raw) throw new Error(`Unknown token --${name}`);
  const alias = raw.match(/^var\(--([\w-]+)\)$/);
  if (alias) {
    const target = alias[1];
    if (seen.has(target)) throw new Error(`Circular alias at --${name}`);
    seen.add(target);
    return resolve(tokens, target, seen);
  }
  return raw;
}

function parseOklch(value) {
  const match = value.match(/^([\d.]+)\s+([\d.]+)\s+([\d.]+)$/);
  if (!match) throw new Error(`Not an oklch triple: ${value}`);
  return { l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) };
}

function toLinearRgb({ l, c, h }) {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;

  return [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
}

function luminance(tokens, name) {
  const [r, g, b] = toLinearRgb(parseOklch(resolve(tokens, name)));
  const clamp = (x) => Math.min(1, Math.max(0, x));
  return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b);
}

function inGamut(tokens, name) {
  const rgb = toLinearRgb(parseOklch(resolve(tokens, name)));
  return rgb.every((channel) => channel >= -0.001 && channel <= 1.001);
}

function contrast(foreground, background, tokens) {
  const a = luminance(tokens, foreground);
  const b = luminance(tokens, background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Every pair the interface actually renders. */
const pairs = [
  ["text-primary", "surface-page", BODY, "body text on the page"],
  ["text-primary", "surface-card", BODY, "body text in a card"],
  ["text-secondary", "surface-page", BODY, "secondary text on the page"],
  ["text-secondary", "surface-card", BODY, "secondary text in a card"],
  ["text-muted", "surface-card", BODY, "captions and labels"],
  ["text-muted", "surface-muted", BODY, "captions on a muted panel"],
  ["on-accent", "accent-solid", BODY, "button label on the primary action"],
  ["accent-text", "accent-surface", BODY, "active navigation item"],
  ["accent-text", "surface-card", BODY, "accent link in a card"],
  ["success-text", "success-surface", BODY, "success message"],
  ["danger-text", "danger-surface", BODY, "error message"],
  ["warning-text", "warning-surface", BODY, "warning message"],
  ["info-text", "info-surface", BODY, "info message"],
  ["danger-text", "warning-surface", BODY, "refused offline write in the offline banner"],
  ["text-muted", "surface-page", BODY, "inactive tab label on the phone tab bar"],
  ["accent-solid", "surface-card", UI, "focus ring and accent border"],
  ["border-strong", "surface-page", UI, "input border"],
  ["border-strong", "surface-muted", UI, "input border on a muted panel"],
  ["danger-solid", "surface-card", UI, "danger icon on a card"],
  ["accent-solid", "surface-page", LARGE, "accent fill on the page"],
  ["subject-stem", "subject-stem-surface", BODY, "STEM subject chip"],
  ["subject-biology", "subject-biology-surface", BODY, "Biology subject chip"],
  ["subject-physics", "subject-physics-surface", BODY, "Physics subject chip"],
  ["subject-humanities", "subject-humanities-surface", BODY, "Humanities subject chip"],
  ["subject-languages", "subject-languages-surface", BODY, "Languages subject chip"],
  ["subject-stem", "surface-card", UI, "STEM accent dot on a card"],
  ["subject-biology", "surface-card", UI, "Biology accent dot on a card"],
  ["subject-physics", "surface-card", UI, "Physics accent dot on a card"],
  ["subject-humanities", "surface-card", UI, "Humanities accent dot on a card"],
  ["subject-languages", "surface-card", UI, "Languages accent dot on a card"],
];

const rows = [];
let failures = 0;

for (const [appearance, tokens] of [
  ["light", light],
  ["dark", dark],
]) {
  for (const [fg, bg, min, usage] of pairs) {
    let ratio;
    try {
      ratio = contrast(fg, bg, tokens);
    } catch (error) {
      rows.push({ appearance, pair: `${fg} on ${bg}`, ratio: "n/a", min, result: error.message, usage });
      failures += 1;
      continue;
    }
    const pass = ratio >= min;
    if (!pass) failures += 1;
    rows.push({
      appearance,
      pair: `${fg} on ${bg}`,
      ratio: ratio.toFixed(2),
      min: min.toFixed(1),
      result: pass ? "pass" : "FAIL",
      usage,
    });
  }

  if (verbose) {
    const outOfGamut = [...tokens.keys()].filter((name) => {
      try {
        return !inGamut(tokens, name);
      } catch {
        return false;
      }
    });
    if (outOfGamut.length) console.log(`\n${appearance}: outside sRGB -> ${outOfGamut.join(", ")}`);
  }
}

console.table(rows);

if (failures > 0) {
  console.error(`\n${failures} contrast pair(s) below their threshold.`);
  process.exit(1);
}

console.log(`\nAll ${rows.length} declared pairs meet their WCAG threshold.`);

// `muted` is a text token in this theme, so `bg-muted` would paint dark text colour onto a surface.
// Guard against the exact bug that made light-mode timestamps invisible.
const offenders = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(css|tsx?)$/.test(entry.name)) {
      const source = readFileSync(full, "utf8");
      source.split("\n").forEach((line, index) => {
        if (/\b(?:bg|border|fill|stroke|divide|ring|from|to|via)-muted\b/.test(line)) {
          offenders.push(`${full}:${index + 1}: ${line.trim()}`);
        }
      });
    }
  }
};
walk(path.join(process.cwd(), "src"));

if (offenders.length > 0) {
  console.error("\nSurface utilities cannot use the text token `muted`. Use `sunken` instead:");
  for (const offender of offenders) console.error(`  ${offender}`);
  process.exit(1);
}

console.log("No surface utility paints the `muted` text token.");