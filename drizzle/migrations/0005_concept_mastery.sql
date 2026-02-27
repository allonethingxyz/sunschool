-- Migration: Concept Mastery Tracking
-- Purpose: Track learner mastery of individual concepts for adaptive learning

CREATE TABLE IF NOT EXISTS concept_mastery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  concept_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  correct_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  mastery_level INTEGER NOT NULL DEFAULT 0,
  last_tested TIMESTAMP DEFAULT NOW(),
  needs_reinforcement BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (learner_id, concept_name, subject)
);

CREATE INDEX IF NOT EXISTS idx_learner_mastery ON concept_mastery (learner_id, subject);
CREATE INDEX IF NOT EXISTS idx_needs_reinforcement ON concept_mastery (learner_id, needs_reinforcement);
