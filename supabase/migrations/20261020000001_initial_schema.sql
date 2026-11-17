-- =====================================================================
-- Open Homeschool Core Schema v2 (Dynamic, Multi-Board, Private-Candidate Safe)
-- =====================================================================

-- 1. Households & Profiles (Role-Based Access: Developer, Parent/Marker, Student)
CREATE TABLE IF NOT EXISTS households (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    country_code CHAR(2) NOT NULL DEFAULT 'TZ', -- ISO country code (e.g. 'TZ' for Tanzania, 'ZW' for Zimbabwe)
    cambridge_admin_zone INT NOT NULL DEFAULT 3 CHECK (cambridge_admin_zone BETWEEN 1 AND 6), -- Zone 3 for TZ/ZW
    timezone TEXT NOT NULL DEFAULT 'Africa/Dar_es_Salaam',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES households(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('developer_admin', 'parent_educator', 'student')),
    year_group TEXT, -- e.g. 'Form 2 / Stage 8'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Awarding Bodies & Qualifications (CAIE, Edexcel, Lower Secondary, IGCSE)
CREATE TABLE IF NOT EXISTS awarding_bodies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL, -- 'CAIE', 'EDEXCEL'
    website TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS qualifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    awarding_body_id UUID REFERENCES awarding_bodies(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- 'Cambridge IGCSE', 'Cambridge Lower Secondary', 'Edexcel International GCSE'
    code TEXT UNIQUE NOT NULL, -- 'CAIE-IGCSE', 'CAIE-LOWER-SEC'
    grade_scale JSONB NOT NULL DEFAULT '["A*","A","B","C","D","E","F","G"]',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Subjects Separated from Syllabus Versions
CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qualification_id UUID REFERENCES qualifications(id) ON DELETE CASCADE,
    subject_name TEXT NOT NULL, -- 'Mathematics', 'Geography', 'Spanish', 'Chemistry'
    subject_code TEXT NOT NULL, -- '0580', '0460', '0530', '0620'
    category TEXT NOT NULL CHECK (category IN ('STEM', 'Languages', 'Humanities', 'Creative_Elective')),
    mastery_mode TEXT NOT NULL DEFAULT 'topic_objective' CHECK (mastery_mode IN ('topic_objective', 'skill_rubric', 'hybrid')),
    is_core BOOLEAN DEFAULT TRUE,
    UNIQUE(qualification_id, subject_code)
);

CREATE TABLE IF NOT EXISTS syllabus_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
    version_label TEXT NOT NULL, -- '2027-2029', '2028-2030 (v2)'
    exam_year_start INT NOT NULL,
    exam_year_end INT NOT NULL,
    available_tiers JSONB NOT NULL DEFAULT '["Untiered"]', -- e.g. ["Core", "Extended"] or ["Untiered"]
    status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'superseded')),
    source_pdf_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(subject_id, version_label)
);

-- 4. Components & Private-Candidate Safe Entry Routes
CREATE TABLE IF NOT EXISTS components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    syllabus_version_id UUID REFERENCES syllabus_versions(id) ON DELETE CASCADE,
    component_code TEXT NOT NULL, -- 'Paper 1', 'Paper 2', 'Paper 4', 'Paper 6'
    name TEXT NOT NULL,
    assessment_type TEXT NOT NULL CHECK (assessment_type IN ('Written', 'AlternativeToPractical', 'AlternativeToCoursework', 'Speaking', 'Practical', 'Coursework')),
    duration_minutes INT NOT NULL,
    max_marks INT NOT NULL,
    private_candidate_eligible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(syllabus_version_id, component_code)
);

CREATE TABLE IF NOT EXISTS entry_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    syllabus_version_id UUID REFERENCES syllabus_versions(id) ON DELETE CASCADE,
    route_code TEXT NOT NULL, -- e.g. 'EXT-ATP' (Extended with Alternative to Practical Paper 6)
    name TEXT NOT NULL, -- 'Extended Tier (Papers 2, 4, 6 - Private Candidate Route)'
    tier TEXT DEFAULT 'Untiered',
    private_candidate_eligible BOOLEAN DEFAULT TRUE,
    UNIQUE(syllabus_version_id, route_code)
);

CREATE TABLE IF NOT EXISTS entry_route_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_route_id UUID REFERENCES entry_routes(id) ON DELETE CASCADE,
    component_id UUID REFERENCES components(id) ON DELETE CASCADE,
    weighting_percent NUMERIC(5,2) NOT NULL,
    UNIQUE(entry_route_id, component_id)
);

-- 5. Academic Terms, Mid-Terms, Finals & Term Subject Enrollments
CREATE TABLE IF NOT EXISTS academic_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id UUID REFERENCES households(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- '2026/2027 - Term 1', '2026/2027 - Term 2'
    start_date DATE NOT NULL,
    midterm_exam_start DATE,
    midterm_exam_end DATE,
    final_exam_start DATE,
    final_exam_end DATE,
    end_date DATE NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('upcoming', 'active', 'completed'))
);

CREATE TABLE IF NOT EXISTS learner_term_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    academic_term_id UUID REFERENCES academic_terms(id) ON DELETE CASCADE,
    entry_route_id UUID REFERENCES entry_routes(id) ON DELETE CASCADE,
    is_elective BOOLEAN DEFAULT FALSE, -- e.g. TRUE for Spanish 0530 or term niche subject
    weekly_allocated_minutes INT NOT NULL DEFAULT 240,
    target_grade TEXT NOT NULL DEFAULT 'A',
    target_exam_series TEXT, -- 'June 2028', 'November 2028'
    UNIQUE(student_id, academic_term_id, entry_route_id)
);

-- 6. Assessment Objectives (Skill Rubrics for Languages/Humanities) & Topics
CREATE TABLE IF NOT EXISTS assessment_objectives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    syllabus_version_id UUID REFERENCES syllabus_versions(id) ON DELETE CASCADE,
    code TEXT NOT NULL, -- 'AO1', 'AO2', 'AO3'
    name TEXT NOT NULL,
    description TEXT,
    weighting_percent NUMERIC(5,2),
    UNIQUE(syllabus_version_id, code)
);

CREATE TABLE IF NOT EXISTS topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    syllabus_version_id UUID REFERENCES syllabus_versions(id) ON DELETE CASCADE,
    parent_topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
    topic_code TEXT NOT NULL,
    name TEXT NOT NULL,
    sequence INT NOT NULL DEFAULT 0,
    UNIQUE(syllabus_version_id, topic_code)
);

CREATE TABLE IF NOT EXISTS learning_objectives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
    previous_version_objective_id UUID REFERENCES learning_objectives(id) ON DELETE SET NULL, -- Lineage across syllabus updates
    objective_code TEXT NOT NULL,
    summary_title TEXT NOT NULL,
    official_description TEXT NOT NULL,
    command_words JSONB DEFAULT '[]', -- e.g. ["Describe", "Explain", "Calculate"]
    tier TEXT DEFAULT 'Untiered',
    sequence INT NOT NULL DEFAULT 0,
    UNIQUE(topic_id, objective_code)
);

-- 7. Dynamic Question Templates, Term Exams & Mistake Notebook (Zero Hardcoding)
CREATE TABLE IF NOT EXISTS question_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    objective_id UUID REFERENCES learning_objectives(id) ON DELETE CASCADE,
    assessment_objective_id UUID REFERENCES assessment_objectives(id) ON DELETE SET NULL,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Parent or Admin
    question_type TEXT NOT NULL CHECK (question_type IN ('MCQ', 'Structured', 'CalculationTemplate', 'EssayRubric', 'PracticalSkill', 'CommandWordDrill')),
    prompt_template TEXT NOT NULL, -- Supports Markdown/KaTeX and dynamic {{vars}}
    parameter_schema JSONB, -- For dynamic math/science number generation
    options_schema JSONB,
    mark_scheme_rubric TEXT NOT NULL,
    max_marks INT NOT NULL DEFAULT 1,
    difficulty TEXT DEFAULT 'Standard' CHECK (difficulty IN ('Intro', 'Standard', 'ExamLevel')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS term_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_term_id UUID REFERENCES academic_terms(id) ON DELETE CASCADE,
    entry_route_id UUID REFERENCES entry_routes(id) ON DELETE CASCADE,
    component_id UUID REFERENCES components(id) ON DELETE SET NULL,
    assessment_category TEXT NOT NULL CHECK (assessment_category IN ('WeeklyQuiz', 'TopicTest', 'MidTermExam', 'FinalTermExam', 'TimedPastPaper')),
    title TEXT NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 60,
    total_marks INT NOT NULL,
    scheduled_date DATE,
    status TEXT DEFAULT 'Scheduled' CHECK (status IN ('Draft', 'Scheduled', 'Submitted', 'Marked')),
    student_score NUMERIC(5,2),
    marked_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    parent_overall_feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Mistake Log / Error Notebook (Automatically populated on lost marks)
CREATE TABLE IF NOT EXISTS mistake_notebook (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    objective_id UUID REFERENCES learning_objectives(id) ON DELETE CASCADE,
    term_assessment_id UUID REFERENCES term_assessments(id) ON DELETE SET NULL,
    error_category TEXT NOT NULL CHECK (error_category IN ('ConceptGap', 'CommandWordMisread', 'CalculationSlip', 'IncompleteExplanation', 'TimePressure')),
    question_snapshot TEXT NOT NULL,
    student_wrong_answer TEXT,
    correct_model_answer TEXT NOT NULL,
    student_reflection TEXT,
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Append-Only Learning Events Log & Derived FSRS Retention State
CREATE TABLE IF NOT EXISTS learning_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    objective_id UUID REFERENCES learning_objectives(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('Exposure_Lesson', 'Active_Recall', 'Application_Question', 'Formal_Assessment', 'Error_Correction')),
    score_ratio NUMERIC(5,4) NOT NULL, -- 0.0000 to 1.0000
    actual_minutes_spent INT NOT NULL DEFAULT 0,
    flagged_stuck BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fsrs_retention_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    objective_id UUID REFERENCES learning_objectives(id) ON DELETE CASCADE,
    stability NUMERIC(8,4) NOT NULL DEFAULT 0.0,
    difficulty NUMERIC(5,2) NOT NULL DEFAULT 5.0,
    retrievability NUMERIC(5,4) NOT NULL DEFAULT 0.0,
    exposure_score NUMERIC(5,2) DEFAULT 0,
    recall_score NUMERIC(5,2) DEFAULT 0,
    application_score NUMERIC(5,2) DEFAULT 0,
    assessment_score NUMERIC(5,2) DEFAULT 0,
    composite_mastery NUMERIC(5,2) DEFAULT 0,
    reps INT NOT NULL DEFAULT 0,
    lapses INT NOT NULL DEFAULT 0,
    last_reviewed_at TIMESTAMPTZ,
    due_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'New' CHECK (status IN ('New', 'Learning', 'Review', 'Mastered')),
    UNIQUE(student_id, objective_id)
);

-- 10. Educational Resources, Activities, Evidence & Kiosk Lock
CREATE TABLE IF NOT EXISTS resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    resource_type TEXT CHECK (resource_type IN ('YouTubeVideo', 'OER_Reading', 'PhETSim', 'PastPaperReference', 'TriviaDoc')),
    external_url TEXT,
    youtube_video_id TEXT,
    start_timestamp_seconds INT DEFAULT 0,
    end_timestamp_seconds INT,
    is_sandboxed BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    objective_id UUID REFERENCES learning_objectives(id) ON DELETE CASCADE,
    resource_id UUID REFERENCES resources(id) ON DELETE SET NULL,
    activity_type TEXT CHECK (activity_type IN ('Lesson', 'Reading', 'Video', 'PracticalSim', 'WritingDraft', 'SpacedReview')),
    title TEXT NOT NULL,
    instructions TEXT,
    estimated_minutes INT NOT NULL DEFAULT 30,
    difficulty TEXT DEFAULT 'Standard' CHECK (difficulty IN ('Introductory', 'Standard', 'Challenging')),
    sequence INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence_portfolio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    objective_id UUID REFERENCES learning_objectives(id) ON DELETE CASCADE,
    activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
    parent_submission_id UUID REFERENCES evidence_portfolio(id) ON DELETE SET NULL, -- Revision chain for corrections
    file_path TEXT,
    typed_response TEXT, -- For English/History essays & Spanish writing
    word_count INT,
    student_notes TEXT,
    evaluation_status TEXT DEFAULT 'Submitted' CHECK (evaluation_status IN ('Submitted', 'Approved', 'NeedsCorrection')),
    parent_feedback TEXT,
    marked_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kiosk_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    is_locked BOOLEAN DEFAULT FALSE,
    active_subject TEXT,
    active_topic_code TEXT,
    unfocused_count INT DEFAULT 0,
    student_stuck_alert BOOLEAN DEFAULT FALSE,
    session_start TIMESTAMPTZ,
    session_end TIMESTAMPTZ,
    parent_unlock_pin_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Realtime for Live Kiosk Synchronization
ALTER PUBLICATION supabase_realtime ADD TABLE kiosk_sessions;