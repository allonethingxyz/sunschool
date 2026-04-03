# SUNSCHOOL Engineering Documentation

Technical reference for the SUNSCHOOL platform. For setup and API reference, see [README.md](README.md). For UX roadmap, see [PLAN.md](PLAN.md). For user workflows, see [workflows.md](workflows.md).

## Architecture

**Frontend:** React 19.1.0 + TypeScript, React Native Web, React Query, Wouter, Vite
**Backend:** Node.js + Express.js 5.1.0, TypeScript, JWT auth, Drizzle ORM
**Database:** PostgreSQL (Neon serverless), JSONB fields for complex data
**Deployment:** Railway with NIXPACKS (Node 22), auto-deploy on push to `main`
**Live URL:** https://sunschool.xyz

### Project Structure

```
client/              React frontend (Vite build)
server/              Express.js backend
  services/          Business logic (AI, points, rewards, mastery, etc.)
  prompts/grades/    Grade-specific AI prompt templates (K-2, 3-4, 5-6, 7-8, 9+)
  config/            Environment vars (env.ts) and feature flags (flags.ts)
  bittensor.ts       Bittensor Subnet 1 client
shared/              TypeScript schemas and types (schema.ts)
drizzle/migrations/  Database migration SQL files (0000-0014)
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
                  recommended_subjects, struggling_areas,
                  parent_prompt_guidelines, content_restrictions, require_lesson_approval,
                  created_at)

-- AI-generated lessons (single unified spec column)
lessons (id, learner_id, module_id, status[QUEUED|ACTIVE|DONE], subject, category,
         difficulty, image_paths, spec, score, created_at, completed_at)
-- Constraint: idx_one_active_per_learner (partial unique on learner_id WHERE status='ACTIVE')

-- Quiz answer tracking with concept tagging
quiz_answers (id, learner_id, lesson_id, question_index, question_text, question_hash,
              user_answer, correct_answer, is_correct, concept_tags[], answered_at)
-- Indexes: learner_id, question_hash (dedup), concept_tags (GIN)

-- Achievements with token rewards
achievements (id, learner_id, type, payload, token_reward, is_repeatable, awarded_at)

-- Shared lesson content library (deduplication by content hash)
lesson_templates (id, content_hash, subject, grade_level, topic, difficulty, spec,
                  title, times_served, avg_score, created_at, updated_at)
-- Indexes: content_hash, (subject, grade_level, difficulty), topic

-- Prompt transparency log — tracks every LLM prompt for parent audit
prompt_log (id, lesson_id, learner_id, prompt_type, system_message, user_message,
            model, temperature, response_preview, tokens_used, created_at)
-- prompt_type: lesson_generation, quiz_generation, image_generation, svg_generation, feedback, knowledge_graph

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
- `ENABLE_SVG_LLM` — SVG illustration generation (default: on)
- `ENABLE_OPENROUTER_IMAGES` — OpenRouter raster image generation (default: on)

### Image Generation

`IMAGE_PROVIDER` env var controls the primary image strategy:

| Value | Behavior |
|-------|----------|
| `svg-llm` (default) | Generate SVG illustrations via LLM (configurable via `OPENROUTER_SVG_MODEL` env var) |
| `openrouter` | Generate raster images via OpenRouter multimodal models |
| `stability` | Use Stability AI API |

Model fallback chain: primary model (`OPENROUTER_SVG_MODEL`) → fallbacks from `SVG_MODEL_FALLBACKS` env → built-in defaults (`gemini-3.1-flash-lite-preview`, `gemini-3-flash-preview`). Models returning 402 (insufficient credits) or 404 are automatically skipped.

SVG prompts include lesson context (title, section content snippet capped at 300 chars, grade level) so illustrations are specific to what the student is reading. Labels and annotations are grade-appropriate. When all LLM models fail, a programmatic fallback (`server/services/programmatic-svg.ts`) produces topic-relevant SVGs with labeled diagrams based on keyword matching — not generic shapes.

### Lesson Generation Pipeline

1. Frontend sends `POST /api/lessons/create` with subject, category, grade level, learnerId
2. Server validates parent-child permissions
3. `generateLessonWithRetry()` calls AI up to 3 times with grade-specific prompts
4. `validateLessonSpec()` rejects placeholder/stub content — generation failures return 503 (never save stubs)
5. Single `EnhancedLessonSpec` stored as `spec` column with status `ACTIVE`
6. Background task generates SVG illustrations via `svg-llm-service.ts` (sanitized server-side)
7. Client polls via `refetchInterval` until images arrive

Key files:
- `server/services/enhanced-lesson-service.ts` — `generateLessonWithRetry()`, single generation path
- `server/services/lesson-validator.ts` — `validateLessonSpec()`, rejects stubs
- `server/services/svg-llm-service.ts` — SVG generation + sanitization
- `server/services/image-generation-router.ts` — image generation with fallback chain

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
- Migration folder: `drizzle/migrations/` (0000-0014)
- First registered user auto-promoted to ADMIN

## Security

- **JWT auth**: `JWT_SECRET` loaded from env var — never hardcoded. Tokens issued on login/register.
- **Password policy**: Minimum 8 characters enforced on both registration and `/api/change-password`.
- **Admin credentials**: Must be provided via env vars only (`E2E_ADMIN_USERNAME`, `E2E_ADMIN_PASSWORD` for tests). Never hardcode admin credentials in source code.
- **Rate limiting**: Applied on auth endpoints (`/api/login`, `/api/register`, `/api/change-password`) via express rate limiter.
- **First-user promotion**: First registered user is auto-promoted to ADMIN role.

## Security Notes (SAST)

From SAST scan (Bandit + Semgrep, Feb 2026 — updated Mar 2026):

| Priority | Finding | Status |
|----------|---------|--------|
| MEDIUM | CORS origin substring match (`server/auth.ts`) | Open — tighten to exact domain match |
| MEDIUM | TLS `rejectUnauthorized: false` (`server/db.ts`) | Open — enable in production with CA cert |
| MEDIUM | Path traversal in `image-storage.ts` | Open — add resolved path validation |
| LOW | SVG innerHTML rendering | Mitigated — client-side DOMPurify pass added (`MediaLessonCard.tsx`) |

SVG content is sanitized server-side via a regex-based sanitizer in `server/services/svg-llm-service.ts` before storage, and client-side via DOMPurify in `client/src/components/MediaLessonCard.tsx` before DOM insertion. The server sanitizer strips forbidden tags (script, style, iframe, etc.), event handlers (on*), and javascript:/data: URIs. LLM prompts explicitly prohibit scripts, styles, and external references.

## Testing

- `npm test` — Jest unit tests
- `npx playwright test` — E2E tests (auto-starts local server)
- `PLAYWRIGHT_BASE_URL=https://sunschool.xyz npx playwright test` — E2E against production

### E2E Test Suite (117 tests across 21 spec files)

Tests live in `tests/e2e/specs/` organized by persona:

| Persona | Spec File | Tests | Coverage |
|---------|-----------|-------|----------|
| **Auth** | `registration-login.spec.ts` | 7 | Registration, login, invalid creds, session, logout, token clearing |
| **Learner** | `lesson-flow.spec.ts` | 2 | Lesson generation, content navigation |
| | `quiz-assessment.spec.ts` | 4 | Quiz pre-screen, answering via API, results |
| | `content-display.spec.ts` | 5 | Text sections, SVG/image display, difficulty levels |
| | `achievements.spec.ts` | 5 | Progress page, zero state, lesson history, mastery |
| | `points-rewards.spec.ts` | 5 | Point balance, goals page, reward progress |
| | `card-carousel.spec.ts` | 5 | Cover card render, progress bar, navigation |
| | `svg-rendering.spec.ts` | 3 | SVG in API response, DOM rendering, image references |
| | `input-safety.spec.ts` | 8 | Prompt injection, DAN mode, env var exfiltration |
| | `chaotic-kid.spec.ts` | 10 | Spam-click, cancel mid-gen, rapid subject switch, refresh during load, random taps, bookmark recovery, error recovery |
| | `template-reuse.spec.ts` | 1 | Shared lesson library, cached template reuse |
| **Parent** | `auth.spec.ts` | 4 | Login form, invalid creds, registration, token clearing |
| | `dashboard.spec.ts` | 5 | Dashboard loads, stats, reports nav, rewards nav, mode switch |
| | `learner-management.spec.ts` | 4 | Learner list, add child, child cards, add-learner page |
| | `parent-workflows.spec.ts` | 8 | Dashboard, learner management, rewards, reports, mode switch |
| | `prompt-audit.spec.ts` | 4 | Lesson API transparency, reports, progress, dashboard |
| | `public-pages.spec.ts` | 4 | Welcome, auth tabs, privacy, terms |
| | `rewards.spec.ts` | 3 | Rewards page, create goal, tabs/sections |
| | `signup-login.spec.ts` | 5 | Registration with age disclaimer, login, invalid creds, session persistence, logout |
| | `workflow-validation.spec.ts` | 19 | Full workflow validation: public pages, parent/learner flows, SVG rendering, navigation |
| **Public** | `public-pages.spec.ts` | 6 | Welcome, auth tabs, privacy, terms, healthcheck, unauthenticated redirect |

### Test Helpers

Centralized in `tests/e2e/helpers/`:

- **`learner-setup.ts`** — `setupLearnerSession()`, `setupParentSession()`, `setupAdminSession()`, `navigateAsLearner()`, `navigateAsParent()`, `generateAndWaitForLesson()`, `completeOneLesson()`, `apiCall()`, `createRewardGoal()`
- **`self-healing.ts`** — `selfHealingLocator()` (AX-tree introspection + locator cascade), `captureFailureArtifacts()` (screenshot + AX dump on failure)

### Key Patterns

- **react-native-web**: TouchableOpacity renders as `<div>` without `role="button"` — use text-based locators, not ARIA roles
- **wouter SPA router**: Does NOT respond to synthetic `popstate` — use `page.goto()` for navigation
- **ModeContext**: Reads `preferredMode` from localStorage on mount — tests must set it before `page.goto()` to prevent redirects
- **API-based operations**: Quiz answers, reward creation, lesson generation via `apiCall()` — more reliable than clicking TouchableOpacity UI

### CI/CD

- **`ci.yml`** — Lint, unit tests, migration check, E2E
- **`synthetic-e2e.yml`** — Playwright with JSON reporter, auto-quarantine of flaky tests (`tests/e2e/quarantine.mjs`), PR comment generation (`tests/e2e/generate-report.mjs`)

Timeout: 10 min per test (AI generation). Screenshots saved to `tests/e2e/screenshots/`. See [workflows.md](workflows.md) for full workflow list.

## Troubleshooting

**Database connection:** Check `DATABASE_URL`, Neon dashboard status, connection pool limits in `server/db.ts`

**Migrations:** Run `npm run migrate` manually to debug. Check `drizzle/migrations/` exists. Failures are logged but don't block startup.

**Quiz errors:** Ensure `quiz_answers` table exists (migrations). Verify learner has active lesson. Check browser console.

**Build errors:** `npx tsc --noEmit` to check types. `rm -rf client/dist server/dist` to clear cache. `TS_NODE_TRANSPILE_ONLY=true` for deployment.

**Auth issues:** Verify `JWT_SECRET` is set. Check token expiration. Parent users scoped to own learners only.
