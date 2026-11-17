import { getEnrolledCurriculum } from "@/lib/data/curriculum";
import { getAssessmentObjectives } from "@/lib/data/objectives";
import { objectiveTree } from "@/lib/data/question-bank";

/** What the bank and the editor choose from: the learner's enrolled syllabuses this term. */
export async function questionContext(learnerId: string, termId: string | null) {
  const subjects = termId ? await getEnrolledCurriculum(learnerId, termId) : [];
  const tree = objectiveTree(subjects);
  const assessmentObjectives = await getAssessmentObjectives(tree.map((subject) => subject.versionId));
  return { tree, assessmentObjectives };
}
