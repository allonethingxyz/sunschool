# Sunschool UX Workflows

Complete list of all user-facing workflows organized by role.

---

## Public (No Authentication)

| # | Workflow | Route | Description |
|---|----------|-------|-------------|
| 1 | Welcome / Landing | `/welcome` | App intro, feature highlights, sign-up/login CTAs |
| 2 | Auth (Login + Register) | `/auth` | Combined login/registration with role selection, age confirmation |
| 3 | Privacy Policy | `/privacy` | Privacy disclosure page |
| 4 | Terms of Service | `/terms` | Terms and conditions page |
| 5 | Public Award Share | `/users/:username/award/:hash` | View a shared achievement without login |

---

## Learner Workflows

| # | Workflow | Route | Description |
|---|----------|-------|-------------|
| 6 | Learner Home | `/learner` | Main hub: active lesson card, subject selector, goals strip |
| 7 | Select Learner | `/select-learner` | Parent picks which child to use in learner mode |
| 8 | Active Lesson | `/lesson` | View current lesson with rich content, SVG illustrations, diagrams |
| 9 | Quiz | `/quiz/:lessonId` | Answer questions, double-or-loss wagering, score + points |
| 10 | Lessons List | `/lessons` | Browse past and available lessons |
| 11 | Create Lesson | `/create-lesson` | Request a custom AI lesson by topic/grade |
| 12 | Progress | `/progress` | Lesson history, scores, achievements, points balance |
| 13 | Learner Goals | `/goals` | View reward goals, save points, redeem rewards |

---

## Parent Workflows

| # | Workflow | Route | Description |
|---|----------|-------|-------------|
| 14 | Parent Dashboard | `/dashboard` | Child cards with stats, "Start Learning as [Child]" buttons |
| 15 | Learners Management | `/learners` | View/edit children, grade levels, subjects, knowledge graphs |
| 16 | Add Learner | `/add-learner` | Create child account (name + grade) |
| 17 | Change Subjects | `/change-learner-subjects/:id` | Add/remove subjects for a learner |
| 18 | Reports | `/reports` | Analytics per child: progress, lessons, achievements, PDF export |
| 19 | Rewards Management | `/rewards` | Create/edit/delete rewards, approve/reject redemptions |
| 20 | Database Sync | `/database-sync` | External DB sync config, manual push, continuous sync |

---

## Admin Workflows

| # | Workflow | Route | Description |
|---|----------|-------|-------------|
| 21 | Admin Panel | `/admin` | Hub with nav to users, content, settings |
| 22 | User Management | `/admin/users` | CRUD all users (admins, parents, learners) |
| 23 | Lesson Management | `/admin/lessons` | View/create/edit/delete all lessons |
| 24 | Settings | `/admin/settings` | System-wide config and feature flags |

---

## Cross-Cutting Features

- **Mode Toggle**: Parents/admins switch between GROWN_UP and LEARNER mode via header button
- **Learner Context**: Selecting a child persists in localStorage, scopes all API calls
- **Background Image Generation**: Lessons return immediately; SVG illustrations generate async via Gemini 3.1 and render when ready (client auto-refetches)
- **Dirty Form Guard**: Warns before mode switch with unsaved changes
- **Points System**: Earned from quizzes, spent on rewards, tracked in ledger
- **Achievement System**: Auto-awarded for milestones (first lesson, perfect score, streaks)

---

## E2E Test Coverage

Tests in `tests/e2e/specs/` verify these workflows (71 tests, 15 spec files):

### Learner Persona (9 specs, 43 tests)

| Test File | Workflows Covered |
|-----------|------------------|
| `specs/learner/lesson-flow.spec.ts` | #6 #8 — Lesson generation, content navigation, quiz entry |
| `specs/learner/quiz-assessment.spec.ts` | #9 — Quiz pre-screen, answering via API, results |
| `specs/learner/content-display.spec.ts` | #8 — Text sections, SVG/image display, difficulty levels |
| `specs/learner/achievements.spec.ts` | #12 — Progress page, zero state, lesson history, mastery |
| `specs/learner/points-rewards.spec.ts` | #13 — Point balance, goals page, reward progress |
| `specs/learner/card-carousel.spec.ts` | #8 — Cover card, progress bar, forward/back navigation |
| `specs/learner/svg-rendering.spec.ts` | #8 — SVG in API response, DOM rendering, sanitization |
| `specs/learner/input-safety.spec.ts` | #8 — Prompt injection prevention, DAN mode, env exfiltration |
| `specs/learner/chaotic-kid.spec.ts` | #6 #8 — Spam-click, cancel mid-gen, rapid subject switch, refresh during load, nav away/back, random taps, mash forward/back, indecisive confirm, bookmark recovery, error recovery |

### Parent Persona (6 specs, 24 tests)

| Test File | Workflows Covered |
|-----------|------------------|
| `specs/parent/auth.spec.ts` | #2 — Login form visible, invalid creds, registration via API, token clearing |
| `specs/parent/dashboard.spec.ts` | #14 — Dashboard loads, child stats, reports nav, rewards nav, learner mode switch |
| `specs/parent/learner-management.spec.ts` | #15 #16 — Learner list, add child via API, child cards, add-learner page |
| `specs/parent/prompt-audit.spec.ts` | #8 #18 — Lesson API transparency, reports page, progress, dashboard child info |
| `specs/parent/public-pages.spec.ts` | #1 #3 #4 — Welcome page, auth tabs, privacy, terms |
| `specs/parent/rewards.spec.ts` | #19 — Rewards page load, create reward goal, tabs/sections |

### Workflow Coverage Map

| Workflow # | Name | E2E Coverage |
|------------|------|--------------|
| 1 | Welcome | `public-pages` |
| 2 | Auth | `auth` |
| 3 | Privacy | `public-pages` |
| 4 | Terms | `public-pages` |
| 6 | Learner Home | `lesson-flow`, `chaotic-kid` |
| 8 | Active Lesson | `lesson-flow`, `content-display`, `card-carousel`, `svg-rendering`, `input-safety`, `chaotic-kid` |
| 9 | Quiz | `quiz-assessment` |
| 12 | Progress | `achievements` |
| 13 | Goals | `points-rewards` |
| 14 | Dashboard | `dashboard` |
| 15-16 | Learners | `learner-management` |
| 18 | Reports | `prompt-audit` |
| 19 | Rewards | `rewards` |
| — | Kid resilience | `chaotic-kid` (10 chaos scenarios) |
