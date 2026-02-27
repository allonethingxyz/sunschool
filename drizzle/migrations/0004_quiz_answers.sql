-- Migration: Quiz Answer Tracking
-- Purpose: Store individual quiz answers for analytics and reinforcement learning

CREATE TABLE IF NOT EXISTS quiz_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  question_index INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  question_hash VARCHAR(64) NOT NULL,
  user_answer INTEGER NOT NULL,
  correct_answer INTEGER NOT NULL,
  is_correct BOOLEAN NOT NULL,
  concept_tags TEXT[],
  answered_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learner_answers ON quiz_answers (learner_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_lesson_answers ON quiz_answers (lesson_id);
CREATE INDEX IF NOT EXISTS idx_question_hash ON quiz_answers (question_hash);
