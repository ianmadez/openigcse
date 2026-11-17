import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Loads `.env.local` then `.env` without overriding variables already set. */
export function loadEnv(cwd = process.cwd()) {
  for (const name of [".env.local", ".env"]) {
    const file = join(cwd, name);
    if (!existsSync(file)) continue;

    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (!key || rawValue === undefined || process.env[key]) continue;
      process.env[key] = rawValue.trim().replace(/^['"]|['"]$/g, "");
    }
  }
}
