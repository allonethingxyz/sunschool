CREATE TABLE IF NOT EXISTS prompt_log (
  id TEXT PRIMARY KEY,
  lesson_id TEXT REFERENCES lessons(id) ON DELETE CASCADE,
  learner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  prompt_type TEXT NOT NULL,
  system_message TEXT NOT NULL,
  user_message TEXT NOT NULL,
  model TEXT NOT NULL,
  temperature REAL,
  response_preview TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_prompt_log_lesson_id ON prompt_log(lesson_id);
CREATE INDEX idx_prompt_log_learner_id ON prompt_log(learner_id);
CREATE INDEX idx_prompt_log_type ON prompt_log(prompt_type);
