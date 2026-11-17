import { collect } from "@/lib/data/query";
import { createServerClientInstance } from "@/lib/supabase/server";

export type Checkpoint = {
  id: string;
  objectiveCode: string;
  prompt: string;
  options: Array<{ letter: string; text: string; correct: boolean }>;
  modelAnswer: string;
  markingGuide: string;
};

type TemplateRow = {
  id: string;
  objective_id: string | null;
  question_type: string;
  prompt_template: string;
  options_schema: unknown;
  mark_scheme_rubric: string;
};

const LETTERS = ["A", "B", "C", "D"] as const;

function optionsFrom(value: unknown): Checkpoint["options"] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 4).map((option, index) => {
    const letter = LETTERS[index] ?? "A";
    if (typeof option === "string") return { letter, text: option, correct: false };
    if (option && typeof option === "object") {
      const record = option as { letter?: string; text?: string; correct?: boolean };
      return { letter: record.letter ?? letter, text: record.text ?? "", correct: Boolean(record.correct) };
    }
    return { letter, text: "", correct: false };
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
      .from("question_templates")
      .select("id, objective_id, question_type, prompt_template, options_schema, mark_scheme_rubric")
      .in("objective_id", batch)
      .eq("question_type", "MCQ");
    return (data ?? []) as TemplateRow[];
  });

  return rows
    .filter((row) => row.objective_id && objectiveCodeById.has(row.objective_id))
    .map<Checkpoint>((row) => {
      const options = optionsFrom(row.options_schema);
      const correct = options.find((option) => option.correct)?.letter ?? "A";

      return {
        id: row.id,
        objectiveCode: objectiveCodeById.get(row.objective_id!) ?? "",
        prompt: row.prompt_template,
        options,
        modelAnswer: correct,
        markingGuide: row.mark_scheme_rubric,
      };
    });
}
