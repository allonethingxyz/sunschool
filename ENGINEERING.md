# SUNSCHOOL Engineering Documentation

Technical reference for the SUNSCHOOL platform. For setup and API reference, see [README.md](README.md). For UX roadmap, see [PLAN.md](PLAN.md).

## Architecture

**Frontend:** React 19.1.0 + TypeScript, React Native Web, React Query, Wouter, Vite
**Backend:** Node.js + Express.js 5.1.0, TypeScript, JWT auth, Drizzle ORM
**Database:** PostgreSQL (Neon serverless), JSONB fields for complex data
**Deployment:** Railway with NIXPACKS (Node 22), auto-deploy on push to `main`

### Project Structure

```
client/              React frontend (Vite build)
server/              Express.js backend
  services/          Business logic (AI, points, rewards, mastery, etc.)
  prompts/grades/    Grade-specific AI prompt templates (K-2, 3-4, 5-6, 7-8, 9+)
  config/            Environment vars (env.ts) and feature flags (flags.ts)
  bittensor.ts       Bittensor Subnet 1 client
shared/              TypeScript schemas and types (schema.ts)
drizzle/migrations/  Database migration SQL files (0000-0007)
scripts/             Admin onboarding, password reset, migrations
tests/e2e/           Playwright end-to-end tests
```

## Database Schema

### Core Tables

```sql
-- Users: ADMIN, PARENT, LEARNER roles
users (id, email, username, name, role, password, parent_id, created_at)

-- Learner academic profiles
learner_profiles (id, user_id, grade_level, graph, subjects, subject_performance,
                  recommended_subjects, struggling_areas, created_at)

-- AI-generated lessons
lessons (id, learner_id, module_id, status[QUEUED|ACTIVE|DONE], subject, category,
         difficulty, image_paths, spec, enhanced_spec, score, created_at, completed_at)

-- Quiz answer tracking with concept tagging
quiz_answers (id, learner_id, lesson_id, question_index, question_text, question_hash,
              user_answer, correct_answer, is_correct, concept_tags[], answered_at)
-- Indexes: learner_id, question_hash (dedup), concept_tags (GIN)

-- Achievements with token rewards
achievements (id, learner_id, type, payload, token_reward, is_repeatable, awarded_at)

-- Sessions and DB sync
sessions (sid, sess, expire)
db_sync_configs (id, parent_id, target_db_url, last_sync_at, sync_status, continuous_sync, error_message)
```

### Gamification Tables

```sql
-- Point transactions (earned and spent)
points_ledger (id, learner_id, amount, source_type, source_id, description, created_at)
-- source_type: QUIZ_CORRECT, LESSON_COMPLETE, ACHIEVEMENT, REDEMPTION,
--              ADMIN_ADJUST, DOUBLE_OR_LOSS_DEDUCTION, GOAL_DELEGATION

-- Running balance per learner
learner_points (id, learner_id[unique], current_balance, total_earned, total_redeemed)

-- Parent-managed reward catalog
rewards (id, parent_id, title, description, token_cost, category, is_active,
         max_redemptions, current_redemptions, emoji, color)

-- Redemption requests with approval workflow
reward_redemptions (id, learner_id, reward_id, tokens_spent, status[PENDING|APPROVED|REJECTED],
                    requested_at, completed_at, parent_notes, learner_notes)

-- Saving toward specific rewards
reward_goal_savings (id, learner_id, reward_id, saved_amount)

-- Parent-set learning goals
learning_goals (id, learner_id, parent_id, title, description, subject, target_type,
                target_value, current_value, is_completed, deadline, token_reward)
```

## AI Integration

### Providers

| Provider | Purpose | Config |
|----------|---------|--------|
| **OpenRouter** (primary) | Lesson content, quiz generation, image models | `OPENROUTER_API_KEY` |
| **Perplexity** | Knowledge context enrichment | `PERPLEXITY_API_KEY` |
| **Bittensor Subnet 1** (experimental) | Decentralized LLM alternative | `BITTENSOR_API_KEY`, `LLM_PROVIDER=bittensor` |

Provider selection is handled by `server/services/ai.ts` with automatic fallback from Bittensor to OpenRouter.

### Feature Flags (`server/config/flags.ts`)

- `ENABLE_BITTENSOR_SUBNET_1` — Master switch for Bittensor
- `BITTENSOR_FALLBACK_ENABLED` — Auto-fallback to OpenRouter on failure
- `USE_AI` — Enable/disable AI features entirely (set `0` for static fallback content)

### Lesson Generation Pipeline

1. Frontend sends `POST /api/lessons/create` with subject, category, grade level, learnerId
2. Server validates parent-child permissions
3. AI generates lesson content (Key Concepts, Examples, Practice) using grade-specific prompts
4. Quiz questions (3 multiple-choice, 4 options each) generated with concept tags
5. SVG illustrations generated via `svg-llm-service.ts` (sanitized with DOMPurify)
6. Lesson stored with status `ACTIVE`

### Content Validation (`server/services/content-validator.ts`)

- Flesch-Kincaid readability scoring per grade band
- Grade-specific banned vocabulary (30+ words per band)
- Sentence length limits: K-2 (5 words), 3-4 (10 words), 5-6 (15 words)
- Up to 3 retry attempts with LLM feedback on validation failures

### Adaptive Learning

- **Concept mastery tracking** — Per-concept accuracy across all quiz attempts
- **Question deduplication** — SHA-256 hashing prevents repeat questions (30-day window)
- **Spaced repetition** — Weak concepts prioritized in future quiz generation
- **Subject recommendations** — Category mapping service suggests next topics

### Bittensor Integration

Files: `server/bittensor.ts` (client), `server/services/ai.ts` (provider abstraction), `server/config/env.ts` (config)

```bash
# Enable Bittensor as primary provider
export ENABLE_BITTENSOR_SUBNET_1=1
export LLM_PROVIDER=bittensor
export BITTENSOR_API_KEY=your_key
export BITTENSOR_WALLET_NAME=your_wallet
export BITTENSOR_WALLET_HOTKEY=your_hotkey
export BITTENSOR_FALLBACK_ENABLED=1  # fallback to OpenRouter
```

**Status:** Client and config implemented (Phases 1-3 complete). Testing/validation (Phase 4) and production deployment (Phase 5) pending.

## Deployment

### Railway (Production)

Config files: `railway.json` (builder, health checks), `nixpacks.toml` (Node 22, build steps)

Build pipeline: `npm ci` → `cd client && npx vite build` → `npx tsc` → `node dist/server/index.js`

Health check: `GET /api/healthcheck` (60s timeout, restart on failure, max 3 retries)

### Environment Variables

**Required:**
```env
DATABASE_URL=postgresql://user:password@host:port/database
JWT_SECRET=your-jwt-secret-key
SESSION_SECRET=your-session-secret
OPENROUTER_API_KEY=your-openrouter-key
PORT=5000
```

**Optional:**
```env
PERPLEXITY_API_KEY=your-perplexity-key
NODE_ENV=development|production
USE_AI=1|0
LLM_PROVIDER=openrouter|bittensor
BITTENSOR_API_KEY=...
BITTENSOR_WALLET_NAME=...
BITTENSOR_WALLET_HOTKEY=...
```

### Database

- Neon serverless PostgreSQL with WebSocket connections
- Connection pooling (max 10), keep-alive pings every 2 min
- Migrations auto-run on startup; failures don't block server start
- Migration folder: `drizzle/migrations/` (0000-0007)
- First registered user auto-promoted to ADMIN

## Security Notes

From SAST scan (Bandit + Semgrep, Feb 2026):

| Priority | Finding | Status |
|----------|---------|--------|
| MEDIUM | CORS origin substring match (`server/auth.ts`) | Tighten to exact domain match |
| MEDIUM | TLS `rejectUnauthorized: false` (`server/db.ts`) | Enable in production with CA cert |
| MEDIUM | Path traversal in `image-storage.ts` | Add resolved path validation |
| LOW | SVG innerHTML rendering | Server-side DOMPurify mitigates; consider client-side pass |

SVG content is sanitized via DOMPurify in `server/services/svg-llm-service.ts` before storage. LLM prompts explicitly prohibit scripts, styles, and external references.

## Testing

- `npm test` — Jest unit tests
- `npx playwright test` — E2E tests (auto-starts local server)
- `PLAYWRIGHT_BASE_URL=https://sunschool.xyz npx playwright test` — E2E against production

E2E test (`tests/e2e/child-lesson-flow.spec.ts`) covers: parent registration, child creation, learner mode switch, lesson generation, quiz completion, results review. Timeout: 10 min (AI generation). Screenshots saved to `tests/e2e/screenshots/`.

## Troubleshooting

**Database connection:** Check `DATABASE_URL`, Neon dashboard status, connection pool limits in `server/db.ts`

**Migrations:** Run `npm run migrate` manually to debug. Check `drizzle/migrations/` exists. Failures are logged but don't block startup.

**Quiz errors:** Ensure `quiz_answers` table exists (migrations). Verify learner has active lesson. Check browser console.

**Build errors:** `npx tsc --noEmit` to check types. `rm -rf client/dist server/dist` to clear cache. `TS_NODE_TRANSPILE_ONLY=true` for deployment.

**Auth issues:** Verify `JWT_SECRET` is set. Check token expiration. Parent users scoped to own learners only.
