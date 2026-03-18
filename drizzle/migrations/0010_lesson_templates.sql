-- Migration: Add lesson_templates table for shared lesson library
-- Lessons and quizzes are generated once and served to many learners.
-- Only results (scores, answers) remain per-learner.

CREATE TABLE IF NOT EXISTS lesson_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash VARCHAR(64) NOT NULL,
  subject TEXT NOT NULL,
  grade_level INTEGER NOT NULL,
  topic TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'beginner',
  spec JSONB NOT NULL,
  title TEXT NOT NULL,
  times_served INTEGER NOT NULL DEFAULT 0,
  avg_score INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_template_content_hash
  ON lesson_templates (content_hash);

CREATE INDEX IF NOT EXISTS idx_template_subject_grade
  ON lesson_templates (subject, grade_level, difficulty);

CREATE INDEX IF NOT EXISTS idx_template_topic
  ON lesson_templates (topic);

-- Add template reference to existing lessons table
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS template_id UUID
  REFERENCES lesson_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lesson_template
  ON lessons (template_id);
