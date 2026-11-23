import type { EvidenceStatus } from "@/lib/assessment/evidence";
import { signedUrls } from "@/lib/data/files";
import { describeObjectives } from "@/lib/data/objectives";
import { createServerClientInstance } from "@/lib/supabase/server";

export type EvidenceItem = {
  id: string;
  title: string;
  status: EvidenceStatus;
  objectiveCode: string | null;
  subjectCode: string | null;
  typedResponse: string | null;
  notes: string | null;
  fileUrl: string | null;
  mimeType: string | null;
  feedback: string | null;
  previousId: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

const COLUMNS =
  "id, title, evaluation_status, objective_id, typed_response, student_notes, file_path, mime_type, parent_feedback, parent_submission_id, created_at, reviewed_at";

type Row = {
  id: string;
  title: string | null;
  evaluation_status: EvidenceStatus;
  objective_id: string | null;
  typed_response: string | null;
  student_notes: string | null;
  file_path: string | null;
  mime_type: string | null;
  parent_feedback: string | null;
  parent_submission_id: string | null;
  created_at: string;
  reviewed_at: string | null;
};

async function hydrate(rows: Row[]): Promise<EvidenceItem[]> {
  const [labels, urls] = await Promise.all([
    describeObjectives(rows.map((row) => row.objective_id ?? "")),
    signedUrls(rows.map((row) => row.file_path ?? "")),
  ]);

  return rows.map((row) => {
    const label = row.objective_id ? labels.get(row.objective_id) : undefined;
    return {
      id: row.id,
      title: row.title ?? "Untitled",
      status: row.evaluation_status,
      objectiveCode: label?.code ?? null,
      subjectCode: label?.subjectCode ?? null,
      typedResponse: row.typed_response,
      notes: row.student_notes,
      fileUrl: row.file_path ? (urls.get(row.file_path) ?? null) : null,
      mimeType: row.mime_type,
      feedback: row.parent_feedback,
      previousId: row.parent_submission_id,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
    };
  });
}

export async function listLearnerEvidence(learnerId: string) {
  const supabase = await createServerClientInstance();
  const { data } = await supabase
    .from("evidence_portfolio")
    .select(COLUMNS)
    .eq("student_id", learnerId)
    .order("created_at", { ascending: false })
    .limit(100);
  return hydrate((data ?? []) as Row[]);
}

/** Work waiting for the parent, oldest first so nothing sits forgotten. */
export async function listEvidenceQueue(householdId: string) {
  const supabase = await createServerClientInstance();
  const { data } = await supabase
    .from("evidence_portfolio")
    .select(COLUMNS)
    .eq("household_id", householdId)
    .eq("evaluation_status", "Submitted")
    .order("created_at", { ascending: true })
    .limit(20);
  return hydrate((data ?? []) as Row[]);
}

export async function createEvidence(input: {
  householdId: string;
  learnerId: string;
  title: string;
  objectiveId: string | null;
  typedResponse: string | null;
  notes: string | null;
  filePath: string | null;
  mimeType: string | null;
  byteSize: number | null;
  previousId: string | null;
}) {
  const supabase = await createServerClientInstance();
  const { data, error } = await supabase
    .from("evidence_portfolio")
    .insert({
      household_id: input.householdId,
      student_id: input.learnerId,
      title: input.title,
      objective_id: input.objectiveId,
      typed_response: input.typedResponse,
      word_count: input.typedResponse ? input.typedResponse.trim().split(/\s+/).length : null,
      student_notes: input.notes,
      file_path: input.filePath,
      mime_type: input.mimeType,
      byte_size: input.byteSize,
      parent_submission_id: input.previousId,
    })
    .select("id");
  if (error) return { ok: false as const, error: error.message };
  return data?.length ? { ok: true as const } : { ok: false as const, error: "Not saved." };
}

export async function reviewEvidence(id: string, status: "Approved" | "NeedsCorrection", feedback: string | null, reviewer: string | null) {
  const supabase = await createServerClientInstance();
  const { data, error } = await supabase
    .from("evidence_portfolio")
    .update({ evaluation_status: status, parent_feedback: feedback, marked_by: reviewer })
    .eq("id", id)
    .select("evaluation_status");
  if (error) return { ok: false as const, error: error.message };
  if (data?.[0]?.evaluation_status !== status) {
    return { ok: false as const, error: "The review was not saved. Sign in as the guardian and try again." };
  }
  return { ok: true as const };
}
