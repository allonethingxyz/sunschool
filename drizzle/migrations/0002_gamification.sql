CREATE TABLE IF NOT EXISTS points_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  description TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_points_ledger_learner_created_at ON points_ledger (learner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_points_ledger_source ON points_ledger (source_type, source_id);

CREATE TABLE IF NOT EXISTS learner_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  current_balance INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_redeemed INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  token_cost INTEGER NOT NULL CHECK (token_cost > 0),
  category TEXT DEFAULT 'GENERAL',
  is_active BOOLEAN DEFAULT TRUE,
  max_redemptions INTEGER,
  current_redemptions INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rewards_parent_active ON rewards (parent_id, is_active);
CREATE INDEX IF NOT EXISTS idx_rewards_category_active ON rewards (category, is_active);

CREATE TABLE IF NOT EXISTS reward_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_id UUID NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  tokens_spent INTEGER NOT NULL,
  status TEXT DEFAULT 'PENDING',
  requested_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  parent_notes TEXT,
  learner_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_reward_redemptions_learner_status ON reward_redemptions (learner_id, status);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_reward_status ON reward_redemptions (reward_id, status);

CREATE TABLE IF NOT EXISTS learning_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT,
  target_type TEXT NOT NULL,
  target_value INTEGER NOT NULL,
  current_value INTEGER DEFAULT 0,
  is_completed BOOLEAN DEFAULT FALSE,
  deadline DATE,
  token_reward INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_learning_goals_learner_completed ON learning_goals (learner_id, is_completed);
CREATE INDEX IF NOT EXISTS idx_learning_goals_parent_completed ON learning_goals (parent_id, is_completed);

-- Alter achievements table to support token rewards
ALTER TABLE achievements
  ADD COLUMN IF NOT EXISTS token_reward INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_repeatable BOOLEAN DEFAULT FALSE;
