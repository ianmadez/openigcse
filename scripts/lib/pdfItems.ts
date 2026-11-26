import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import type { TextItem } from "./syllabusParser";

/** Positioned text items from every page of a PDF, in document order. */
export async function extractItems(buffer: Buffer | Uint8Array): Promise<TextItem[]> {
  const loadingTask = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  const doc = await loadingTask.promise;
  const items: TextItem[] = [];
  for (let page = 1; page <= doc.numPages; page += 1) {
    const pageProxy = await doc.getPage(page);
    const content = await pageProxy.getTextContent();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const transform = item.transform as number[];
      items.push({ text: item.str, x: transform[4] ?? 0, y: transform[5] ?? 0, width: item.width, height: item.height, page });
    }
    pageProxy.cleanup();
  }
  await loadingTask.destroy();
  return items;
}
