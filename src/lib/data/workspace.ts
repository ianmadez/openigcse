import { getTermAssessments, type Assessment } from "@/lib/data/assessments";
import { getEnrolledCurriculum, type SubjectCurriculum } from "@/lib/data/curriculum";
import { isoDate } from "@/lib/data/dates";
import { getLearningEvents, type LearningEvent } from "@/lib/data/events";
import { getMistakes, type Mistake } from "@/lib/data/mistakes";
import { getCheckpoints, type Checkpoint } from "@/lib/data/questions";
import { getRetention, masteryByObjective } from "@/lib/data/retention";
import { demoMode, getSetupState } from "@/lib/data/session";
import type { TermSummary } from "@/lib/data/terms";
import { getDayPlanItems, type DayPlanItem } from "@/lib/data/timetable";
import { rankActivities, type ActivitySignal, type PlannedTask } from "@/lib/planning/nextBestActivity";

/**
 * Learner state, composed from the repositories.
 *
 * Every field comes from Postgres under the learner's own session. The demo
 * composition at the bottom is the only place that fabricates data, and it is
 * reachable only with DEMO_MODE=true, for screenshots.
 */

export type { Assessment, Checkpoint, DayPlanItem, LearningEvent, Mistake };
export type { ActivitySignal, PlannedTask };

export type Learner = {
  id: string;
  displayName: string;
  stage: string | null;
  examSeries: string | null;
  streakDays: number;
};

export type StudyTerm = TermSummary;

export type Enrollment = {
  subjectCode: string;
  subjectName: string;
  isElective: boolean;
  weeklyMinutes: number;
};

export type LessonResource = {
  objectiveCode: string;
  title: string;
  provider: string;
  youtubeVideoId: string;
  startSeconds: number;
  endSeconds: number | null;
  url: string | null;
};

export type Workspace = {
  source: "database" | "demo";
  learner: Learner;
  term: StudyTerm | null;
  enrollments: Enrollment[];
  subjects: SubjectCurriculum[];
  signals: ActivitySignal[];
  planned: PlannedTask[];
  mistakes: Mistake[];
  assessments: Assessment[];
  checkpoints: Checkpoint[];
  resources: LessonResource[];
  events: LearningEvent[];
  dayPlan: DayPlanItem[];
  curriculum: { subjects: number; topics: number; objectives: number };
};

const DAY = 24 * 60 * 60 * 1000;

function emptyWorkspace(now: Date): Workspace {
  return {
    source: "database",
    learner: { id: "", displayName: "Learner", stage: null, examSeries: null, streakDays: 0 },
    term: null,
    enrollments: [],
    subjects: [],
    signals: [],
    planned: [],
    mistakes: [],
    assessments: [],
    checkpoints: [],
    resources: [],
    events: [],
    dayPlan: [],
    curriculum: { subjects: 0, topics: 0, objectives: 0 },
  };
}

function daysAgo(iso: string, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY));
}

/** Consecutive days ending today or yesterday that have at least one event. */
function streakFrom(events: LearningEvent[], now: Date) {
  const days = new Set(events.map((event) => event.at.slice(0, 10)));
  let streak = 0;

  for (let offset = 0; offset < 365; offset += 1) {
    const key = isoDate(-offset, now);
    if (days.has(key)) {
      streak += 1;
      continue;
    }
    if (offset === 0) continue;
    break;
  }

  return streak;
}

/**
 * One learner's world for a given day.
 *
 * `learnerId` is the profile the caller was authorised for; the running term
 * comes from the session state so a page never has to guess which one is live.
 */
export async function getLearnerWorkspace(learnerId: string | null, now: Date = new Date()): Promise<Workspace> {
  if (demoMode()) return demoWorkspace(now);

  const state = await getSetupState();
  if (state.status !== "configured") return emptyWorkspace(now);

  const id = learnerId ?? state.learnerId;
  const term = state.term;

  const [subjects, mistakes, assessments, events, dayPlan, retention] = await Promise.all([
    getEnrolledCurriculum(id, term?.id ?? ""),
    getMistakes(id),
    getTermAssessments(term?.id ?? "", now),
    getLearningEvents(id, isoDate(-28, now)),
    getDayPlanItems(id, isoDate(0, now)),
    getRetention(id),
  ]);

  const objectiveCodeById = new Map<string, string>();
  for (const subject of subjects) {
    for (const objective of subject.objectives) objectiveCodeById.set(objective.id, objective.code);
  }

  const resources: LessonResource[] = [];
  for (const subject of subjects) {
    for (const resource of subject.resources) {
      if (resources.some((entry) => entry.objectiveCode === resource.objectiveCode)) continue;
      resources.push({
        objectiveCode: resource.objectiveCode,
        title: resource.title,
        provider: resource.resourceType === "YouTubeVideo" ? "YouTube" : resource.resourceType,
        youtubeVideoId: resource.youtubeVideoId ?? "",
        startSeconds: resource.startSeconds,
        endSeconds: resource.endSeconds,
        url: resource.url,
      });
    }
  }

  const checkpoints = await getCheckpoints([...objectiveCodeById.keys()], objectiveCodeById);
  const mastery = masteryByObjective(retention);

  const openByObjective = new Map<string, number>();
  for (const mistake of mistakes) {
    if (mistake.status !== "open") continue;
    openByObjective.set(mistake.objectiveCode, (openByObjective.get(mistake.objectiveCode) ?? 0) + 1);
  }

  const lastStudied = new Map<string, number>();
  for (const event of events) {
    if (!event.objectiveCode) continue;
    const age = daysAgo(event.at, now);
    const seen = lastStudied.get(event.objectiveCode);
    if (seen === undefined || age < seen) lastStudied.set(event.objectiveCode, age);
  }

  const nextAssessmentBySubject = new Map<string, Assessment>();
  for (const assessment of assessments) {
    if (!assessment.subjectCode || !assessment.scheduledFor) continue;
    const existing = nextAssessmentBySubject.get(assessment.subjectCode);
    if (!existing || existing.scheduledFor > assessment.scheduledFor) {
      nextAssessmentBySubject.set(assessment.subjectCode, assessment);
    }
  }

  const signals: ActivitySignal[] = [];

  for (const subject of subjects) {
    const assessment = nextAssessmentBySubject.get(subject.subjectCode) ?? null;

    for (const objective of subject.objectives) {
      signals.push({
        objectiveCode: objective.code,
        subjectCode: subject.subjectCode,
        subjectName: subject.subjectName,
        topicName: objective.topicName || objective.topicCode,
        objectiveText: objective.text,
        commandWord: objective.commandWords[0] ?? "Describe",
        tier: objective.tier,
        // Phase 4 replaces this with the activity's own estimate; a flat 20
        // keeps the day total honest until activities carry a per-objective
        // duration.
        minutes: 20,
        mastery: mastery.get(objective.id) ?? 0,
        openMistakes: openByObjective.get(objective.code) ?? 0,
        lastStudiedDaysAgo: lastStudied.get(objective.code) ?? null,
        daysUntilAssessment: assessment ? assessment.daysUntil : null,
        assessmentTitle: assessment?.title ?? null,
        hasLesson: resources.some((resource) => resource.objectiveCode === objective.code),
      });
    }
  }

  return {
    source: "database",
    learner: {
      id,
      displayName: state.learnerName,
      stage: state.learnerStage,
      examSeries: state.examSeries,
      streakDays: streakFrom(events, now),
    },
    term,
    enrollments: subjects.map((subject) => ({
      subjectCode: subject.subjectCode,
      subjectName: subject.subjectName,
      isElective: subject.isElective,
      weeklyMinutes: subject.weeklyMinutes,
    })),
    subjects,
    signals,
    planned: rankActivities(signals, 3),
    mistakes,
    assessments,
    checkpoints,
    resources,
    events,
    dayPlan,
    curriculum: {
      subjects: subjects.length,
      topics: subjects.reduce((sum, subject) => sum + subject.counts.topics, 0),
      objectives: signals.length,
    },
  };
}

/**
 * Screenshot-only composition. Nothing here is a real family: the values are
 * fixed so a design review does not depend on which rows happen to exist.
 */
function demoWorkspace(now: Date): Workspace {
  const signals: ActivitySignal[] = [
    {
      objectiveCode: "BI-0610-1.1.1",
      subjectCode: "0610",
      subjectName: "Biology",
      topicName: "Characteristics of living organisms",
      objectiveText: "Describe the characteristics of living organisms.",
      commandWord: "Describe",
      tier: "Both",
      minutes: 20,
      mastery: 0.3,
      openMistakes: 1,
      lastStudiedDaysAgo: 3,
      daysUntilAssessment: 2,
      assessmentTitle: "Biology weekly quiz",
      hasLesson: true,
    },
    {
      objectiveCode: "PH-0625-1.1.1",
      subjectCode: "0625",
      subjectName: "Physics",
      topicName: "Physical quantities",
      objectiveText: "State the units of physical quantities.",
      commandWord: "State",
      tier: "Both",
      minutes: 20,
      mastery: 0.55,
      openMistakes: 0,
      lastStudiedDaysAgo: 9,
      daysUntilAssessment: null,
      assessmentTitle: null,
      hasLesson: true,
    },
    {
      objectiveCode: "MA-0580-1.1.1",
      subjectCode: "0580",
      subjectName: "Mathematics",
      topicName: "Number",
      objectiveText: "Identify and use natural numbers, integers and rational numbers.",
      commandWord: "Identify",
      tier: "Core",
      minutes: 25,
      mastery: 0.2,
      openMistakes: 2,
      lastStudiedDaysAgo: null,
      daysUntilAssessment: null,
      assessmentTitle: null,
      hasLesson: false,
    },
  ];

  const term: StudyTerm = {
    id: "demo-term",
    name: "Term 2",
    status: "active",
    sequence: 2,
    startsOn: isoDate(-32, now),
    endsOn: isoDate(48, now),
    midtermWeekStart: isoDate(3, now),
    finalWeekStart: isoDate(38, now),
    dailyMinutesCap: 120,
  };

  return {
    ...emptyWorkspace(now),
    source: "demo",
    learner: {
      id: "demo-learner",
      displayName: process.env.DEMO_STUDENT_NAME?.trim() || "Learner",
      stage: process.env.DEMO_STAGE?.trim() || "Stage not set",
      examSeries: process.env.DEMO_EXAM_SERIES?.trim() || "Series not set",
      streakDays: 4,
    },
    term,
    enrollments: [
      { subjectCode: "0610", subjectName: "Biology", isElective: false, weeklyMinutes: 150 },
      { subjectCode: "0625", subjectName: "Physics", isElective: true, weeklyMinutes: 90 },
    ],
    signals,
    planned: rankActivities(signals, 3),
    assessments: [
      {
        id: "demo-assessment",
        kind: "weekly_quiz",
        title: "Biology weekly quiz",
        subjectCode: "0610",
        component: null,
        scheduledFor: isoDate(2, now),
        daysUntil: 2,
        durationMinutes: 25,
        totalMarks: 20,
        status: "scheduled",
      },
    ],
    mistakes: [
      {
        id: "demo-mistake",
        objectiveCode: "BI-0610-1.1.1",
        subjectCode: "0610",
        errorTag: "ConceptGap",
        note: "Named five characteristics and stopped; the mark scheme wanted seven.",
        status: "open",
        createdAt: isoDate(-3, now),
        question: null,
        correctionSubmitted: false,
        correction: null,
        questionSnapshot: "Describe the characteristics of living organisms.",
      },
    ],
    checkpoints: [
      {
        id: "demo-checkpoint",
        objectiveCode: "BI-0610-1.1.1",
        prompt: "Which of these is not a characteristic shared by all living organisms?",
        options: [
          { letter: "A", text: "Excretion" },
          { letter: "B", text: "Photosynthesis" },
          { letter: "C", text: "Respiration" },
          { letter: "D", text: "Growth" },
        ],
      },
    ],
    resources: [
      {
        objectiveCode: "BI-0610-1.1.1",
        title: "Characteristics of living things",
        provider: "YouTube",
        youtubeVideoId: "",
        startSeconds: 0,
        endSeconds: null,
        url: null,
      },
    ],
    curriculum: { subjects: 2, topics: 3, objectives: 3 },
  };
}
