# SUNSCHOOL UX Overhaul Plan

> **NOTE**: This plan was written before the UX overhaul (commit `569340b`). Some items have since been completed — see status markers below. Line number references throughout this document refer to the pre-overhaul codebase and may no longer be accurate. The lesson generation pipeline was rebuilt (single spec column, validation, model fallback chains) — see [ENGINEERING.md](ENGINEERING.md) for current architecture.

This document lays out a comprehensive plan to fix SUNSCHOOL's UX problems, organized into three parallel tracks. Each track can be worked independently, though Track 1 should be prioritized since it fixes broken functionality.

The core thesis: **the app has an identity crisis**. The same monochrome UI tries to serve busy parents (who need a polished SaaS dashboard) and young children (who need a colorful, game-like experience). Neither audience is served well. We fix this by creating two distinct visual/functional experiences that share a common backend.

---

## Track 1: Fix Broken State & Switching (Critical Bugs)

These are functional bugs that make the app unreliable. They should be fixed first because no amount of visual polish matters if the core workflows are broken.

### 1.1 Rewrite ModeContext to eliminate race conditions

**Files:** `client/src/context/ModeContext.tsx`

**Problem:** When a parent switches between children, `selectedLearner` is set in React state and localStorage simultaneously, but downstream queries (lessons, profile, achievements) don't wait for the switch to complete. A fast switch shows Child A's data on Child B's page. The `selectLearner()` function at line 124 saves state, writes localStorage, switches mode, AND navigates all in one synchronous pass with a `requestAnimationFrame` hack.

**Why it matters:** Parents managing 3+ kids see wrong data. This is a trust-destroying bug in an education app.

**Fix:**
- Make `selectLearner()` async-aware: set a `isSwitching` flag, invalidate all learner-scoped queries, wait for critical queries to settle, THEN navigate.
- Remove the `requestAnimationFrame` hack at line 148 — use proper React state batching instead.
- Add a transition loading state so the UI shows "Switching to Emma..." rather than jumping with stale data.
- Centralize the `selectedLearner` as the single source of truth. Remove the redundant localStorage read on mount (lines 90-122) and replace with a React Query-managed state that syncs to localStorage as a side effect, not as a primary source.

### 1.2 Fix progress page querying wrong user

**Files:** `client/src/pages/progress-page.tsx`

**Problem:** Line 31 queries `/api/lessons?learnerId=${user?.id}` — this uses the *authenticated* user's ID. When a parent is in learner mode viewing their child's progress, `user?.id` is the parent, not the child. The child's progress page shows nothing.

**Why it matters:** The "Your Learning Journey" card on the learner home page (line 276) links to `/progress`. Parents click it expecting to see their child's data. They see an empty page.

**Fix:**
- Import `useMode` and use `selectedLearner?.id` for the query when in parent-as-learner mode, falling back to `user?.id` for actual learner accounts.
- Same fix needed for achievements query at line 42.
- Apply the same pattern to every learner-scoped page: `const learnerId = selectedLearner?.id || user?.id`.

### 1.3 Unify query key patterns to prevent stale cache

**Files:** `client/src/pages/learners-page.tsx`, `client/src/pages/quiz-page.tsx`, `client/src/pages/add-learner-page.tsx`, `client/src/lib/queryClient.ts`

**Problem:** Different pages use different query key patterns for the same data. `learners-page.tsx:145` invalidates `['/api/learner-profile']` (generic) but the actual fetch uses `['/api/learner-profile/${userId}']` (specific). The invalidation misses. Global `staleTime` of 5 minutes (queryClient.ts:51) means mutations appear to do nothing for minutes.

**Why it matters:** Parent updates a child's grade level, navigates away and back, sees the old grade. Parent thinks the update failed.

**Fix:**
- Create a `queryKeys.ts` utility that defines all query key factories:
  ```ts
  export const queryKeys = {
    learnerProfile: (id: number) => ['/api/learner-profile', id] as const,
    learners: (parentId: number, role: string) => ['/api/learners', parentId, role] as const,
    activeLessons: (learnerId: number) => ['/api/lessons/active', learnerId] as const,
    // ...etc
  };
  ```
- Replace all inline query key strings with these factories.
- Reduce `staleTime` to 30 seconds for learner-scoped data. Keep 5 minutes for static data (achievements list, etc.).
- After mutations, invalidate using the factory to ensure cache hits.

### 1.4 Fix auth token extraction fragility

**Files:** `client/src/hooks/use-auth.tsx`

**Problem:** The login flow (lines 183-347) tries 4 different API endpoints sequentially. The `onSuccess` handler for registration (lines 540-642) searches for JWT tokens in arrays, nested objects, and arbitrary string properties. If extraction fails, it still redirects to `/dashboard` (line 639), leaving the user in an unauthenticated ghost state.

**Why it matters:** Login failures produce a wall of text: "All login attempts failed: Endpoint /login error: timeout; Endpoint /api/login error: timeout..." Users can't diagnose or fix this.

**Fix:**
- Consolidate to a single login endpoint. The 4-endpoint loop exists because of domain migration from Replit to sunschool.xyz. Now that the domain is settled, use one canonical endpoint.
- Simplify the response handler: expect `{ token, user }` format. If the format doesn't match, show a clear error, don't redirect.
- Replace the wall-of-text error with human-readable messages: "Check your internet connection", "Invalid username or password", "Server is temporarily unavailable".
- Remove any legacy domain references in the logout flow (line 709).

### 1.5 Add session expiry detection and cleanup

**Files:** `client/src/hooks/use-auth.tsx`, `client/src/context/ModeContext.tsx`

**Problem:** When the JWT expires server-side, ModeContext still holds `selectedLearner` from localStorage. The UI shows "Hello, Emma!" but every API call returns 401. No redirect to login occurs — the user sees a broken page with blank data.

**Why it matters:** Sessions expire after 7 days. Any parent returning after a week hits this ghost state.

**Fix:**
- In `use-auth.tsx`, when the `/api/user` query returns null after being non-null (session expired), broadcast an event.
- In `ModeContext`, listen for the auth-cleared event and reset `selectedLearner` + `preferredMode` in localStorage.
- Add a global 401 interceptor to the axios instance that clears auth state and redirects to `/auth` with a "Session expired" toast.

### 1.6 Add unsaved-changes guard to mode toggle

**Files:** `client/src/context/ModeContext.tsx`, `client/src/components/ModeToggle.tsx`

**Problem:** `toggleMode()` at line 211 immediately switches mode and navigates. If the parent is mid-edit on a child's profile, all changes are lost with no warning.

**Why it matters:** Parent spends 5 minutes configuring subjects for a child, accidentally clicks toggle, loses everything.

**Fix:**
- Add a `registerDirtyForm(formId)` / `unregisterDirtyForm(formId)` API to ModeContext.
- Before `toggleMode()` executes, check if any forms are dirty. If so, show a confirmation dialog: "You have unsaved changes. Switch anyway?"
- Forms that use this: add-learner, change-learner-subjects, database-sync config.

---

## Track 2: Build a Real Parent Dashboard

The current parent experience is an onboarding guide that never goes away, plus bare text links. Parents need an at-a-glance view of all their children's learning status.

### 2.1 Replace the static onboarding with a live dashboard

**Files:** `client/src/pages/dashboard-page.tsx`

**Problem:** Lines 197-299 show a permanent onboarding guide with steps 1-4 and a "Pro Tip." This is useful on first login but becomes clutter on every subsequent visit. The "Learner Management" section (lines 264-275) is just three text links. There's also a missing space: "Welcome toSunschool" (line 202), "Switch toSunschool" (line 280), "Go toSunschool" (line 295).

**Why it matters:** Parents want to open the app and instantly see: "Emma did 3 lessons this week, 85% average. Jake hasn't logged in for 4 days." Instead, they see the same onboarding text every time.

**Fix:**
- Show the onboarding guide only once (store `hasSeenOnboarding` in localStorage, dismiss with an "I understand" button).
- Replace it with a **Children Overview** section:
  ```
  ┌─────────────────────────────────────────────┐
  │  Emma (Grade 3)                    ↗ View   │
  │  ✅ 12 lessons  📊 85% avg  🏆 5 badges    │
  │  Last active: 2 hours ago                   │
  ├─────────────────────────────────────────────┤
  │  Jake (Grade 1)                    ↗ View   │
  │  ✅ 4 lessons   📊 72% avg  🏆 2 badges    │
  │  ⚠️ Last active: 4 days ago                 │
  └─────────────────────────────────────────────┘
  ```
- Each child card is tappable — opens that child's detailed progress.
- "View" button switches to learner mode for that child.
- Add a prominent "+ Add Child" button at the bottom of the list.

### 2.2 Add a persistent child selector to the header

**Files:** `client/src/components/AppLayout.tsx`, `client/src/components/LearnerSelector.tsx`

**Problem:** `LearnerSelector.tsx` exists but only shows in learner mode. Parents must navigate to `/learners`, find the child, then switch. No persistent indicator of which child is currently selected.

**Why it matters:** A parent with 3 kids wastes 4-5 clicks every time they want to check a different child's progress.

**Fix:**
- Add a child dropdown to `AppLayout` header that's visible whenever a parent/admin is in learner mode.
- Shows: avatar + name of currently selected child, with a dropdown to switch.
- Switching triggers `selectLearner()` from ModeContext (after the fixes from 1.1).
- In grown-up mode, show a smaller "View as: [child name]" quick-switch button.

### 2.3 Fix the reports page default state

**Files:** `client/src/pages/reports-page.tsx`

**Problem:** `selectedLearnerId` defaults to `null` (line 18). The entire report section only renders when a learner is selected (lines 140-301). Parent opens Reports and sees a blank page with "Select a Learner" instruction.

**Why it matters:** Instant insights are the whole point of a reports page. Making the parent click again is friction.

**Fix:**
- Default to the first child (or the most recently viewed child, stored in localStorage).
- If only one child exists, auto-select them and skip the selection UI entirely.
- Show the child selector as a horizontal tab bar, not a separate step.

### 2.4 Surface achievements and points to parents

**Files:** `client/src/pages/dashboard-page.tsx`, new component `client/src/components/ChildProgressSummary.tsx`

**Problem:** The gamification system (points, achievements, concept mastery) exists on the backend but parents never see aggregate data. `TokenBalance.tsx` and `AchievementBadge.tsx` exist but aren't wired into the parent dashboard.

**Why it matters:** Parents can't see the value of the platform if they can't see what their kids have accomplished.

**Fix:**
- Create a `ChildProgressSummary` component that fetches and displays per-child:
  - Total points earned
  - Recent achievements (last 3)
  - Concept mastery breakdown (subjects the child is strong/weak in)
  - Recent quiz scores trend (improving/declining)
- Use this component in the dashboard child cards (2.1) and in the reports page.

### 2.5 Unify the add-learner flow

**Files:** `client/src/pages/add-learner-page.tsx`, `client/src/pages/parent-dashboard.tsx`

**Problem:** Two different "add child" paths exist: `add-learner-page.tsx` uses `/api/learners` POST, while `parent-dashboard.tsx` uses `/register`. Different parameters, different language ("learner" vs "child"), different UI patterns.

**Why it matters:** Confusing. Parents may create duplicate accounts.

**Fix:**
- Consolidate to one flow: `/add-learner` page, using `/api/learners` endpoint.
- Remove the inline registration form from `parent-dashboard.tsx`.
- Use consistent language everywhere: "Add Child" (not "Add Learner") in parent-facing UI. The word "learner" is fine in code/APIs but parents think in terms of "my child."
- Add optimistic update: when the POST succeeds, immediately add the new child to the React Query cache so the learners list updates instantly.

### 2.6 Make database sync understandable or hide it

**Files:** `client/src/pages/database-sync-page.tsx`

**Problem:** The page asks parents to enter a PostgreSQL connection URL. No explanation of why they'd want this, what it does with their data, or what PostgreSQL is. The regex validation (line 168) rejects valid input with no helpful error.

**Why it matters:** Non-technical parents will either be confused or scared (entering database passwords into a form).

**Fix:**
- Add a clear explanation: "Back up your family's learning data to your own database. This is optional and for advanced users."
- Add a "Who needs this?" collapse section that explains the use case.
- Move it behind a "Show Advanced Features" toggle in the parent dashboard.
- Improve validation errors: instead of failing silently, show: "This should look like: postgresql://user:password@host:port/database"

---

## Track 3: Create a Kid-Friendly Experience

The child-facing UI needs to feel like a game, not a spreadsheet. This track transforms the learner mode into something a 7-year-old would enjoy.

### 3.1 Create a kid-friendly color theme — COMPLETED ✅

> **Status:** Implemented in commit `569340b`. The dual-theme system is live in `client/src/styles/theme.tsx` with `parentColors` (monochrome) and `learnerColors` (colorful). The `getTheme()` function switches palettes based on mode, and `useTheme()` hook is available throughout the app.

**Files:** `client/src/styles/theme.tsx`

**What was done:**
- Dual-theme system with `parentColors` and `learnerColors` palettes
- Parent theme: sophisticated monochrome (`#121212` primary)
- Learner theme: bright and inviting (`#4A90D9` blue, `#FF8C42` orange, `#6BCB77` green, `#FFD93D` gold, `#C084FC` purple)
- `ModeContext` drives theme switching via `getTheme()` / `useTheme()`

### 3.2 Add celebration animations for quiz results

**Files:** `client/src/pages/quiz-page.tsx`, `client/src/components/QuizComponent.tsx`, new file `client/src/components/Confetti.tsx`

**Problem:** When a child gets an answer right, they see "Correct!" in a dark box (QuizComponent.tsx:95). When they finish a quiz with 80%, they see a gray CheckCircle icon and a gray progress bar. No confetti, no bounce, no celebration. The `animations` object in theme.tsx (line 127) defines durations but they're never used.

**Why it matters:** Immediate positive reinforcement is the #1 driver of engagement in educational apps. Duolingo, Khan Academy Kids, and every successful edtech app celebrates correct answers. Without it, kids have no emotional reason to continue.

**Fix:**
- **Per-question feedback:**
  - Correct: Answer option flashes green, scales up slightly (CSS transform), shows a checkmark icon with a 200ms pop animation.
  - Incorrect: Answer option briefly shakes (CSS animation), shows the correct answer highlighted in green.
  - Use React Native Animated API or CSS transitions (via react-native-web).

- **Quiz completion (score >= 70%):**
  - Confetti burst animation (use a lightweight CSS-only confetti or the `canvas-confetti` library adapted for web).
  - Score counter animates from 0 to actual score.
  - Large, colorful "Great job!" text with a bounce-in animation.
  - Stars/sparkles around the achievement badges if any were earned.

- **Quiz completion (score < 70%):**
  - Encouraging message: "Almost there! Keep practicing!" (not "Keep practicing!" which feels like a command).
  - Show which topics to review, framed positively: "You're getting better at addition! Let's practice subtraction a bit more."

### 3.3 Make achievements feel rewarding

**Files:** `client/src/pages/quiz-page.tsx` (lines 201-213), `client/src/components/AchievementBadge.tsx`, `client/src/pages/progress-page.tsx` (lines 157-188)

**Problem:** Achievement unlocks appear in a dark gray box with a white CheckCircle icon. No special moment. On the progress page, achievements are a plain list with the same generic Award icon for every badge.

**Why it matters:** Achievements are the long-term motivation loop. If they don't feel special, kids don't care about earning them.

**Fix:**
- **Unlock moment:** When achievements are returned from the quiz submission API, show a full-screen modal overlay:
  - Badge zooms in with a scale animation (0 → 1.2 → 1.0, spring easing).
  - Gold/rainbow gradient background behind the badge.
  - Achievement title in large, bold, colorful text.
  - "Tap to continue" at the bottom.

- **Achievement badges:** Create distinct visual badges for different types:
  - First Lesson: star icon
  - Quiz Master: trophy icon
  - Streak: fire icon
  - Subject-specific badges with relevant icons
  - Use color-coded borders: gold, silver, bronze based on rarity.

- **Progress page:** Display achievements as a trophy case grid, not a list. Locked achievements show as grayed-out silhouettes with "???" — this creates aspiration.

### 3.4 Replace adult language with kid-friendly copy

**Files:** Multiple — `learner-home.tsx`, `quiz-page.tsx`, `progress-page.tsx`, `LessonCard.tsx`

**Problem:** The UI speaks in teacher/parent language:
- "Knowledge Graph" (learner-home.tsx:267)
- "Continue Learning" (quiz-page.tsx:229)
- "QUEUED" status on lesson cards (LessonCard.tsx)
- "Loading your personalized lesson..." (learner-home.tsx:196)
- "Test your knowledge of the lesson material" (quiz-page.tsx:237)
- "Concept mastery tracking"

**Why it matters:** A 7-year-old doesn't know what "Knowledge Graph" or "QUEUED" means. The language creates distance.

**Fix — copy replacements:**

| Current | Kid-friendly |
|---------|-------------|
| Knowledge Graph | My Brain Map |
| Continue Learning | Keep Going! |
| QUEUED | Coming Up |
| ACTIVE | In Progress → Let's Go! |
| DONE | Complete → Done! |
| Quiz | Challenge |
| Loading your personalized lesson... | Getting your lesson ready... |
| Test your knowledge | Let's see what you learned! |
| Knowledge Check | Quick Challenge |
| Submit Answers | I'm Done! |
| Lessons Completed | Lessons Done |
| Average Score | How I'm Doing |
| Achievements | My Trophies |

### 3.5 Add fun loading states

**Files:** `client/src/pages/learner-home.tsx` (191-199), `client/src/pages/quiz-page.tsx` (128-141), `client/src/pages/lesson-page.tsx`

**Problem:** Every loading state is an `ActivityIndicator` (spinner) with gray text. "Loading your learning dashboard..." "Loading quiz questions..." "Checking your answers..."

**Why it matters:** AI lesson generation takes 5-15 seconds. A plain spinner for 15 seconds is an eternity for a child. They'll close the app.

**Fix:**
- Create a `FunLoader` component with rotating tips/facts:
  ```
  [spinning sun icon]
  "Did you know? Octopuses have 3 hearts!"
  ```
- Rotate through a bank of 50+ fun facts every 3 seconds.
- For lesson generation specifically, show a progress-style message:
  ```
  "Finding the best lesson for you..."
  → "Almost ready..."
  → "Here it comes!"
  ```
- Use the learner color theme (warm yellows, blues).

### 3.6 Add progress visualization for kids

**Files:** `client/src/pages/progress-page.tsx`

**Problem:** Stats are "5 Lessons Completed", "78% Average Score", "3 Achievements" in plain number cards (lines 106-130). Kids don't care about percentages. There's no sense of progress toward a goal, no level system, no streaks.

**Why it matters:** The progress page should make kids feel like they're getting somewhere. Numbers don't do that — visual progression does.

**Fix:**
- **Level system:** Map total points to levels (Level 1: 0-100 pts, Level 2: 100-300 pts, etc.). Show current level with a progress bar to next level.
  ```
  ⭐ Level 5 Explorer
  [████████░░] 80/100 to Level 6
  ```
- **Streak counter:** Track consecutive days of activity. Show a flame icon that grows with streak length.
- **Subject mastery rings:** Circular progress indicators per subject, like Apple Watch activity rings. Shows visually how close the child is to "mastering" each subject.
- **Recent activity feed:** "Today you completed a math lesson! +50 points" instead of a data table.

### 3.7 Add sound effects (optional, off by default)

**Files:** New file `client/src/utils/sounds.ts`, settings in learner profile

**Problem:** The app is completely silent. No audio library exists in the codebase.

**Why it matters:** Audio feedback accelerates learning. A "ding" on correct answers creates a Pavlovian positive association. However, sound can be annoying in classrooms/libraries, so it must be optional.

**Fix:**
- Add a lightweight sound utility using the Web Audio API (no library needed):
  - `playCorrect()` — short ascending chime
  - `playIncorrect()` — short soft buzz
  - `playCelebration()` — achievement unlock fanfare
  - `playClick()` — subtle button tap
- Store preference in learner profile: `soundEnabled: boolean` (default: false).
- Add a sound toggle (speaker icon) to the learner header.
- Generate sounds programmatically (Web Audio API oscillators) to avoid loading audio files.

### 3.8 Improve lesson content presentation

**Files:** `client/src/pages/lesson-page.tsx`, `client/src/components/EnhancedLessonContent.tsx`

**Problem:** Lessons render as blocks of text. For K-2 kids, this is especially problematic — they need visual learning. The prompts in `server/prompts/grades/gradeK2.ts` ask for pictures but the UI doesn't make text engaging even without images.

**Why it matters:** Text-heavy content causes young learners to disengage in seconds.

**Fix:**
- **Lesson intro hook:** Start every lesson with a fun question or fact in a highlighted callout box: "Did you know plants make their own food? Let's find out how!"
- **Section breaks:** Between paragraphs, add visual dividers with icons related to the topic.
- **Key terms:** Bold and color-highlight key vocabulary words. Tapping a highlighted word could show a simple definition.
- **Quiz preview:** At the bottom of the lesson, instead of "Ready to Test Your Knowledge?", show: "Think you've got it? Let's play a quick challenge!" with a game-style button.

---

## Track 4: Cleanup & Polish

Smaller items that improve overall quality.

### 4.1 Fix the "toSunschool" typos

**Files:** `client/src/pages/dashboard-page.tsx`

**Problem:** Lines 202, 280, 287, 295 all say "toSunschool" (missing space). Should be "to Sunschool."

### 4.2 Complete the origen → sunschool rename — COMPLETED ✅

**Status:** Rebrand completed. All code references updated to sunschool. Repo at `https://github.com/allonethingxyz/sunschool`.

### 4.3 Delete stale duplicate files — COMPLETED ✅

**Status:** Duplicate files (`server/openrouter 2.ts`, `server/routes 2.ts`) have been removed.

### 4.4 Standardize grade level handling

**Files:** `client/src/pages/add-learner-page.tsx`, `client/src/pages/learners-page.tsx`, `client/src/pages/parent-dashboard.tsx`

**Problem:** Three different UIs for editing grade level. Frontend rejects "K" for Kindergarten but backend supports it. Add-learner uses a text input while other pages use a picker.

**Fix:** Create a shared `GradePicker` component used everywhere. Support K, 1-12. One pattern, one component.

---

## Implementation Order

**Phase 1 — Stop the Bleeding (1-2 weeks)**
1. Track 1.1: Fix ModeContext race conditions
2. Track 1.2: Fix progress page wrong-user bug
3. Track 1.3: Unify query keys
4. Track 1.4: Simplify auth flow
5. Track 1.5: Session expiry detection
6. Track 4.1-4.3: Typos, rename, cleanup

**Phase 2 — Parent Experience (1-2 weeks)**
1. Track 2.1: Live parent dashboard
2. Track 2.2: Persistent child selector
3. Track 2.3: Reports page defaults
4. Track 2.5: Unified add-learner flow
5. Track 2.4: Surface achievements to parents
6. Track 2.6: Database sync UX

**Phase 3 — Kid Experience (2-3 weeks)**
1. Track 3.1: Dual color theme system
2. Track 3.4: Kid-friendly copy
3. Track 3.5: Fun loading states
4. Track 3.2: Quiz celebration animations
5. Track 3.3: Achievement reward moments
6. Track 3.6: Progress visualization
7. Track 3.8: Lesson presentation
8. Track 3.7: Sound effects (optional stretch)

**Phase 4 — Polish (ongoing)**
1. Track 4.4: Grade level standardization
2. Track 1.6: Unsaved changes guard
3. Cross-browser/mobile testing
4. Accessibility audit (WCAG AA for parent mode)

---

## Design Principles

1. **Two audiences, two experiences.** Parent mode = clean SaaS. Kid mode = colorful game. The mode toggle is the boundary.
2. **Celebrate everything.** Every correct answer, every completed lesson, every achievement should feel like a win for the child.
3. **Zero dead ends.** Every page should either show data or guide the user to the next action. No blank states without a clear CTA.
4. **State is sacred.** The selected child, auth state, and unsaved changes must be handled carefully. Race conditions and ghost states destroy trust.
5. **Words matter.** Parents see "dashboard," "reports," "analytics." Kids see "my stuff," "trophies," "challenges."
