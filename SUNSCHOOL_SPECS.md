# SUNSCHOOL v2 — Architecture & Flywheel Plan

**Date:** 2026-04-04  
**Status:** Draft for founder review  
**Thesis:** An AI tutor is a graph of conversations with characters, backed by a growing library of validated content. Ship the tutor first. Let the library emerge.

---

## 1. The Flywheel

This is the core design. Everything else serves it.

```
┌─────────────────────────────────────────────────────────┐
│                    THE SUNSCHOOL FLYWHEEL                │
│                                                         │
│   Kid chats with AI tutor                               │
│        │                                                │
│        ▼                                                │
│   Conversation generates content                        │
│   (lessons, questions, knowledge graph nodes, media)    │
│        │                                                │
│        ▼                                                │
│   Content is validated + scored                         │
│   (readability, accuracy, quiz performance)             │
│        │                                                │
│        ├──► Good content enters SHARED LIBRARY          │
│        │         │                                      │
│        │         ▼                                      │
│        │    Next kid gets faster, richer experience     │
│        │    (cache hits, proven content, pre-built      │
│        │     assets, known-good quiz questions)         │
│        │         │                                      │
│        │         ▼                                      │
│        │    More kids ──► more data ──► better          │
│        │    mastery models ──► better adaptation        │
│        │         │                                      │
│        │         ▼                                      │
│        │    Better outcomes ──► more parents ──► ♻️      │
│        │                                                │
│        └──► Bad content flagged + recycled              │
│             (fed back as negative examples to           │
│              generator agents)                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Critical insight:** The flywheel works from day 1 with ZERO pre-built content. The first kid's experience is 100% generated. The second kid's experience is ~5% cached. By kid 1,000 the library is substantial. By kid 100,000 it's comprehensive. The library is a *consequence* of usage, not a prerequisite.

---

## 2. What Ships Day 1 (MVP)

The minimum viable tutor. A kid can learn something real.

**Parent:**
- Create account (Google Identity Platform)
- Add child (name, grade level)
- See every prompt sent to the AI (prompt audit log)
- Set guidelines ("focus on math", "avoid violence")
- View conversation history

**Learner:**
- Chat-based interface with a friendly default tutor character
- "Teach me about [anything]" → tutor generates a conversational lesson
- Inline quizzes (multiple choice as chat buttons, natural language answers scored by AI)
- Points for correct answers
- Progress tracking (what concepts mastered, what needs work)

**Engine:**
- FastAPI backend
- PostgreSQL + Apache AGE on Railway (custom Docker container, persistent volume)
- Backup cron: daily pg_dump to Cloudflare R2
- Lesson generation via OpenRouter (free/cheap models)
- Content validation (grade-appropriate, safe)
- Mastery tracking via Bayesian graph in AGE
- Prompt audit table (every LLM call logged with parent read access)

**What is NOT in day 1:** Characters, Timepoint, Ouro, photo learning, modules, Stripe, paid tiers, localization, pre-built curriculum. All of these plug in later. The tutor works without them.

---

## 3. The Expansion Sequence

Each phase adds a ring to the flywheel. Order matters — each depends on the one before.

### Phase 1: Core Tutor (weeks 1-3)
- FastAPI + AGE + Identity Platform
- Single chat tutor, conversation-based lessons
- Quiz inline in chat, points, basic mastery
- Parent dashboard: prompt audit, guidelines, progress
- Deploy on Railway
- **Result:** Kids can learn. Parents can see everything.

### Phase 2: Shared Library (weeks 3-5)
- Content that scores well gets promoted to shared library
- Library nodes in AGE: lesson fragments, quiz questions, media assets, knowledge graph nodes
- Tutor checks library before generating fresh: "do we already have a good explanation of photosynthesis for grade 3?"
- Library deduplication via content hashing (TDF-style SHA-256)
- Background agents: validator (quality), fixer (improve rejected content), updater (refresh stale content)
- **Result:** Experience improves for every subsequent learner. Costs drop (cache hits vs generation).

### Phase 3: Characters (weeks 5-7)
- Character nodes in the graph: personality prompt, knowledge bounds, era, expertise
- Timepoint integration: historical characters grounded in Clockchain data
- George Washington can quiz you using real historical context
- The botanist, the mathematician, the astronaut — each a node with edges to concepts they teach
- Character handoffs: "My friend Dr. Franklin knows more about electricity"
- **Result:** Learning becomes storytelling. Engagement goes up. Differentiation from every other AI tutor.

### Phase 4: Modules + Stripe (weeks 7-9)
- Module system: a module = a FastAPI router that mounts into the engine
- Ouro as first module: upload Minecraft data → AI credential assessment
  - Free: 3 screenshot uploads
  - Paid: JSON files, bulk API, teacher admin, Minecraft scoring
- Stripe integration (test keys already exist)
- Tier structure:
  - **Free forever:** Pre-built curriculum from shared library, cheap models, basic tutor
  - **~$1/mo:** Custom topic generation, more conversations, basic Ouro
  - **~$20/mo:** Frontier models, Timepoint characters, full Ouro, photo learning, video (when available)
- **Result:** Revenue. Module extensibility proven.

### Phase 5: Rich Input (weeks 9-11)
- Photo upload → vision model identifies subject → specialist character teaches about it
- Location-aware lessons: "teach me about where I am" → geo + weather + local history
- Weather-aware, time-aware context injection (free LLM calls)
- **Result:** The "school anywhere under the sun" promise delivered literally.

### Phase 6: Standards Mapping (weeks 11-13)
- AI agents create partial coverage maps against Common Core
- Dynamic middleware: given a lesson, map it to standards it touches
- Not "we guarantee Common Core compliance" but "here's what standards this covers"
- Parent view: "your child has touched 47% of Grade 3 Math standards"
- **Result:** Institutional credibility. Homeschool parents can report to districts.

### Phase 7: Clockchain Deep Integration (weeks 13+)
- Lessons contribute back to the Clockchain as nodes with `source: "sunschool"` provenance
- Historical lessons pull full Flash-rendered scenes
- Time-travel curriculum: "walk through the signing of the Declaration of Independence"
- Pro SNAG simulations for social studies: "what would have happened if..."
- **Result:** Two-way data flywheel between Timepoint and Sunschool.

---

## 4. Architecture

### 4.1 Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| API | FastAPI (Python 3.11+) | Async, typed, OpenAPI auto-docs, easy to OSS |
| DB | PostgreSQL 16 + Apache AGE (Docker) | Graph + relational in one DB, openCypher queries. Runs as `apache/age` container on Railway, not managed Postgres. |
| Graph (compute) | NetworkX | In-memory traversal, gate evaluation, pathfinding |
| Graph (persist) | Apache AGE | Persistent graph, Cypher queries, ACID transactions |
| Auth | Google Identity Platform | gcloud CLI setup, Firebase SDK client, Admin SDK server |
| Billing | Stripe | Already have test keys, sandboxing, agent-friendly dev setup |
| AI | OpenRouter (primary) | Model routing, free tier models, fallback chains |
| AI (history) | Timepoint API | Clockchain for grounded historical content |
| Data format | TDF | SHA-256 content addressing, provenance tracking |
| Hosting | Railway | CLI deploy, auto-scaling. AGE runs as custom Docker container (apache/age image), not Railway's managed Postgres. Persistent volume at /var/lib/postgresql/data. |
| Backups | pg_dump cron → Cloudflare R2 | No managed backups with custom container; add your own backup job (daily pg_dump, weekly full) |
| Frontend | Thin client (React or just HTML) | Chat-first UX, minimal surface area |

### 4.2 Graph Schema (AGE)

**Nodes:**

```cypher
-- Characters (AI personas that teach)
(:Character {id, name, era, expertise[], personality_prompt, 
             knowledge_bounds, clockchain_refs[], active})

-- Conversations (stateful chat sessions)
(:Conversation {id, learner_id, started_at, last_active, 
                state_json, summary, message_count, status})

-- Lessons (content units, generated or from library)
(:Lesson {id, title, subject, grade_level, content_hash, 
          spec_json, validation_status, times_served, avg_score})

-- Concepts (knowledge graph nodes)
(:Concept {id, name, subject, grade_band, prerequisites[], 
           common_core_refs[]})

-- Quizzes (question sets)
(:Quiz {id, lesson_id, questions_json, content_hash})

-- Media (images, SVGs, audio, video)
(:Media {id, type, url, alt_text, content_hash, source})

-- Learner (mastery state per learner)
(:Learner {id, grade_level, subjects[], mastery_json})

-- Gate (parent controls)
(:Gate {id, gate_type, predicate_json, status, parent_id})
```

**Edges:**

```cypher
-- Teaching relationships
(:Character)-[:TEACHES {confidence}]->(:Concept)
(:Conversation)-[:DISCUSSES]->(:Concept)
(:Conversation)-[:FEATURES]->(:Character)
(:Lesson)-[:COVERS]->(:Concept)
(:Lesson)-[:INCLUDES]->(:Media)

-- Mastery & assessment
(:Learner)-[:MASTERY {level, correct, total, last_tested}]->(:Concept)
(:Learner)-[:COMPLETED {score, at}]->(:Lesson)
(:Quiz)-[:ASSESSES]->(:Concept)

-- Library provenance  
(:Lesson)-[:DERIVED_FROM]->(:Lesson)  -- library derivation
(:Lesson)-[:SOURCED_FROM {clockchain_url}]->(:Concept)  -- Timepoint
(:Conversation)-[:CONTRIBUTED]->(:Lesson)  -- conversation → library

-- Gating
(:Gate)-[:BLOCKS]->(:Lesson|:Conversation|:Character)
(:Gate)-[:OWNED_BY]->(:Learner)  -- which learner this gate applies to

-- Curriculum
(:Concept)-[:PREREQUISITE_OF]->(:Concept)
(:Concept)-[:MAPS_TO {standard_id, coverage}]->(:Standard)
```

### 4.3 Request Flow

```
Parent/Learner (thin client)
    │
    ▼
FastAPI (auth middleware: verify Firebase JWT, resolve parent→child→learner)
    │
    ├── GET /conversations/{id}/messages → retrieve + resume
    ├── POST /conversations/{id}/message → process learner input
    │       │
    │       ▼
    │   Conductor Agent (per-learner)
    │       │
    │       ├── Check mastery graph (NetworkX from AGE)
    │       ├── Check library for relevant content (AGE Cypher query)
    │       ├── Check parent gates (predicate evaluation)
    │       ├── Select/create character for topic
    │       ├── Generate response (OpenRouter / Timepoint)
    │       ├── Extract concepts, update mastery graph
    │       ├── Log prompt to audit table
    │       ├── If quiz: score, award points, check achievements
    │       └── Persist conversation state to AGE
    │
    ├── GET /audit/prompts → parent reads all LLM calls
    ├── PUT /learners/{id}/guidelines → parent sets constraints
    ├── GET /learners/{id}/progress → mastery visualization
    ├── POST /gates → parent creates approval gate
    └── PUT /gates/{id} → parent approves/rejects
```

### 4.4 Module Interface

A module is a Python package that exposes:

```python
# sunschool_modules/ouro/__init__.py

from fastapi import APIRouter

router = APIRouter(prefix="/modules/ouro", tags=["ouro"])

# Module metadata
MODULE_INFO = {
    "id": "ouro",
    "name": "Ouro Credentialing",
    "description": "AI credentialing from game data",
    "tier": "freemium",  # free | freemium | paid
    "free_limits": {"screenshot_uploads": 3},
    "paid_price_monthly_cents": 500,
}

# Routes
@router.post("/analyze")
async def analyze_game_data(...): ...

@router.get("/credentials/{learner_id}")
async def get_credentials(...): ...
```

The core engine discovers and mounts modules at startup. Stripe checks the learner's subscription tier before allowing paid module access.

### 4.5 OSS Boundary

**Open source (sunschool-engine):**
- FastAPI routes for lesson generation, quiz, mastery, prompt audit
- AGE graph schema + migrations
- NetworkX gate executor
- Content validation pipeline
- Library CRUD + dedup
- TDF integration
- Module interface spec
- Grade-specific prompt templates
- All shared library content (lessons, quizzes, media)

**Private (sunschool-app):**
- Google Identity Platform auth config
- Stripe billing integration
- Parent/learner dashboard UI
- Conductor agent (the adaptive per-learner orchestrator)
- Module implementations (Ouro, Timepoint, etc.)
- Railway deployment config
- Admin tools

**The line:** If it impacts how the AI teaches or what the parent can see → OSS. If it's business logic, billing, or UX chrome → private.

---

## 5. Learner Experience (Chat-First)

### 5.1 The SEIAR Loop

Every conversation follows this pattern, but it's invisible to the kid. They're just chatting.

```
S – Storytelling    │ Character introduces topic through narrative
E – Examples        │ Concrete examples, visuals, analogies
I – Interaction     │ Kid responds, asks questions, explores
A – Assessment      │ Quiz questions woven into conversation
R – Refinement      │ Correct misconceptions, deepen understanding
     │
     └──► Loop back to S with next concept (or rabbit hole deeper)
```

The conductor agent tracks where in the loop the learner is and adjusts. A kid who gets everything right skips to harder content. A kid who struggles gets more examples before assessment.

### 5.2 Age Adaptation

| Grade Band | Experience |
|-----------|------------|
| K-2 | Big buttons, image-heavy, tap-to-answer, simple character (friendly animal), 5-word sentences, parent sits alongside |
| 3-5 | Chat with short messages, multiple choice as buttons, characters with personality, vocabulary scaffolding |
| 6-8 | Full chat, natural language answers scored by AI, character handoffs, deeper rabbit holes, double-or-loss points |
| 9-12 | Conversation-first, Socratic method, characters debate each other, essay-style responses, primary source analysis |

The frontend is one codebase. The conductor agent adjusts message length, vocabulary, interaction style, and character selection based on grade level.

### 5.3 "Teach Me About Where I Am"

```
Learner taps "Teach me about where I am"
    │
    ├── Geo lookup → San Jose, California
    ├── Weather API → 72°F, sunny
    ├── Clockchain query → local historical events
    ├── Grade-appropriate character selected
    │
    ▼
Character: "Hey! You're in San Jose — did you know this used to be
the biggest city in California before San Francisco? The Ohlone 
people lived here for thousands of years before that. Want to 
learn about the Ohlone, or about how San Jose became the tech 
capital of the world?"
    │
    ▼
Kid picks → rabbit hole begins → mastery graph grows
```

---

## 6. Parent Control (Non-Negotiable)

### 6.1 Prompt Audit

Every LLM call stored:

```sql
CREATE TABLE prompt_audit (
    id UUID PRIMARY KEY,
    learner_id UUID REFERENCES users(id),
    conversation_id UUID,
    prompt_type TEXT,        -- lesson_gen | quiz_gen | assessment | character_dialog
    system_message TEXT,     -- full system prompt
    user_message TEXT,       -- what was sent as user turn
    model TEXT,              -- which model was used
    response_preview TEXT,   -- first 500 chars of response
    tokens_used INT,
    cost_estimate DECIMAL,
    created_at TIMESTAMPTZ
);
```

Parent sees: every instruction the AI received before talking to their kid. Filterable by type, date, conversation.

### 6.2 Gates

Parent can create gates that block specific content or require approval:

- `APPROVAL_REQUIRED` — lesson is queued, parent must approve before kid sees it
- `TOPIC_BLOCKED` — "no content about [X]"
- `MODEL_RESTRICTED` — "only use [specific model]"
- `TIME_LIMITED` — "max 30 min/day"
- `CONCEPT_GATE` — "don't advance past [concept] until I say so"

Gates are edges in the AGE graph. The conductor agent checks them on every turn.

### 6.3 Data Ownership

- Export all child data as JSON (one click)
- Delete child account (cascade delete, AGE nodes included)
- Optional: sync to parent's own Postgres (one-way push replication)

---

## 7. Cost Model

### 7.1 Per-Learner Economics

| Activity | Model | Cost/call | Calls/session | Sessions/day |
|----------|-------|-----------|---------------|-------------|
| Lesson generation | gemini-2.0-flash (free) | $0.00 | 1 | 1 |
| Quiz scoring | gemini-2.0-flash (free) | $0.00 | 3-5 | 1 |
| Character dialog | gemini-2.0-flash (free) | $0.00 | 10-20 | 1 |
| Mastery update | local (NetworkX) | $0.00 | per-answer | — |
| SVG generation | gemini-flash | ~$0.001 | 2 | 1 |

**Free tier cost per learner:** ~$0.002/day = ~$0.06/month. At 10K learners = $600/mo.

| Activity | Model | Cost/call |
|----------|-------|-----------|
| Frontier dialog | claude-sonnet-4 | ~$0.01 |
| Photo analysis | claude-sonnet-4 vision | ~$0.02 |
| Timepoint Flash scene | Timepoint API | credits |

**Paid tier cost per learner:** ~$0.30-1.00/day = $9-30/month. $20/mo price point works.

### 7.2 Infrastructure

| Service | Cost |
|---------|------|
| Railway (app + DB) | ~$20-50/mo at low scale |
| Google Identity Platform | Free under 50K MAU |
| Stripe | 2.9% + $0.30 per transaction |
| Domain + DNS | ~$20/yr |

**Break-even:** ~30 paid subscribers at $20/mo covers infrastructure + API costs with margin.

---

## 8. Ground Truth & Migration Strategy

### 8.1 Current State (as of 2026-04-04)

| Asset | State | Action |
|-------|-------|--------|
| `sunschool` repo (OSS) | Clean slate ("coming soon" placeholder) | Scaffold v2 directly |
| `sunschool-deployed-private` | Clean slate | Scaffold v2 private layer directly |
| Railway project | 2 environments (prod/dev), web service + managed Postgres, `sunschool.xyz` domain working | Keep project. Replace managed Postgres with AGE Docker container. Keep domain. |
| Railway Postgres (prod) | Empty (0 MB) | Nothing to migrate. Remove after AGE container is up. |
| Railway Postgres (dev) | 1.1 GB (v1 data) | Archive if desired, then remove. Not needed for v2. |
| GitHub CI/CD | Zero workflows, zero secrets | Rebuild from scratch for v2 |
| CLAUDE.md | Describes v1 Express/React patterns | **Replace first** — must reflect FastAPI/AGE/Python before any agent touches code |
| Stoneforge workspace | Fresh, 4 default agents | Reconfigure to 6 agents (see below) |
| sunschool-docs (Mintlify) | v1 docs, stale | Freeze until v2 API is stable |
| sunschool-dev-management | Default branch set to old agent branch, not main | Fix immediately |

### 8.2 Migration

**This is a rebuild, not a migration.** v1 (Node/Express/React/Neon) is a prototype. Learnings carried forward:

- Grade-specific prompt templates → port to Python
- Content validation logic → port to Python
- E2E test patterns → rewrite for new API (Playwright against FastAPI)
- Gamification design (points, achievements, rewards) → same logic, new schema

**No data migration needed.** Production DB is empty. Dev DB is v1 artifacts only. Clean start.

**Repo strategy:** Scaffold directly into existing repos (they're empty). `sunschool` = OSS engine. `sunschool-deployed-private` = private app layer, Railway config, auth, billing.

### 8.3 Stoneforge Agent Configuration (v2)

6 agents, down from 16 in v1. Build phase needs fewer, broader workers.

| Agent | Role | Scope |
|-------|------|-------|
| **director** | Strategic planning, task breakdown, priority | Does NOT write code |
| **steward** | Code review, branch merging, doc scanning | Persistent, handles merges |
| **python-backend** | FastAPI routes, AGE schema, services, prompt templates, validation | Primary builder |
| **frontend-client** | Thin chat UI, parent dashboard, learner interface | React or HTML |
| **infra-ops** | Railway deployment, AGE Docker, backup cron, CI/CD, Identity Platform | DevOps |
| **e2e-testing** | Playwright tests against FastAPI, persona-based (parent, learner, admin) | Quality gate |

Workers are ephemeral (git worktrees, one task at a time). Steward is persistent.

### 8.4 First Stoneforge Plan: "v2 Foundation"

Execution order (dependencies respected):

```
1. Replace CLAUDE.md with v2 conventions (FastAPI, Python, AGE, no mocks)
2. Scaffold FastAPI project structure in sunschool repo
3. CI workflow: lint, type-check, test (GitHub Actions)
4. AGE Docker container on Railway (replace managed Postgres)
5. Google Identity Platform setup (gcloud CLI)
6. AGE graph schema (nodes + edges from Section 4.2)
7. Auth middleware (Firebase JWT verification)
8. First endpoint: POST /conversations → create chat session
9. Sync workflow: push to main → Railway auto-deploy
```

---

## 9. Day-1 Implementation Checklist

```
PREREQUISITES (before any code):
[ ] Fix sunschool-dev-management default branch → main
[ ] Replace CLAUDE.md with v2 conventions (FastAPI, Python, AGE, no mocks)
[ ] Archive/remove Railway managed Postgres (prod is empty, dev is v1 artifacts)

INFRASTRUCTURE:
[ ] Railway: deploy apache/age Docker template (or custom Dockerfile), verify persistent volume
[ ] Railway: deploy FastAPI app as separate service, connect to AGE via internal networking
[ ] Backup job: pg_dump cron to R2 (daily), since custom container has no managed backups
[ ] Google Identity Platform: enable API, configure Google sign-in via gcloud CLI
[ ] GitHub Actions: lint + type-check + test workflow

CORE ENGINE:
[ ] AGE schema: Character, Conversation, Lesson, Concept, Learner nodes + edges
[ ] FastAPI auth middleware: verify Firebase JWT, resolve parent→child→learner roles
[ ] POST /conversations — create new chat session
[ ] POST /conversations/{id}/message — send message, get AI response
[ ] GET /conversations/{id}/messages — retrieve history
[ ] Conductor agent: generate lesson content, score answers, update mastery
[ ] Grade-specific prompt templates (K-2, 3-5, 6-8, 9-12)
[ ] Content validation: readability, safety, grade-appropriateness
[ ] Prompt audit table + GET /audit/prompts endpoint

PARENT + LEARNER:
[ ] Parent: add child, set guidelines, view progress
[ ] Learner: chat interface, points display, mastery summary

SHIP:
[ ] Deploy to Railway, smoke test against sunschool.xyz
```

---

## 10. Open Questions

1. **~~AGE on Railway~~ RESOLVED:** Community template exists at `railway.com/deploy/apache-age` (by `umbrella.coop`, Feb 2026, `apache/age` Docker Hub image, 100% deploy success rate). It's a custom Docker container, not Railway's managed Postgres. Persistent volume at `/var/lib/postgresql/data`. You manage Postgres config, upgrades, and connection pooling yourself inside the container. Railway provides networking, SSL via TCP proxy, auto-restart, and scaling. **You must add your own backup job** (pg_dump cron to R2 or S3) since managed backups don't apply to custom containers. Standard Postgres drivers (psycopg2, SQLAlchemy) connect normally. Every connection must run `LOAD 'age';` and `SET search_path = ag_catalog, "$user", public;` — handle this in a connection pool init hook. Alternative: skip the template and write a 3-line Dockerfile pulling `apache/age` — identical result, more control over Postgres version.

2. **NetworkX ↔ AGE sync:** NetworkX operates in-memory for fast traversal/gate-checking. AGE is the persistence layer. Need a clean pattern for loading subgraphs into NetworkX and writing back. Likely: load learner's local neighborhood on session start, write back on session end.

3. **Conversation context window:** A semester of chatting = enormous context. Strategy: store full transcript in DB, inject only (a) last N messages + (b) compressed summary + (c) relevant mastery state into each LLM call. The conductor agent manages this compression.

4. **K-2 UX:** Chat doesn't work for 5-year-olds. Day-1 can target grade 3+ and add a tap/visual mode for younger kids in Phase 5. Or: the parent reads the chat to the kid and taps answers. Test with real families.

5. **Timepoint API key management:** Sunschool backend calls Timepoint API on behalf of learners. One service account key, not per-user keys. Credits charged to the Sunschool account, billed through to paid subscribers.

6. **GitHub branch hygiene:** `sunschool-dev-management` default branch is set to an old agent branch, not main. Fix before any v2 work begins — agents will push to the wrong target otherwise.

---

*Ship the tutor. Let the library grow. Add modules. Collect revenue. The rest follows.*