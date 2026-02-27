-- Migration: Schema Alignment Safety Net
-- Purpose: Ensure production DB matches schema.ts even if earlier migrations
-- were partially applied or the DB was manually modified.

-- Fix users table: make columns nullable to match schema.ts
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN email TYPE VARCHAR USING email::VARCHAR;
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
ALTER TABLE users ALTER COLUMN name DROP NOT NULL;
ALTER TABLE users ALTER COLUMN username DROP NOT NULL;
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'LEARNER';

-- Fix learner_profiles: add missing columns
ALTER TABLE learner_profiles ADD COLUMN IF NOT EXISTS subjects JSON DEFAULT '["Math","Science"]';
ALTER TABLE learner_profiles ADD COLUMN IF NOT EXISTS subject_performance JSON DEFAULT '{}';
ALTER TABLE learner_profiles ADD COLUMN IF NOT EXISTS recommended_subjects JSON DEFAULT '[]';
ALTER TABLE learner_profiles ADD COLUMN IF NOT EXISTS struggling_areas JSON DEFAULT '[]';

-- Fix lessons: add missing columns
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'beginner';
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS image_paths JSON;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS enhanced_spec JSON;

-- Create sessions table (defined in schema.ts, missing from earlier migrations)
CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire);

-- Ensure db_sync_configs exists (may have been skipped if 0001 failed)
DO $$ BEGIN
  CREATE TYPE sync_status AS ENUM ('IDLE', 'IN_PROGRESS', 'FAILED', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS db_sync_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id VARCHAR NOT NULL,
  target_db_url TEXT NOT NULL,
  last_sync_at TIMESTAMP,
  sync_status sync_status NOT NULL DEFAULT 'IDLE',
  continuous_sync BOOLEAN NOT NULL DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
