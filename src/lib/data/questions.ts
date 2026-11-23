import { collect } from "@/lib/data/query";
import { createServerClientInstance } from "@/lib/supabase/server";

export type Checkpoint = {
  id: string;
  objectiveCode: string;
  prompt: string;
  /** Key-free: whether an option is right is decided by answer_checkpoint() on the server. */
  options: Array<{ letter: string; text: string }>;
};

type TemplateRow = {
  id: string;
  objective_id: string | null;
  question_type: string;
  prompt_template: string;
  options_schema: unknown;
};

const LETTERS = ["A", "B", "C", "D"] as const;

function optionsFrom(value: unknown): Checkpoint["options"] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 4).map((option, index) => {
    const letter = LETTERS[index] ?? "A";
    if (typeof option === "string") return { letter, text: option };
    if (option && typeof option === "object") {
      const record = option as { letter?: string; text?: string };
      return { letter: record.letter ?? letter, text: record.text ?? "" };
    }
    return { letter, text: "" };
  });
}

/**
 * Multiple-choice checkpoints for the given objectives. Authored in the marking
 * desk (Phase 3); until then the bank is empty and screens say so.
 */
export async function getCheckpoints(objectiveIds: string[], objectiveCodeById: Map<string, string>) {
  if (objectiveIds.length === 0) return [];

  const supabase = await createServerClientInstance();
  const rows = await collect<TemplateRow>(objectiveIds, async (batch) => {
    const { data } = await supabase
      .from("learner_questions")
      .select("id, objective_id, question_type, prompt_template, options_schema")
      .in("objective_id", batch)
      .eq("question_type", "MCQ");
    return (data ?? []) as TemplateRow[];
  });

  return rows
    .filter((row) => row.objective_id && objectiveCodeById.has(row.objective_id))
    .map<Checkpoint>((row) => ({
      id: row.id,
      objectiveCode: objectiveCodeById.get(row.objective_id!) ?? "",
      prompt: row.prompt_template,
      options: optionsFrom(row.options_schema),
    }));
}
