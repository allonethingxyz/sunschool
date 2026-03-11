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

Tests in `tests/e2e/` verify these workflows against the live deployment:

| Test File | Workflows Covered |
|-----------|------------------|
| `auth.spec.ts` | #2 (login form, error handling) |
| `child-lesson-flow.spec.ts` | #2, #14, #16, #6, #7, #8, #9 (full parent→learner flow) |
| `workflow-validation.spec.ts` | All 25 workflows with SVG rendering validation |
