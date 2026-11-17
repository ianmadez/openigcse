/** Database status names with the words the roadmap and the screens use. */
export const EVIDENCE_LABEL = {
  Submitted: "Submitted",
  NeedsCorrection: "Changes requested",
  Approved: "Approved",
} as const;

export type EvidenceStatus = keyof typeof EVIDENCE_LABEL;

export function checkEvidence(input: { title: string; typedResponse: string; hasFile: boolean }):
  | { ok: true }
  | { ok: false; error: string } {
  if (!input.title.trim()) return { ok: false, error: "Give the work a title." };
  if (!input.hasFile && !input.typedResponse.trim()) {
    return { ok: false, error: "Attach a photo or PDF, or write something." };
  }
  return { ok: true };
}
