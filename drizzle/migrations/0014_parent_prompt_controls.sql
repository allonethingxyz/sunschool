ALTER TABLE learner_profiles ADD COLUMN IF NOT EXISTS parent_prompt_guidelines TEXT;
ALTER TABLE learner_profiles ADD COLUMN IF NOT EXISTS content_restrictions TEXT;
ALTER TABLE learner_profiles ADD COLUMN IF NOT EXISTS require_lesson_approval BOOLEAN DEFAULT false;
