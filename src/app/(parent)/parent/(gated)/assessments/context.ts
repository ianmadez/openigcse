import type { BankQuestion } from "@/components/parent/AssessmentBuilder";
import { plainPreview } from "@/lib/assessment/question";
import { getEnrolledCurriculum } from "@/lib/data/curriculum";
import { listQuestions, objectiveTree } from "@/lib/data/question-bank";
import { createServerClientInstance } from "@/lib/supabase/server";

/** Everything the builder chooses from: enrolled subjects, the bank, objectives, the household's zone. */
export async function builderContext(householdId: string, learnerId: string, termId: string) {
  const supabase = await createServerClientInstance();
  const [curriculum, questions, { data: household }] = await Promise.all([
    getEnrolledCurriculum(learnerId, termId),
    listQuestions(householdId),
    supabase.from("households").select("cambridge_admin_zone").eq("id", householdId).maybeSingle(),
  ]);

  const bank: BankQuestion[] = questions.map((question) => ({
    id: question.id,
    kind: question.kind,
    preview: plainPreview(question.prompt, 120),
    marks: question.marks,
    subjectCode: question.objective?.subjectCode ?? null,
    objectiveCode: question.objective?.code ?? null,
    topicName: question.objective?.topicName ?? null,
  }));

  return {
    subjects: curriculum.map((subject) => ({
      routeId: subject.routeId,
      subjectCode: subject.subjectCode,
      subjectName: subject.subjectName,
    })),
    bank,
    tree: objectiveTree(curriculum),
    zone: (household?.cambridge_admin_zone as number | undefined) ?? null,
  };
}
