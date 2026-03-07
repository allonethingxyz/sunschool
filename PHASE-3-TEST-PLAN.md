# Phase 3: Navigation Overhaul - Test Plan

## Summary of Changes

### 1. Mode Toggle Reliability Fixes (`/client/src/context/ModeContext.tsx`)
- **Fixed Race Condition**: Replaced `setTimeout` with `requestAnimationFrame` for better synchronization
- **State Update Pattern**: Changed to use React state updater callbacks (`setMode(prevMode => ...)`)
- **Navigation Timing**: Ensured navigation happens after state updates are committed
- **Logging**: Added comprehensive console logging for debugging mode switches

### 2. Visual Mode Indicators (`/client/src/components/SunschoolHeader.tsx`)
- **Mode Badge**: Added prominent visual badge showing current mode
  - Green badge with 👦 icon for LEARNER MODE
  - Blue badge with 👨 icon for PARENT MODE
- **Always Visible**: Badge shows in header next to SUNSCHOOL™ logo
- **Clear Differentiation**: Color-coded backgrounds make mode immediately obvious

### 3. Simplified Learner Selection Flow
- **Auto-Selection**: When toggling to LEARNER mode, first learner is auto-selected if none chosen
- **Clear Navigation Path**: No learners available → redirects to /learners management page
- **Persistent Selection**: Selected learner ID saved to localStorage

---

## Test Scenarios

### Test 1: Mode Toggle from Parent to Learner Mode
**Prerequisites:**
- User is logged in as PARENT or ADMIN
- At least one learner exists

**Steps:**
1. Start in GROWN_UP/PARENT mode (should see blue "👨 PARENT MODE" badge)
2. Click mode toggle button (top-right corner)
3. Observe console logs for mode switching
4. Verify navigation to `/learner` page
5. Verify badge changes to green "👦 LEARNER MODE"
6. Reload page - verify mode persists

**Expected Results:**
- ✅ Mode badge changes from blue to green
- ✅ Navigation redirects to `/learner`
- ✅ Console shows: "Mode update: switching to LEARNER from GROWN_UP"
- ✅ Console shows: "Navigating to /learner after mode switch"
- ✅ Mode persists after page reload
- ✅ No flickering or double navigation

**Status:** ⏳ Pending

---

### Test 2: Mode Toggle from Learner to Parent Mode
**Prerequisites:**
- User is in LEARNER mode
- User has PARENT or ADMIN role

**Steps:**
1. Start in LEARNER mode (green "👦 LEARNER MODE" badge visible)
2. Click mode toggle button
3. Observe console logs
4. Verify navigation to `/dashboard`
5. Verify badge changes to blue "👨 PARENT MODE"
6. Reload page - verify mode persists

**Expected Results:**
- ✅ Mode badge changes from green to blue
- ✅ Navigation redirects to `/dashboard`
- ✅ Console shows mode toggle logs
- ✅ Mode persists after reload
- ✅ No race conditions

**Status:** ⏳ Pending

---

### Test 3: Learner Selection Auto-Switch
**Prerequisites:**
- User is PARENT or ADMIN in GROWN_UP mode
- Multiple learners exist

**Steps:**
1. Navigate to `/select-learner` or click learner selector
2. Select a different learner
3. Observe mode badge change
4. Verify navigation to `/learner`
5. Verify correct learner is displayed

**Expected Results:**
- ✅ Selecting learner auto-switches to LEARNER mode
- ✅ Badge changes to green "👦 LEARNER MODE"
- ✅ Navigation goes to `/learner`
- ✅ Console shows: "Selecting learner: [Name] [ID]"
- ✅ Console shows: "Mode update: switching to LEARNER from GROWN_UP"
- ✅ Selected learner persists in localStorage

**Status:** ⏳ Pending

---

### Test 4: Toggle to Learner Mode with No Learners
**Prerequisites:**
- User is PARENT or ADMIN
- No learners exist

**Steps:**
1. Start in GROWN_UP mode
2. Click mode toggle
3. Observe navigation
4. Verify redirection to `/learners` management page

**Expected Results:**
- ✅ Redirects to `/learners` instead of `/learner`
- ✅ Console shows: "No learners available - directing to learners management page"
- ✅ User can add learners from management page
- ✅ After adding learner, can toggle to LEARNER mode successfully

**Status:** ⏳ Pending

---

### Test 5: Visual Mode Indicator Always Visible
**Prerequisites:**
- User logged in

**Steps:**
1. Navigate to different pages: `/dashboard`, `/learner`, `/lessons`, `/reports`
2. On each page, verify mode badge is visible in header
3. Toggle between modes on different pages
4. Verify badge updates correctly

**Expected Results:**
- ✅ Mode badge visible on all pages for authenticated users
- ✅ Badge color matches current mode (green for LEARNER, blue for PARENT)
- ✅ Badge emoji matches mode (👦 for LEARNER, 👨 for PARENT)
- ✅ Badge positioned clearly next to SUNSCHOOL™ logo

**Status:** ⏳ Pending

---

### Test 6: Persistence Across Sessions
**Prerequisites:**
- User has selected a learner

**Steps:**
1. Select a learner and switch to LEARNER mode
2. Note the selected learner name
3. Close browser tab completely
4. Reopen and log in
5. Verify mode and selected learner are restored

**Expected Results:**
- ✅ Mode restored from localStorage (`preferredMode`)
- ✅ Selected learner restored from localStorage (`selectedLearnerId`)
- ✅ Badge shows correct mode immediately on load
- ✅ No flickering between modes

**Status:** ⏳ Pending

---

### Test 7: Route Guards Work with Mode Changes
**Prerequisites:**
- User is logged in

**Steps:**
1. In PARENT mode, try accessing `/learner` directly (URL)
2. Verify redirect to `/dashboard` (LearnerRoute guard)
3. Switch to LEARNER mode
4. Try accessing `/learner` directly
5. Verify access is allowed

**Expected Results:**
- ✅ LearnerRoute blocks access when not in LEARNER mode
- ✅ LearnerRoute allows access when in LEARNER mode
- ✅ No infinite redirect loops
- ✅ Clear console messages about route protection

**Status:** ⏳ Pending

---

### Test 8: Console Logging for Debugging
**Prerequisites:**
- Browser console open

**Steps:**
1. Perform various mode toggles and learner selections
2. Observe console logs

**Expected Log Patterns:**
```
Toggle mode called { currentMode: "GROWN_UP", canToggle: true }
Toggling mode: GROWN_UP -> LEARNER
Mode state updated: GROWN_UP -> LEARNER
Navigating to: /learner

Selecting learner: Alice 123
Saved learner ID and mode to localStorage: 123
Mode update: switching to LEARNER from GROWN_UP
Navigating to /learner after mode switch
```

**Expected Results:**
- ✅ Clear, sequential logging of mode operations
- ✅ No errors in console
- ✅ Timestamps help debug timing issues
- ✅ Logs indicate successful state updates before navigation

**Status:** ⏳ Pending

---

## Performance Tests

### Test 9: No Race Conditions
**Steps:**
1. Rapidly toggle between modes (click 5 times quickly)
2. Observe behavior

**Expected Results:**
- ✅ Mode settles on correct final state
- ✅ No multiple navigations triggered
- ✅ No stuck states
- ✅ Console shows orderly state updates

**Status:** ⏳ Pending

---

### Test 10: Mobile Responsiveness
**Steps:**
1. Open on mobile device or responsive mode
2. Verify mode badge is visible and readable
3. Test mode toggle on touch screen
4. Verify navigation works smoothly

**Expected Results:**
- ✅ Badge text readable on small screens
- ✅ Mode toggle button accessible and tappable
- ✅ No layout breaking
- ✅ Smooth transitions

**Status:** ⏳ Pending

---

## Regression Tests (Phases 1 & 2)

### Test 11: Content Validation Still Works
**Steps:**
1. Create lesson for Grade 2 learner
2. Check server console for validation logs
3. Verify questions are appropriate length

**Expected Results:**
- ✅ Validation logs appear in server console
- ✅ Questions max 5 words for K-2
- ✅ No complex vocabulary

**Status:** ⏳ Pending

---

### Test 12: Quiz Answer Tracking Still Works
**Steps:**
1. Complete a quiz
2. Check database for quiz_answers entries
3. Check concept_mastery updates

**Expected Results:**
- ✅ Individual answers stored in quiz_answers table
- ✅ Concept mastery updated correctly
- ✅ Question hashes stored for deduplication

**Status:** ⏳ Pending

---

## Test Execution Checklist

- [ ] Test 1: Mode Toggle Parent → Learner
- [ ] Test 2: Mode Toggle Learner → Parent
- [ ] Test 3: Learner Selection Auto-Switch
- [ ] Test 4: Toggle with No Learners
- [ ] Test 5: Visual Mode Indicator Visibility
- [ ] Test 6: Persistence Across Sessions
- [ ] Test 7: Route Guards with Mode Changes
- [ ] Test 8: Console Logging
- [ ] Test 9: No Race Conditions
- [ ] Test 10: Mobile Responsiveness
- [ ] Test 11: Content Validation (Regression)
- [ ] Test 12: Quiz Tracking (Regression)

---

## Success Criteria

✅ **All tests pass** with no critical issues
✅ **Mode toggle is reliable** - no flickering, race conditions, or stuck states
✅ **Visual indicators are clear** - users always know which mode they're in
✅ **Navigation is predictable** - routes behave as expected
✅ **Persistence works** - mode and learner selection survive reloads
✅ **No regressions** - Phases 1 & 2 features still work

---

## Known Limitations

1. **Learner selection flow** could be further simplified (remove redundant `/select-learner` page)
2. **Theme colors** are functional but could be enhanced with more visual differentiation
3. **Animation** during mode switch could be smoother

These are deferred improvements for future iterations.
