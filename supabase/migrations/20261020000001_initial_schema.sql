CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Awarding Bodies
CREATE TABLE IF NOT EXISTS awarding_bodies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    website TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Syllabuses
CREATE TABLE IF NOT EXISTS syllabuses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    awarding_body_id UUID REFERENCES awarding_bodies(id) ON DELETE CASCADE,
    subject_name TEXT NOT NULL,
    subject_code TEXT NOT NULL,
    syllabus_version TEXT NOT NULL,
    exam_year_start INT NOT NULL,
    exam_year_end INT NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(subject_code, syllabus_version)
);

-- 3. Components
CREATE TABLE IF NOT EXISTS components (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    syllabus_id UUID REFERENCES syllabuses(id) ON DELETE CASCADE,
    component_code TEXT NOT NULL,
    name TEXT NOT NULL,
    duration_minutes INT NOT NULL,
    max_marks INT NOT NULL,
    weighting NUMERIC(5,2) NOT NULL,
    tier TEXT DEFAULT 'Both' CHECK (tier IN ('Core', 'Extended', 'Both')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Assessment Objectives (AOs)
CREATE TABLE IF NOT EXISTS assessment_objectives (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    syllabus_id UUID REFERENCES syllabuses(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    weighting NUMERIC(5,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Topics (Hierarchical Subtopics)
CREATE TABLE IF NOT EXISTS topics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    syllabus_id UUID REFERENCES syllabuses(id) ON DELETE CASCADE,
    parent_topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
    topic_code TEXT NOT NULL,
    name TEXT NOT NULL,
    sequence INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Learning Objectives
CREATE TABLE IF NOT EXISTS learning_objectives (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    topic_id UUID REFERENCES topics(id) ON DELETE CASCADE,
    objective_code TEXT NOT NULL,
    objective_text TEXT NOT NULL,
    command_word TEXT,
    tier TEXT DEFAULT 'Both' CHECK (tier IN ('Core', 'Extended', 'Both')),
    sequence INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Educational Resources & Video Sandboxing
CREATE TABLE IF NOT EXISTS resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    resource_type TEXT CHECK (resource_type IN ('YouTubeVideo', 'OpenStaxReading', 'PhETSim', 'WorksheetRef', 'TriviaDoc')),
    external_url TEXT,
    youtube_video_id TEXT,
    start_timestamp_seconds INT DEFAULT 0,
    end_timestamp_seconds INT,
    citation_reference TEXT,
    is_sandboxed BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Learning Activities Linked to Objectives
CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    objective_id UUID REFERENCES learning_objectives(id) ON DELETE CASCADE,
    resource_id UUID REFERENCES resources(id) ON DELETE SET NULL,
    activity_type TEXT CHECK (activity_type IN ('Lesson', 'Reading', 'Video', 'PracticalSim', 'CodingExercise', 'SpacedReview')),
    title TEXT NOT NULL,
    instructions TEXT,
    estimated_minutes INT NOT NULL DEFAULT 30,
    difficulty TEXT DEFAULT 'Standard' CHECK (difficulty IN ('Introductory', 'Standard', 'Challenging')),
    sequence INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. FSRS Retention Engine State
CREATE TABLE IF NOT EXISTS fsrs_retention_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL,
    objective_id UUID REFERENCES learning_objectives(id) ON DELETE CASCADE,
    stability NUMERIC(8,4) NOT NULL DEFAULT 0.0,
    difficulty NUMERIC(5,2) NOT NULL DEFAULT 5.0,
    retrievability NUMERIC(5,4) NOT NULL DEFAULT 0.0,
    reps INT NOT NULL DEFAULT 0,
    lapses INT NOT NULL DEFAULT 0,
    last_reviewed_at TIMESTAMPTZ,
    due_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'New' CHECK (status IN ('New', 'Learning', 'Review', 'Mastered')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, objective_id)
);

-- 10. Kiosk Lock State (Parent-Controlled Device Lock)
CREATE TABLE IF NOT EXISTS kiosk_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL,
    is_locked BOOLEAN DEFAULT FALSE,
    active_subject TEXT,
    active_topic_code TEXT,
    unfocused_count INT DEFAULT 0,
    session_start TIMESTAMPTZ,
    session_end TIMESTAMPTZ,
    parent_unlock_pin_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Student Evidence Portfolio (Storage Buckets)
CREATE TABLE IF NOT EXISTS evidence_portfolio (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL,
    objective_id UUID REFERENCES learning_objectives(id) ON DELETE CASCADE,
    activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
    file_path TEXT NOT NULL,
    file_mime TEXT NOT NULL,
    file_size_bytes INT NOT NULL,
    student_notes TEXT,
    evaluation_status TEXT DEFAULT 'Submitted' CHECK (evaluation_status IN ('Submitted', 'Approved', 'NeedsCorrection')),
    parent_feedback TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Realtime for Live Kiosk Synchronization
ALTER PUBLICATION supabase_realtime ADD TABLE kiosk_sessions;