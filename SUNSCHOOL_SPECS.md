# SUNSCHOOL — Product Specification

Platform-agnostic specification for a ground-up rebuild. Describes WHAT the system does, not HOW it's built.

---

## 1. User Personas

### 1.1 Parent
A non-technical adult managing one or more children's education. Needs transparency into what the AI teaches, control over content, and visibility into progress. May access from phone, tablet, or desktop.

### 1.2 Learner (Child)
A K-12 student, age 5-18. Interacts with lessons, quizzes, and a reward system. Needs a distraction-free, age-appropriate interface. Should not be able to accidentally (or intentionally) exit learner mode, access adult controls, or manipulate prompts.

### 1.3 Admin
A system operator who manages users, monitors AI output quality, maintains data integrity, and resolves issues. May be the same person as a Parent.

---

## 2. User Flows

### 2.1 First-Time Parent
1. Arrive at public landing page
2. Navigate to registration
3. Create account (username, email, name, password 8+ chars)
4. Accept age/terms disclaimer
5. Redirected to dashboard (empty state)
6. Add first child (name, grade level K-12)
7. See child card appear on dashboard
8. Click "Start Learning as [child]" → enter learner mode

### 2.2 Returning Parent
1. Login (username + password + disclaimer)
2. See dashboard with child card(s): lesson count, average score, achievement count
3. View reports (progress analytics, lesson history, subject breakdown)
4. Review prompt transparency logs (every AI instruction visible)
5. Set custom guidelines ("focus on multiplication", "avoid dinosaur topics")
6. Set content restrictions ("no violence", "secular only")
7. Enable/disable lesson approval (manual review before child sees lesson)
8. Manage rewards catalog (create, edit, deactivate, delete)
9. Approve or reject redemption requests from children
10. Export child's data as structured download
11. Optionally sync data to external database

### 2.3 Learner Starting a Lesson
1. Enter learner mode (parent clicks "Start Learning" or child opens app)
2. See learner home with subject options and active lesson (if any)
3. Select subject or tap "New Lesson"
4. Loading state while lesson generates (10-30s typical)
5. Lesson cover card: title, description, estimated duration, difficulty, grade
6. Navigate through content cards (sections with text + illustrations)
7. Reach recap card with key vocabulary
8. Begin quiz (3+ multiple-choice questions)
9. Optionally double-down on questions for 2x points (risk: lose 1 point if wrong)
10. Submit answers → see score, correct/incorrect breakdown, explanations
11. Points awarded. Achievement unlocked if criteria met
12. Return to learner home. Next lesson may be pre-loaded

### 2.4 Learner Managing Rewards
1. Navigate to Goals page via footer
2. See parent-created reward goals with token cost and savings progress
3. Delegate earned points toward a specific goal
4. When savings >= cost, request redemption
5. Wait for parent approval
6. See approval/rejection status in redemption history

### 2.5 Parent-to-Learner Mode Switch
1. Parent taps "Start Learning as [child]" on dashboard
2. App switches to learner UI — simplified navigation, child-friendly design
3. To return: triple-tap a lock icon in footer (1.5s window) — prevents accidental child exit
4. Brief discoverable hint on first visit ("Tap 🔒 3× for parent mode")

### 2.6 Session Lifecycle
1. JWT token issued at login/registration, expires after 7 days
2. Token persisted client-side across page reloads
3. On expiry: parent sees login page; child sees friendly "Time to get a grown-up!" screen
4. Logout clears token and redirects to public page
5. Password change requires current password. Minimum 8 characters
6. Forgot password generates reset link (logged to console — no email delivery implemented)

---

## 3. Feature Specifications

### 3.1 Authentication & Authorization

**Registration:**
- Required: username (unique), email (unique, valid format), name, password (8+ chars), role (PARENT default)
- First registered user auto-promoted to ADMIN
- Client-side + server-side password minimum enforcement
- Duplicate username/email: 409 error

**Login:**
- Username + password
- Age/terms disclaimer checkbox required
- Rate limited: 20 attempts per 15-minute window

**Roles & Permissions:**

| Capability | Admin | Parent | Learner |
|---|:---:|:---:|:---:|
| Create/delete child accounts | ✓ | Own children | — |
| View/edit child profiles | Any | Own children | Own profile |
| Create lessons | Any learner | Own children | Self only |
| Submit quiz answers | ✓ | Own children | Self only |
| View reports/achievements | Any | Own children | Own data |
| Manage rewards | ✓ | Own catalog | View + save + redeem |
| Approve/reject redemptions | ✓ | Own children's | — |
| Set prompt guidelines/restrictions | ✓ | Own children | — |
| Enable lesson approval mode | ✓ | Own children | — |
| View prompt audit logs | ✓ | Own children | — |
| Export learner data | ✓ | Own children | — |
| Manage sync configs | ✓ | Own configs | — |
| Admin panel (users, templates, analytics) | ✓ | — | — |
| Manage lesson templates | ✓ | — | — |
| Maintenance (orphans, reconciliation) | ✓ | — | — |

### 3.2 Lesson Generation

**Inputs:**
- Subject (from learner profile or explicit)
- Grade level (K-12, numeric 0-12)
- Topic (optional — auto-derived from subject if omitted)
- Difficulty (beginner / intermediate / advanced)
- Learner ID

**Processing:**
1. Input safety validation: regex whitelist (letters, numbers, basic punctuation, max 200 chars) + 20+ injection pattern checks + optional guardrails service
2. Template deduplication: content hash of (subject, grade, topic, difficulty). If match exists, reuse cached spec
3. If no template: AI generates lesson with grade-appropriate constraints:
   - Word limits by grade band: K-2: 75, 3-4: 200, 5-6: 400, 7-8: 700, 9-12: 1200
   - Sentence length caps: K-2: 5 words, 3-4: 8, 5-6: 12, 7-8: 15
   - Vocabulary restrictions by grade (banned complex words for younger learners)
   - Parent guidelines and content restrictions injected into prompt
4. Structural validation: non-empty title, 2+ sections, 2+ questions, no placeholder patterns, 10+ chars per section
5. Failed validation logged with rejection reason
6. If lesson approval enabled: status QUEUED (parent must approve). Otherwise: ACTIVE
7. Previous active lesson auto-retired (scored 0) before new one activates
8. Stale active lessons (>30 min, no quiz answers) auto-retired

**Outputs (Lesson Spec):**
- Title, subtitle, summary, target grade level
- Sections (5 typical): introduction, key_concepts, examples, practice, summary — each with heading, content, type
- Images: per-section illustrations with description, alt text, SVG/base64 data
- Diagrams: concept maps, flowcharts, comparisons, cycles
- Questions (3 typical): text, 4 options, correct index, explanation, optional difficulty/type
- Keywords, related topics, estimated duration, difficulty level
- Knowledge graph: nodes (concepts) and edges (relationships)

**Image Generation (background, after lesson response):**
- Fallback chain: AI image → AI SVG → Deterministic fallback
- AI SVG prompts include lesson title, section content, grade level — not just subject category
- Prompts encourage labeled diagrams, annotations, arrows, visual metaphors
- Deterministic fallback shows topic title, subject-relevant emoji, "illustration unavailable" notice
- Max images per lesson configurable (default 2)

**Template Library:**
- Successful lessons stored as reusable templates
- Deduplication by content hash
- Serve count and average score tracked
- Admin can list, delete individual, or purge all templates

### 3.3 Quiz System

**Inputs:**
- Answers: array of selected option indices (plain integers)
- Optional: double-or-loss flag (per-question or whole-quiz)
- Optional: indices of "doubled" questions

**Processing:**
1. Score = (correct count / total questions) × 100, rounded
2. Lesson status updated to DONE with score
3. Individual answers stored with concept tags for mastery tracking
4. Question hashes stored for deduplication (avoid repeats for 30 days)
5. Concept mastery updated per concept: correct/total count, 0-100 mastery level, needsReinforcement below 70%
6. Achievement check: FIRST_LESSON (1 done), FIVE_LESSONS (5 done), PERFECT_SCORE (100%)
7. Points awarded: 1 per correct (2 if doubled), -1 per wrong doubled (clamped to 0)
8. Template average score updated if lesson was from cache
9. Background: next lesson pre-generated for learner

**Outputs:**
- Score percentage, correct/total counts
- Points awarded/deducted, new balance
- New achievements (if any)
- Double-or-loss summary

**Question Types:**
- Multiple choice (4 options)
- True/false
- Image-based (question references an illustration)
- Sequence ordering

### 3.4 Points & Rewards

**Points Earning:**
| Source | Amount |
|---|---|
| Correct quiz answer | +1 |
| Correct answer (doubled) | +2 |
| Wrong answer (doubled) | -1 (floor 0) |
| Achievement unlock | Configurable |
| Admin adjustment | ±N |

**Reward Lifecycle:**
1. Parent creates reward: title, description, token cost, emoji, color, optional max redemptions
2. Learner views available rewards with savings progress
3. Learner delegates points from balance → specific goal (atomic: debit balance, credit savings)
4. When savings ≥ cost: learner requests redemption → PENDING
5. Only one pending redemption per reward per learner
6. Parent approves → savings zeroed, redemption count incremented. If max reached: reward auto-deactivated, other learners refunded
7. Parent rejects → savings preserved, learner can re-request
8. Parent deactivates/deletes reward → all learners' savings refunded

**Starter Rewards:** 3 created automatically when a new learner is added:
- Extra Recess (10 tokens)
- Pick a Movie (25 tokens)
- Special Outing (50 tokens)

**Double-or-Loss Mode:**
- Enabled per learner by parent
- Supports per-question or whole-quiz doubling
- Every 3rd question can be doubled (UI convention)

### 3.5 Prompt Transparency

**What Parents See:**
- Full system prompt and user message for every AI call
- Filterable by type: lesson generation, quiz generation, SVG generation, feedback, knowledge graph
- Model name, temperature setting, response preview (first 500 chars), token usage
- Per-learner or per-lesson views

**What Parents Control:**
- Custom guidelines (max 500 chars) injected into lesson generation prompts
- Content restrictions (max 500 chars) injected as avoidance instructions
- Lesson approval toggle: when enabled, new lessons are QUEUED until parent approves/rejects
- All parent inputs validated through same safety checks as student inputs

### 3.6 Data Export

**Trigger:** Parent or admin requests export for a specific learner
**Format:** JSON file download
**Contents:** Learner profile, all lessons (up to 1000), all achievements, all prompt log entries, export metadata
**Privacy:** Password field stripped from learner data

### 3.7 Database Sync

**Purpose:** One-way push replication to parent's own PostgreSQL database
**Flow:**
1. Parent configures target DB URL (validated PostgreSQL connection string)
2. Manual push or continuous sync flag
3. Syncs: parent user, child users, learner profiles, lessons (up to 1000 per child), achievements
4. Creates/updates schema on target automatically
5. Status tracking: IDLE → IN_PROGRESS → COMPLETED/FAILED with error messages

### 3.8 Safety & Guardrails

**Input Validation:**
- Topic/subject: alphanumeric + common punctuation, max 200 chars
- 20+ injection pattern detections (prompt injection, jailbreak, env exfiltration, XSS, eval, sudo, etc.)
- User inputs wrapped in delimiters with explicit "treat as topic label" instruction in LLM prompts
- Optional AI-based guardrails service (heuristic mode, configurable threshold)

**Content Validation:**
- Flesch-Kincaid readability scoring
- Grade-appropriate vocabulary enforcement (banned complex words by grade band)
- Sentence length limits by grade
- Structural validation (no empty sections, no placeholder text)

**Rate Limiting:**
- Auth endpoints: 20 per 15 minutes per IP
- Feedback: 10 per hour per IP

**Password Security:**
- Scrypt hashing with random salt
- Timing-safe comparison
- 8-character minimum enforced client + server

### 3.9 Admin Operations

**User Management:**
- List all parents
- Purge test users (email matching pattern, non-admin)

**Template Management:**
- List all templates with metadata (subject, grade, topic, serve count, avg score)
- Delete individual templates
- Bulk delete all templates

**Analytics:**
- Total lessons, templates, average scores
- Top/low-performing templates
- Validation rejection rates
- Subject distribution breakdown

**Maintenance:**
- Detect/fix orphaned images (lessons with broken image arrays)
- Detect partial quizzes (fewer answers than questions)
- Detect/fix points balance mismatches (ledger sum vs recorded balance)
- Circuit breaker status for all external services

**Auto-Tuner:**
- Analyzes validation rejection patterns by model and subject
- Identifies high-rejection combinations
- Manual trigger or scheduled (15-minute interval)

### 3.10 Achievement System

| Achievement | Trigger | Icon |
|---|---|---|
| First Steps | First lesson completed | award |
| Learning Explorer | 5 lessons completed | book-open |
| Perfect Score! | 100% quiz score | star |

- Checked after every quiz submission
- Deduplicated (each type earned once)
- Displayed with title, description, icon

### 3.11 Subject & Mastery System

**Grade-Appropriate Subjects (K-12):**
- K: Alphabet, Numbers, Colors, Shapes, Animals, Seasons
- 3-4: Multiplication, Fractions, Earth Science, US Geography, Paragraph Writing
- 7-8: Algebra, Biology, World History, Literary Analysis, Research Skills
- 9-12: Calculus, Chemistry, Government, Economics, Literary Criticism
- 8 categories: Language Arts, Mathematics, Science, Social Studies, Arts, Life Skills, World Languages, Technology

**Mastery Tracking:**
- Per-concept: correct/total counts, 0-100 mastery score
- Needs reinforcement below 70%
- Subject performance: per-subject average score, lesson count, mastery level (beginner/intermediate/advanced)
- Mastery thresholds: ≥85% score + 5 lessons = advanced; ≥70% + 3 = intermediate

**Question Deduplication:**
- Question content hashed and stored per learner per topic
- LLM receives avoidance instructions with recent hashes (30 days, up to 50)
- Hashes expire after 90 days (spaced repetition)

---

## 4. UI Structure

### 4.1 Public Pages
- **Landing/Welcome:** Product overview, feature highlights, call to action
- **Auth:** Login/register forms with age disclaimer, forgot/reset password
- **Privacy Policy:** Static legal content
- **Terms of Service:** Static legal content

### 4.2 Parent/Admin Pages
- **Dashboard:** Child cards (name, grade, stats), add/remove children, mode switch
- **Reports:** Per-learner analytics (lessons completed, score trends, subject distribution, concept mastery)
- **Rewards:** CRUD reward catalog, pending redemption approvals
- **Prompts:** Audit log of all AI interactions, filterable
- **Prompt Settings (per child):** Guidelines, restrictions, approval toggle
- **Database Sync:** Configure external DB, trigger push
- **Data Export:** Download learner data
- **Admin Panel:** Users, templates, analytics, maintenance, circuit breakers

### 4.3 Learner Pages
- **Learner Home:** Active lesson, subject picker, recent achievements, token balance, progress summary
- **Lesson View:** Card-based content navigation (cover → sections → recap → quiz)
- **Quiz:** Question cards with options, double-or-loss toggle, submit, results with score/confetti
- **Progress:** Mastery breakdown, lesson history, subject performance
- **Goals:** Reward list with savings progress, delegate points, request redemption, history

### 4.4 Navigation
- **Parent mode:** Header with logo, Dashboard, Prompts, Logout. Footer with nav links + social
- **Learner mode:** Simplified header (child name only). Footer with Home, Progress, Goals, Lock (triple-tap exit)
- **404:** Mode-aware (kid-friendly "page got lost" vs standard "not found")

### 4.5 Responsive Requirements
- Must work at phone viewport (390px wide) through desktop (1280px+)
- Layout responds to rotation/resize (not static at load time)
- Touch-friendly targets for child users

---

## 5. Test Requirements

### 5.1 E2E Test Coverage

**Journeys (end-to-end user flows):**
- First-time parent: register → add child → start learning → generate lesson → quiz → score → done
- Returning learner: login → resume lesson → quiz → progress check
- Parent oversight: login → view reports → review prompts → set guidelines → approve lesson
- Session & errors: 404 handling, expired session, mode guards, admin redirect

**Parent persona:**
- Dashboard loads, child cards render
- Add/edit/remove child
- Update subjects, grade level
- Navigate reports, rewards, prompts
- Password recovery flow
- Login, logout, session persistence
- Data export integrity
- Database sync CRUD
- Lesson approval workflow (enable, queue, approve, reject)
- Prompt settings (guidelines, restrictions, approval toggle)

**Learner persona:**
- Lesson generation and content display
- Card carousel navigation (cover, sections, recap)
- Quiz flow (answer, submit, score, points)
- Input safety (injection attempts rejected, normal topics allowed)
- Points and rewards (earn, view balance, save toward goal, see progress)
- Achievements (first lesson, five lessons, perfect score)
- SVG rendering quality (real illustrations, not placeholders)
- Stress tests: spam-click, refresh during generation, rapid navigation, error recovery

**Admin persona:**
- Navigate admin pages (users, lessons, settings)
- Access analytics, circuit breakers
- Clean up test users
- Template management

**Public persona:**
- Welcome page loads
- Auth page shows login/register
- Privacy/terms pages load
- Unauthenticated access redirects properly

### 5.2 Test Principles
- No mocks — real database, real APIs, real services
- Tests run against production deployment
- Each test either uses full session setup or lightweight session reuse (for speed)
- Tests handle AI service unavailability gracefully (skip, not fail)
- Tests handle billing limits gracefully (skip SVG assertions on 402/403)
- Admin tests use env-var credentials (never hardcoded)
- Headed mode must work (all timeouts account for visual rendering latency)
- Answer format must match server expectation (plain indices, not objects)

### 5.3 Quality Gates
- Lesson spec validation: title, 2+ sections, 2+ questions, no placeholders, 10+ chars per section
- SVG quality: images include lesson topic context, labeled diagrams, not generic shapes
- Points integrity: ledger sum matches recorded balance (reconciliation check)
- Data isolation: parents cannot access other parents' children
- Rate limits enforced on auth and feedback endpoints
- Password minimum enforced client-side and server-side

---

## 6. Data Model (Logical)

### 6.1 Entities

**User:** id, username (unique), email (unique), name, role (ADMIN/PARENT/LEARNER), password (hashed), parentId (self-ref), createdAt

**Learner Profile:** id, userId (FK User), gradeLevel (0-12), subjects (list), subjectPerformance (per-subject stats), recommendedSubjects, strugglingAreas, parentPromptGuidelines, contentRestrictions, requireLessonApproval, knowledgeGraph, doubleOrLossEnabled, createdAt

**Lesson Template:** id, contentHash, subject, gradeLevel, topic, difficulty, spec (structured content), title, timesServed, avgScore, createdAt

**Lesson:** id, learnerId (FK User), templateId (FK Template, nullable), status (QUEUED/ACTIVE/DONE), subject, category, difficulty, spec (structured content), images (inline), score, createdAt, completedAt

**Quiz Answer:** id, learnerId, lessonId, questionIndex, questionText, questionHash, userAnswer, correctAnswer, isCorrect, conceptTags (list), answeredAt

**Concept Mastery:** id, learnerId, conceptName, subject, correctCount, totalCount, masteryLevel (0-100), lastTested, needsReinforcement, createdAt

**Achievement:** id, learnerId, type, payload (title/description/icon), awardedAt

**Reward:** id, parentId, title, description, tokenCost, category, isActive, maxRedemptions, currentRedemptions, emoji, color, createdAt

**Reward Goal Savings:** id, learnerId, rewardId, savedPoints (unique per learner+reward)

**Reward Redemption:** id, learnerId, rewardId, tokensSpent, status (PENDING/APPROVED/REJECTED), timesRedeemed, requestedAt, approvedAt/rejectedAt/completedAt, parentNotes, learnerNotes

**Points Ledger:** id, learnerId, amount, sourceType, sourceId, description, createdAt

**Learner Points (materialized):** learnerId (unique), currentBalance, totalEarned, totalRedeemed

**Prompt Log:** id, lessonId, learnerId, promptType, systemMessage, userMessage, model, temperature, responsePreview, tokensUsed, createdAt

**Feedback Submission:** id, message, email, userId, userAgent, page, createdAt

**DB Sync Config:** id, parentId, targetDbUrl, lastSyncAt, syncStatus, continuousSync, errorMessage, createdAt

**Questions History:** id, learnerId, topic, questionHash (unique per learner+topic+hash), createdAt

**Lesson Validation Log:** id, subject, topic, gradeLevel, model, passed, rejectionReason, specSnapshot, createdAt

### 6.2 Key Relationships
- User → User (parent-child, cascade delete)
- User → Learner Profile (1:1)
- User → Lessons (1:many, via learnerId)
- Lesson → Lesson Template (many:1, nullable, set null on delete)
- Lesson → Quiz Answers (1:many, cascade delete)
- User → Achievements (1:many)
- User → Concept Mastery (1:many)
- User (Parent) → Rewards (1:many)
- User (Learner) + Reward → Reward Goal Savings (1:1 per pair)
- Reward → Reward Redemptions (1:many)
- Lesson → Prompt Log (1:many, cascade delete)
- User → Points Ledger (1:many)
- User (Parent) → DB Sync Configs (1:many, cascade delete)

---

## 7. External Dependencies

| Dependency | Purpose | Required |
|---|---|---|
| LLM API (text generation) | Lesson content, quiz questions, knowledge graphs | Yes |
| LLM API (SVG generation) | Educational illustrations | No (deterministic fallback exists) |
| Image generation API | Raster lesson images | No (SVG or fallback) |
| PostgreSQL database | Primary data store | Yes |
| AI guardrails service | Enhanced prompt injection detection | No (regex fallback exists) |

---

## 8. Non-Functional Requirements

- **Latency:** Lesson generation 10-30s typical. Quiz submission <2s. Page navigation <1s
- **Resilience:** Circuit breaker on external APIs (3 failures → OPEN, 60s cooldown). Template cache serves during outages. All image generation has deterministic fallback
- **Data ownership:** Parents can export all child data. Parents can delete child accounts (cascade). Parents can sync to their own database
- **Security:** Passwords scrypt-hashed. JWTs with env-var secret. No admin credentials in source code. Rate limiting on auth. Input validation on all user-supplied text. Timing-safe password comparison
- **Privacy:** No analytics beyond optional Plausible. No data sold or used for training. Password fields stripped from all API responses and exports
- **Concurrency:** Atomic point operations. Unique constraints prevent duplicate saves. Retry logic for DB conflicts
- **Observability:** Prompt logging for all AI calls. Validation logging for all generated content. Circuit breaker state visible to admin. Maintenance checks for data integrity
