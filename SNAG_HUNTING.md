# Sunschool Snag Hunting

Adapted from the Timepoint Laggard Snag Hunting guide. Sunschool has two user populations: **kids** (who can't debug and won't ask for help) and **parents** (who have 30 seconds of patience). Every snag is a lost family.

---

## The Rule

**If the kid has to ask a grown-up what went wrong, you failed.** They should only ever think about what they want to learn next.

---

## 1. Error Messages

### 1. Raw API errors shown to kids
**Snag:** Kid sees "AI service billing issue. Please check OpenRouter credits." instead of a friendly message.
**Hunt:** Grep for `error.message`, `String(error)`, raw status codes passed to UI components.
**Solve:** Map all errors through `friendlyError()` in learner-home.tsx. 402 = "Our lesson machine needs a tune-up", 503 = "Let's try again!", 401 = "Time to log in again."

### 2. Error without next step
**Snag:** "Something went wrong." — kid stares at screen.
**Hunt:** Search all `errorContainer` and `errorText` styled components. Do they include a button?
**Solve:** Every error shows an emoji + kid-friendly message + "Try Again" button + "Tell a grown-up" collapsible for the real error.

### 3. Different errors look identical
**Snag:** "No lessons" (empty state) looks like "Lessons failed to load" (API error). Kid doesn't know if they should wait or tap something.
**Hunt:** Check learner-home, progress-page, goals-page for empty states vs error states.
**Solve:** Track `isError` separately from empty data. Empty = encouraging CTA. Error = retry button.

### 4. Errors reference internal service names
**Snag:** "OpenRouter API key's monthly spending limit needs to be increased at https://openrouter.ai/settings/keys" shown to a child.
**Hunt:** Grep for "OpenRouter", "Bittensor", "Railway", "Neon", "JWT" in client/src/.
**Solve:** These must never reach the UI. All behind "Tell a grown-up" collapsible.

---

## 2. Loading & Progress

### 5. No loading indicator after button click
**Snag:** Kid taps "New Lesson" — nothing visible happens. They tap 5 more times.
**Hunt:** Find every TouchableOpacity with onPress. Does it disable and show feedback?
**Solve:** Every action button: `disabled={mutation.isPending}`, text changes to "Working...", opacity drops.

### 6. Infinite loading with no timeout
**Snag:** FunLoader spins forever. Kid thinks the app is broken.
**Hunt:** Check FunLoader — does it have a timeout message?
**Solve:** After 20s: "Taking a bit longer than usual..." After 60s: "Still working!" with cancel button. After 120s: auto-cancel with retry.

### 7. Lesson generation progress is fake
**Snag:** Progress bar fills to 100% but lesson isn't ready. Or fills to 40% and stops for 30 seconds.
**Hunt:** Check FunLoader progress bar — is it time-based or event-based?
**Solve:** Be honest. Time-based bar is fine but should slow down near the end (ease-out), not stop abruptly.

### 8. Background SVG generation with no notification
**Snag:** Lesson loads with placeholder images. SVGs generate in background. Kid doesn't know to wait.
**Hunt:** Check refetchInterval polling on lesson page. Is there a "images loading" indicator?
**Solve:** Show a subtle shimmer/pulse on placeholder images. When SVGs arrive, animate them in.

---

## 3. Forms & Input

### 9. Subject selector doesn't confirm selection
**Snag:** Kid taps a subject, lesson immediately starts generating. No "Are you sure?" for subject changes.
**Hunt:** Check SubjectSelector onSelectSubject — does it confirm when there's an active lesson?
**Solve:** Already fixed — goes through confirmation card. Verify it works for both "Change Subject" and "New Lesson".

### 10. Registration form doesn't validate before submit
**Snag:** Parent fills registration, submits, waits, gets "username taken" from server.
**Hunt:** Check auth-page.tsx — is there client-side validation before the mutation fires?
**Solve:** Check username length, email format, password strength before POST.

### 11. Add Learner form doesn't show grade guidance
**Snag:** Parent adds a child, types grade "K" or "Kindergarten" — form expects a number.
**Hunt:** Check add-learner-page.tsx grade input.
**Solve:** Use a dropdown/picker for grade (K, 1-12) instead of free text. Show age-to-grade mapping hint.

---

## 4. Navigation & Dead Ends

### 12. Kid can reach dead-end pages
**Snag:** Kid navigates to /lessons (lesson list) — confusing page not designed for kids.
**Hunt:** Check all LearnerRoute paths. Which ones are kid-appropriate?
**Solve:** Kid should only see: /learner (home), /lesson (active lesson), /quiz/:id, /progress, /goals. Remove /lessons and /select-learner from kid access.

### 13. 404 page is a dead end for kids
**Snag:** Kid types wrong URL or clicks broken link. Sees "404: Page Not Found" with no way back.
**Hunt:** Check App.tsx catch-all route.
**Solve:** Kid-friendly 404: "Oops! This page got lost. 🗺️" with a big "Go Home" button that goes to /learner.

### 14. Back button on lesson page is confusing
**Snag:** Lesson page has a back arrow (←) at top. Where does it go? Previous card? Learner home? Browser back?
**Hunt:** Check active-lesson-page.tsx back button behavior.
**Solve:** Back arrow should always go to /learner (home). Card navigation uses the Next/Back buttons at the bottom.

### 15. No breadcrumbs in parent mode
**Snag:** Parent is on /change-learner-subjects/123 — no idea how to get back to the learner list.
**Hunt:** Check all sub-pages for back navigation.
**Solve:** Add "← Back to [parent page]" link on every sub-page.

---

## 5. Credits & Lesson Generation

### 16. No cost shown before lesson generation
**Snag:** Parent doesn't know that generating a lesson costs AI credits. Gets 402 error after 5 lessons.
**Hunt:** Check learner-home "New Lesson" button — does it show credit info?
**Solve:** Show "Free" badge on lessons from shared library. Show credit indicator when generating new AI content.

### 17. 402 error during generation
**Snag:** Credits run out mid-generation. Kid sees loading forever, then cryptic error.
**Hunt:** Check generateLessonWithRetry for 402 handling.
**Solve:** 402 should immediately stop retries, show kid-friendly "need a tune-up" message, and notify parent.

### 18. No fallback when AI is down
**Snag:** OpenRouter is having an outage. Every lesson generation fails. App is useless.
**Hunt:** Check if there's a fallback to shared lesson library when generation fails.
**Solve:** On 503/502/timeout, try serving a lesson from the shared library instead of showing an error.

---

## 6. Terminology & Copy

### 19. "Learner" vs "Child" vs "Student" inconsistency
**Hunt:** Grep for "learner", "child", "student", "kid" across all templates.
**Solve:** Pick one term per context. Parent-facing: "your child". Kid-facing: their first name. API/code: "learner".

### 20. Mode badge is jargon
**Snag:** "LEARNER" / "PARENT" badge in header means nothing to either audience.
**Hunt:** Check SunschoolHeader mode badge.
**Solve:** Already removed from kid header. Parent header: consider removing or softening to an icon.

### 21. Grade level displayed as number without context
**Snag:** "Grade 5" — is that good? What does it mean for content?
**Hunt:** Check where grade level is shown.
**Solve:** Add age range: "Grade 5 (10-11 yrs)" in parent views. In kid views, just show the number or omit entirely.

---

## 7. Authentication & Sessions

### 22. Kid accidentally logs out
**Snag:** Logout button was in the footer. Kid taps it, session gone, can't get back in (doesn't know password).
**Hunt:** Check if logout is accessible to kids.
**Solve:** Already fixed — kid footer has no logout. Triple-tap gate required to exit to parent mode.

### 23. Session expires, kid sees login page
**Snag:** Kid left app open overnight, comes back, sees auth page with username/password fields. They're 7.
**Hunt:** Check JWT expiry and what happens when it triggers in learner mode.
**Solve:** On session expiry in learner mode: show a kid-friendly "Time to get a grown-up! 🔑" screen instead of the login form. Add a "Get Help" button.

### 24. Parent forgets password, no recovery
**Hunt:** Check auth page for password reset link.
**Solve:** Add "Forgot password?" link. Even if it just says "Contact support" — it acknowledges the problem.

---

## 8. Mobile & Responsive

### 25. Lesson cards overflow on small screens
**Hunt:** Check lesson card carousel at 375px width.
**Solve:** Cards should be full-width on mobile. No horizontal scroll.

### 26. Subject selector cramped on mobile
**Hunt:** Check SubjectSelector category tabs at 375px.
**Solve:** Tabs should scroll horizontally. Subject cards should stack vertically.

### 27. Touch targets too small for kids
**Hunt:** Check all buttons in learner mode. Are they at least 48x48px?
**Solve:** Kids need BIGGER touch targets than adults. Minimum 56x56px for primary actions.

---

## 9. Feedback & Confirmation

### 28. No celebration on quiz completion
**Snag:** Kid finishes a quiz. Score shows. That's it.
**Hunt:** Check quiz-page.tsx results screen.
**Solve:** Add confetti animation, encouraging message based on score, and "Great job!" for any completion.

### 29. No streak or daily engagement hook
**Hunt:** Check learner-home for any daily engagement features.
**Solve:** "Day 3 streak! 🔥" or "Welcome back!" message. Low effort, high retention.

### 30. Achievement unlocks are silent
**Snag:** Kid earns an achievement. Nothing happens visually.
**Hunt:** Check achievement awarding flow. Is there a notification?
**Solve:** Toast notification with animation: "🏆 New Achievement: First Lesson!"

---

## 10. The Meta-Hunt

### 31. Test as a kid (incognito, no context)
Register a new account. Add a child. Start learning. Can you complete a full lesson → quiz → see results without confusion?

### 32. Test session recovery
Start a lesson. Close the browser tab. Reopen. Does it recover to the lesson in progress?

### 33. Count clicks to first lesson
From registration: Register → Add child → Start learning → See lesson content. How many clicks? Target: under 5.

### 34. Test the angry parent
Login as parent. Every child has 0% scores. No lessons. Dashboard is empty. Is there guidance, or just emptiness?

### 35. Test the distracted kid
Start generating a lesson. Walk away for 2 minutes. Come back. Is the lesson ready? Is it obvious what to do?

---

## Checklist

Use for every feature or page:

- [ ] Every error message is kid-friendly with a next step
- [ ] Every button shows loading state when tapped
- [ ] Every long operation has a timeout and cancel button
- [ ] Every form validates before submitting
- [ ] Every empty state has encouraging guidance
- [ ] Every page works on 375px mobile
- [ ] No jargon, technical terms, or internal names visible to kids
- [ ] No way for kids to accidentally logout or reach parent pages
- [ ] Tested in incognito with fresh registration
- [ ] Kid can complete lesson → quiz → see score in under 5 taps from home
