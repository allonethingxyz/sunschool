-- Migration: Schema alignment
-- Ensures production database matches shared/schema.ts regardless of
-- what state the initial migration left things in.

-- Sessions table (required for auth, may be missing)
CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire);

-- Ensure users columns are nullable (learner accounts don't have email/password)
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
ALTER TABLE users ALTER COLUMN name DROP NOT NULL;
ALTER TABLE users ALTER COLUMN username DROP NOT NULL;
ALTER TABLE users ALTER COLUMN role DROP NOT NULL;

-- Add missing columns to lessons table
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'beginner';
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS image_paths JSON;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS enhanced_spec JSON;

-- Add missing columns to learner_profiles table
ALTER TABLE learner_profiles ADD COLUMN IF NOT EXISTS subjects JSON DEFAULT '["Math", "Science"]';
ALTER TABLE learner_profiles ADD COLUMN IF NOT EXISTS subject_performance JSON DEFAULT '{}';
ALTER TABLE learner_profiles ADD COLUMN IF NOT EXISTS recommended_subjects JSON DEFAULT '[]';
ALTER TABLE learner_profiles ADD COLUMN IF NOT EXISTS struggling_areas JSON DEFAULT '[]';

-- db_sync_configs table (may be missing if 0001 wasn't run)
DO $$ BEGIN
  CREATE TYPE "sync_status" AS ENUM ('IDLE', 'IN_PROGRESS', 'FAILED', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "db_sync_configs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "parent_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "target_db_url" TEXT NOT NULL,
  "last_sync_at" TIMESTAMP,
  "sync_status" sync_status NOT NULL DEFAULT 'IDLE',
  "continuous_sync" BOOLEAN NOT NULL DEFAULT false,
  "error_message" TEXT,
  "created_at" TIMESTAMP DEFAULT now(),
  "updated_at" TIMESTAMP DEFAULT now()
);
