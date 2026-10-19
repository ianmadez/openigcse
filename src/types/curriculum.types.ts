export type AwardingBody = {
  id: string;
  name: string;
  code: 'CAIE' | 'PEARSON' | 'AQA';
  website: string;
};

export type Syllabus = {
  id: string;
  awardingBodyId: string;
  subjectName: string;
  subjectCode: string;
  versionYears: string; // e.g. '2026-2028'
  tierOptions: ('Core' | 'Extended')[];
};

export type Topic = {
  id: string;
  syllabusId: string;
  parentTopicId?: string | null;
  code: string;
  name: string;
  sequence: number;
};

export type LearningObjective = {
  id: string;
  topicId: string;
  code: string; // e.g. '0580-1.1'
  objectiveText: string;
  commandWord: string;
  tier: 'Core' | 'Extended' | 'Both';
  sequence: number;
};

export type FSRSItem = {
  id: string;
  studentId: string;
  objectiveId: string;
  stability: number;
  difficulty: number;
  retrievability: number;
  lastReviewedAt: string;
  dueAt: string;
  reps: number;
  lapses: number;
  status: 'New' | 'Learning' | 'Review' | 'Mastered';
};
