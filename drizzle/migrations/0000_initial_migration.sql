DO $$ BEGIN
  CREATE TYPE "user_role" AS ENUM ('ADMIN', 'PARENT', 'LEARNER');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "lesson_status" AS ENUM ('QUEUED', 'ACTIVE', 'DONE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "users" (
  "id" SERIAL PRIMARY KEY,
  "email" VARCHAR UNIQUE,
  "username" TEXT UNIQUE,
  "name" TEXT,
  "role" user_role DEFAULT 'LEARNER',
  "password" TEXT,
  "parent_id" INTEGER REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "learner_profiles" (
  "id" TEXT PRIMARY KEY,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "grade_level" INTEGER NOT NULL,
  "graph" JSON,
  "subjects" JSON DEFAULT '["Math", "Science"]',
  "subject_performance" JSON DEFAULT '{}',
  "recommended_subjects" JSON DEFAULT '[]',
  "struggling_areas" JSON DEFAULT '[]',
  "created_at" TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "lessons" (
  "id" TEXT PRIMARY KEY,
  "learner_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "module_id" TEXT NOT NULL,
  "status" lesson_status NOT NULL DEFAULT 'QUEUED',
  "subject" TEXT,
  "category" TEXT,
  "difficulty" TEXT DEFAULT 'beginner',
  "image_paths" JSON,
  "spec" JSON,
  "enhanced_spec" JSON,
  "score" INTEGER,
  "created_at" TIMESTAMP DEFAULT now(),
  "completed_at" TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "achievements" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "learner_id" VARCHAR NOT NULL,
  "type" TEXT NOT NULL,
  "payload" JSON,
  "awarded_at" TIMESTAMP DEFAULT now()
);
