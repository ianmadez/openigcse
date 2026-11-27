/** Splits an id list so an `.in()` filter stays inside URL length limits. */
export function chunk<T>(items: T[], size = 100): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/**
 * Reads many rows in batches and concatenates the results in batch order. The batches run in
 * parallel: each is a round trip to Supabase, and running them one after another added up.
 */
export async function collect<T>(
  ids: string[],
  read: (batch: string[]) => Promise<T[] | null>,
  size = 100,
): Promise<T[]> {
  const results = await Promise.all(chunk(unique(ids), size).map((batch) => read(batch)));
  return results.flatMap((rows) => rows ?? []);
}

/** "English - First Language" becomes "english-first-language". */
export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
