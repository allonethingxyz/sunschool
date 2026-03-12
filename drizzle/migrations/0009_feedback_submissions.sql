-- Migration: Add feedback_submissions table for support/feedback form
CREATE TABLE IF NOT EXISTS feedback_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  email VARCHAR(255),
  user_id INTEGER,
  user_agent TEXT,
  page VARCHAR(512),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback_submissions (created_at DESC);
