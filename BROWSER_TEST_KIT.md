# Sunschool Browser Test Kit

You are a Chrome browser agent logged into sunschool.xyz with a real Google account. Run every test below in order. Do not skip tests. Do not guess results — check the actual Network tab and DOM.

## Setup

1. Open Chrome DevTools (Cmd+Opt+I)
2. Go to Network tab, check "Preserve log"
3. Go to Console tab (keep Network visible in split if possible)
4. Navigate to `https://sunschool.xyz`
5. Hard refresh (Cmd+Shift+R) to clear any cached state
6. Run `sessionStorage.clear()` in Console to start fresh

## Tests

### T1: Health check
- In Console run: `fetch('/health').then(r=>r.json()).then(console.log)`
- Expected: `{status: "ok", version: "0.2.0"}`

### T2: Auth config
- In Console run: `fetch('/api/config/auth').then(r=>r.json()).then(console.log)`
- Expected: `{clientId: "507431826347-...", provider: "google"}`
- If clientId is empty or "pending-configuration": FAIL

### T3: Login page renders
- Page should show "Sunschool" heading, "Learn anything with your AI tutor", and a Google Sign-In button
- Check: `document.getElementById('g-signin-btn')` should contain an iframe from accounts.google.com
- If no button or two buttons: report exactly what you see

### T4: Google Sign-In works
- Click the Google Sign-In button, complete OAuth
- Expected: page redirects to `#/chat`, navbar appears with your name and a points badge
- Check Network tab for: `GET /api/conversations?learner_id=...` — report status code
- Check Network tab for: `GET /api/learners/.../points` — report status code

### T5: Chat loads
- After login, you should see:
  - Navbar with "Sunschool", "Chat", "Parent" links, points badge, your name, Sign out button
  - Chat area (may say "Start a conversation")
  - Text input with placeholder "Type your message..." and a Send button
- If you see the login page instead: check Console for errors, report them

### T6: Send a message
- Type `Teach me about photosynthesis` in the chat input
- Click Send
- Watch Network tab for: `POST /api/conversations/<id>/message`
- Report: HTTP status code, and first 100 chars of the response body
- Expected: 200, response contains `"content":"..."` with educational text

### T7: AI response renders
- After T6, an assistant message bubble should appear below your message
- Report: Does the bubble appear? What does it say (first 50 chars)?
- If you see "Failed to send message" or nothing: FAIL — check Console for errors

### T8: Parent dashboard
- Click "Parent" in navbar (or navigate to `#/parent`)
- Expected: Dashboard with points, conversations count, concepts count, guidelines editor
- Check Network for: `GET /api/parent/guidelines` — report status code

### T9: Add a child (new feature)
- Navigate to `#/parent`
- Look for an "Add Child" or learner management section
- If present: try adding a child with name "Test Kid" and grade 5
- Check Network for: `POST /api/learners` — report status code and response
- If no add-child UI exists: report MISSING

### T10: Prompt audit
- Navigate to `#/parent/audit`
- Expected: Table showing LLM calls (prompt type, model, content preview)
- Check Network for: `GET /api/audit/prompts?learner_id=...` — report status code
- If endpoint returns 404: the old audit view reading conversation messages may still work — report what you see

## Report

**Fill in this table completely. Leave no cell empty.**

| Test | Status | HTTP Code | Notes |
|------|--------|-----------|-------|
| T1 Health check | | | |
| T2 Auth config | | | |
| T3 Login page | | | |
| T4 Google Sign-In | | | |
| T5 Chat loads | | | |
| T6 Send message | | | |
| T7 AI response | | | |
| T8 Parent dashboard | | | |
| T9 Add child | | | |
| T10 Prompt audit | | | |

**For every FAIL:**
1. Network tab: method, full URL, status code, response body (first 200 chars)
2. Console: any red errors (copy exact text)
3. What the page actually shows (describe or screenshot)

**Paste the completed table back to the Sunschool Director agent.**
