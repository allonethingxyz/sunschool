-- Migration: Add lesson_validation_log table for tracking validation pass/fail results
-- Enables analytics on rejection patterns, per-model failure rates, and subject-level quality.

CREATE TABLE IF NOT EXISTS lesson_validation_log (
  id SERIAL PRIMARY KEY,
  subject TEXT,
  topic TEXT,
  grade_level INTEGER,
  model TEXT,
  passed BOOLEAN NOT NULL,
  rejection_reason TEXT,
  spec_snapshot JSON,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_validation_log_created
  ON lesson_validation_log (created_at);

CREATE INDEX IF NOT EXISTS idx_validation_log_passed
  ON lesson_validation_log (passed);

CREATE INDEX IF NOT EXISTS idx_validation_log_subject
  ON lesson_validation_log (subject);
