-- Migration: Unify spec columns
-- Merges enhanced_spec and spec into a single spec column of EnhancedLessonSpec shape.
-- Adds partial unique index to prevent multiple ACTIVE lessons per learner.

-- Step 1: For lessons that have enhanced_spec, copy it into the spec column
UPDATE lessons
SET spec = enhanced_spec
WHERE enhanced_spec IS NOT NULL;

-- Step 2: For old lessons with only legacy spec (no enhanced_spec),
-- wrap the legacy spec into a minimal EnhancedLessonSpec shape
UPDATE lessons
SET spec = jsonb_build_object(
  'title', COALESCE(spec->>'title', 'Untitled Lesson'),
  'targetGradeLevel', 3,
  'summary', COALESCE(spec->>'content', ''),
  'sections', jsonb_build_array(
    jsonb_build_object(
      'title', COALESCE(spec->>'title', 'Lesson'),
      'content', COALESCE(spec->>'content', ''),
      'type', 'key_concepts'
    )
  ),
  'questions', COALESCE((spec->'questions')::jsonb, '[]'::jsonb),
  'images', '[]'::jsonb,
  'diagrams', '[]'::jsonb,
  'keywords', '[]'::jsonb,
  'relatedTopics', '[]'::jsonb,
  'estimatedDuration', 10,
  'difficultyLevel', 'beginner'
)
WHERE enhanced_spec IS NULL
  AND spec IS NOT NULL;

-- Step 3: Mark lessons with neither spec as DONE (broken data)
UPDATE lessons
SET status = 'DONE', score = 0
WHERE spec IS NULL AND enhanced_spec IS NULL AND status != 'DONE';

-- Step 4: Drop the enhanced_spec column
ALTER TABLE lessons DROP COLUMN IF EXISTS enhanced_spec;

-- Step 5: Make module_id nullable (it's always "custom-{ts}" — meaningless)
ALTER TABLE lessons ALTER COLUMN module_id DROP NOT NULL;

-- Step 6: Add partial unique index — only one ACTIVE lesson per learner
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_per_learner
  ON lessons (learner_id) WHERE status = 'ACTIVE';
