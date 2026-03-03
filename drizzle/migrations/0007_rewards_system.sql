-- Rewards System Migration
-- Adds: double-or-loss mode, goal savings tracking, repeatable rewards

-- 1. Double-or-loss flag on learner_profiles
ALTER TABLE learner_profiles
  ADD COLUMN IF NOT EXISTS double_or_loss_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Goal savings: how many points each learner has saved toward each reward
CREATE TABLE IF NOT EXISTS reward_goal_savings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_id      UUID NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  saved_points   INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(learner_id, reward_id)
);

CREATE INDEX IF NOT EXISTS idx_goal_savings_learner ON reward_goal_savings(learner_id);
CREATE INDEX IF NOT EXISTS idx_goal_savings_reward  ON reward_goal_savings(reward_id);

-- 3. Enrich reward_redemptions for repeatable rewards and approval workflow
ALTER TABLE reward_redemptions
  ADD COLUMN IF NOT EXISTS times_redeemed  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS approved_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parent_notes    TEXT;

-- status values: PENDING | APPROVED | REJECTED
-- (existing rows stay PENDING; cash-in flow moves them to APPROVED)

-- 4. Allow negative amounts in points_ledger for REDEMPTION deductions
-- (Remove the CHECK constraint if it exists — Postgres allows this via a DO block)
DO $$
BEGIN
  -- Drop any CHECK constraint on points_ledger.amount if present
  -- (The constraint name may vary, so we iterate pg_constraint)
  DECLARE
    r RECORD;
  BEGIN
    FOR r IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'points_ledger'::regclass
        AND contype = 'c'
        AND conname LIKE '%amount%'
    LOOP
      EXECUTE 'ALTER TABLE points_ledger DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
  END;
END$$;

-- 5. Add source_type value 'DOUBLE_OR_LOSS_DEDUCTION' and 'GOAL_DELEGATION'
-- (TEXT column, no enum — nothing to change)

-- 6. Ensure rewards.id is UUID (already is from 0002 migration)
-- Add image_url column for reward icons/badges (optional, for richer UI)
ALTER TABLE rewards
  ADD COLUMN IF NOT EXISTS image_emoji   TEXT DEFAULT '🎁',
  ADD COLUMN IF NOT EXISTS color         TEXT DEFAULT '#4A90D9';
