# Sunschool Deployed — Claude Code Agent Guide

## Commit Rules
- Do NOT add "Co-Authored-By" trailers to commits
- Do NOT add AI attribution (e.g., "Generated with Claude") to code or commit messages

## Project Overview
Sunschool is an AI-powered K-12 learning platform. This is the production deployment repo containing:
- `shared/` — Drizzle ORM schema, types, shared utilities
- `client/` — React Native Web frontend (Expo)
- `server/` — Express API server with OpenRouter LLM integration
- `tests/e2e/` — Playwright E2E test suites (auth, parent, learner, public, mobile)

## Key Commands
```bash
npm ci                                    # Install deps
npm run deploy                            # Start dev server
npx tsc --noEmit                          # Type check
npx eslint server/ shared/ --max-warnings 999  # Lint

# E2E tests (against production)
PLAYWRIGHT_BASE_URL=https://sunschool.xyz npx playwright test tests/e2e/specs/learner/ --reporter=list --timeout=300000

# E2E tests (against local)
npx playwright test --reporter=list
```

## Architecture Notes
- **Auth**: JWT tokens via `/api/register` and `/api/login`. Requires `role` field (PARENT/LEARNER/ADMIN).
- **Lesson Generation**: POST `/api/lessons/create` with `{subject, gradeLevel, learnerId}`. Uses OpenRouter → Gemini Flash (free) for text, Gemini 3.1 Pro for SVGs (paid).
- **SPA Navigation**: React Native Web with React Router. `page.goto()` works; `pushState/popstate` does NOT trigger re-renders.
- **Feature Flags**: `ENABLE_SVG_LLM=0`, `ENABLE_OPENROUTER_IMAGES=0`, `MAX_IMAGES_PER_LESSON=0` disable paid API calls.

## E2E Test Conventions
- Use `setupLearnerSession(page, prefix)` from `tests/e2e/helpers/learner-setup.ts`
- Use `page.goto()` for navigation, never `pushState`
- Use `enterLearnerContext(page)` to switch from parent dashboard to learner view
- Tests that require lesson generation should handle billing failures gracefully (try/catch with skip)
- `PLAYWRIGHT_BASE_URL` env var controls target (default: localhost:5000)

## Cost Management
- Text gen: `google/gemini-2.0-flash-001` (FREE via OpenRouter)
- SVG gen: `google/gemini-3.1-pro-preview` (PAID — $1.25/M input, $10/M output)
- For E2E: Set `ENABLE_SVG_LLM=0` and `MAX_IMAGES_PER_LESSON=0` on Railway to avoid SVG costs
- Fallback chain: Primary model → 2 fallbacks. On 402/403, abort immediately (don't retry)

## Git Conventions
- Branch naming: `feat/`, `fix/`, `agent/` prefixes
- Commit style: `type: description` (fix:, feat:, chore:)
- PR target: `main` branch

## CI/CD
- `.github/workflows/ci.yml` — Lint, type check, unit tests, migration check, E2E
- `.github/workflows/synthetic-e2e.yml` — Synthetic user E2E with auto-quarantine and PR summary
- Production deployed on Railway at sunschool.xyz
