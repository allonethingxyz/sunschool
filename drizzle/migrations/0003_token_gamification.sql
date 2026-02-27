-- 0003_token_gamification.sql
-- Adds tables to support token-based activities and shareable award reports

BEGIN;

-- Catalog of redeemable activities/rewards
CREATE TABLE IF NOT EXISTS activities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  cost INTEGER NOT NULL CHECK (cost > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Learner awards/redemptions (one row per redemption of an activity)
CREATE TABLE IF NOT EXISTS awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id INTEGER NOT NULL REFERENCES activities(id),
  tokens_spent INTEGER NOT NULL CHECK (tokens_spent > 0),
  lesson_id TEXT REFERENCES lessons(id),
  status TEXT NOT NULL DEFAULT 'UNREDEEMED',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  cashed_in_at TIMESTAMP WITH TIME ZONE
);

-- Public sharing of award reports via random hash URL
CREATE TABLE IF NOT EXISTS award_shares (
  id SERIAL PRIMARY KEY,
  award_id UUID NOT NULL REFERENCES awards(id) ON DELETE CASCADE,
  parent_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  share_hash VARCHAR(40) NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT 'A Learner You Know Earned a Reward',
  description TEXT NOT NULL DEFAULT 'This learner completed a challenge and earned a reward!',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

COMMIT;
