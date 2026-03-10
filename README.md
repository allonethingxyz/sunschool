<p align="center">
  <img src="client/public/logo.svg" alt="SUNSCHOOL" width="400">
</p>

<h3 align="center">School — anywhere under the sun.</h3>

<p align="center">
  An AI tutor that adapts to your child. Open source, so you can see exactly how it works.
</p>

<p align="center">
  <a href="https://sunschool.xyz">sunschool.xyz</a> · <a href="https://github.com/allonethingxyz/sunschool/issues">Issues</a> · <a href="#contributing">Contribute</a> · <a href="https://allonething.xyz">All One Thing Labs</a>
</p>

---

## Your child's tutor. Their pace. Their place.

Sunschool is an AI-powered tutor that meets your kid where they are — grade level, learning style, speed. Every lesson adapts in real time. No two kids get the same experience.

It works on a blue-light-free e-reader tablet that runs on solar and satellite — no Wi-Fi, no outlet, no classroom required. Backyard. Beach. Backseat. If the sun's out, school's on.

### What kids experience

- **Lessons that feel like theirs** — The AI adjusts to how your child actually learns, not a grade-wide average.
- **Play, not homework** — Quizzes feel like games. Challenges feel like puzzles. They'll ask to do more.
- **Trophies and streaks** — Badges and milestones keep momentum going. Progress they can see and celebrate.
- **A map of everything they know** — Subjects connect visually. Kids see where they've been and what's next.

### What parents get

- **See everything, in real time** — Live progress on strengths, gaps, and growth. Not a report card — a dashboard.
- **Your data stays yours** — Nothing gets sold. Nothing trains a model. Export or delete anytime.
- **All your kids, one account** — Each child gets their own adaptive path. Add learners as your family grows.
- **Open source, all the way down** — Read the code. Audit the prompts. Self-host if you want. Education you can verify, not just trust.

### Up and running in minutes

1. **Sign up** — Email and password. No credit card. No trial clock.
2. **Add your child** — Name, grade, interests. The AI takes it from there.
3. **Start learning** — Hand them the tablet. Go pour your coffee.

---

## Technical Overview

### Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + TypeScript, React Native Web, React Query, Wouter, Vite |
| Backend | Node.js 22, Express.js 5, JWT auth, Drizzle ORM |
| Database | PostgreSQL (Neon serverless) |
| AI | OpenRouter API (primary), Bittensor Subnet 1 (experimental), Perplexity API |
| Deployment | Railway (NIXPACKS), auto-deploy on push to `main` |
| Testing | Jest (unit), Playwright (e2e) |

### Architecture

```
client/          React frontend (Vite)
server/          Express.js API with JWT auth
shared/          TypeScript schemas and types
scripts/         Database and utility scripts
drizzle/         Migration files
tests/           Playwright e2e tests
```

### Key Features

- **AI-Generated Lessons** — Grade-specific prompts (K-2, 3-4, 5-6, 7-8, 9+) with age-appropriate validation
- **SVG Illustrations** — Dynamically generated subject-specific educational graphics
- **Parent-as-Learner Mode** — Parents switch to learner view to see what their kids see
- **Concept Mastery** — Track performance across specific concepts with spaced repetition
- **Gamification** — Points economy, parent-managed rewards shop, goal setting, redemption approval workflow
- **Multi-Provider AI** — OpenRouter primary with Bittensor fallback
- **Database Sync** — Optional external PostgreSQL connections for data backup
- **Auto Migrations** — Schema updates applied on server startup

### User Roles

| Role | Access |
|------|--------|
| **Admin** | Full system access, user management, all data |
| **Parent** | Manage children, view progress, configure sync, manage rewards |
| **Learner** | Access lessons, take quizzes, view achievements, redeem rewards |

## Self-Hosting

### Prerequisites

- Node.js v20+ (v22 recommended)
- PostgreSQL database
- npm

### Setup

```bash
git clone https://github.com/allonethingxyz/sunschool.git
cd sunschool
npm install
```

### Environment

Create `.env`:

```env
DATABASE_URL=postgresql://user:password@host:port/database
JWT_SECRET=your-jwt-secret-key
SESSION_SECRET=your-session-secret
OPENROUTER_API_KEY=your-openrouter-key
PERPLEXITY_API_KEY=your-perplexity-key
PORT=5000
```

### Run

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

The first user to register is auto-promoted to Admin.

### Database

Migrations run automatically on startup. Manual commands:

```bash
npm run migrate        # Run migrations
npm run db:push        # Push schema changes
npm run db:seed        # Seed with test data
```

### Railway

Push to `main` triggers auto-deploy. Health check at `/api/healthcheck`.

## API Reference

<details>
<summary>Authentication</summary>

- `POST /login` — User login
- `POST /register` — User registration
- `POST /logout` — User logout
- `GET /user` — Current user info
</details>

<details>
<summary>Users & Learners</summary>

- `GET /api/parents` — List parents (Admin)
- `GET /api/learners` — List learners (Parent, Admin)
- `POST /api/learners` — Create learner (Parent, Admin)
- `DELETE /api/learners/:id` — Delete learner (Parent, Admin)
- `GET /api/learner-profile/:userId` — Get learner profile
- `PUT /api/learner-profile/:userId` — Update learner profile
</details>

<details>
<summary>Lessons & Quizzes</summary>

- `POST /api/lessons/create` — Create lesson
- `GET /api/lessons/active` — Get active lesson
- `GET /api/lessons/:lessonId` — Get lesson details
- `GET /api/lessons` — List lessons
- `POST /api/lessons/:lessonId/answer` — Submit answers
</details>

<details>
<summary>Analytics & Progress</summary>

- `GET /api/learner/:learnerId/concept-performance` — Concept mastery data
- `GET /api/learner/:learnerId/recent-answers` — Recent quiz answers
- `GET /api/learner/:learnerId/points-history` — Points history
- `GET /api/achievements` — User achievements
</details>

<details>
<summary>Rewards & Gamification</summary>

- `GET /api/points/balance` — Point balance (Learner)
- `GET /api/rewards/available` — Available rewards (Learner)
- `POST /api/rewards/redeem/:rewardId` — Request redemption (Learner)
- `GET /api/rewards` — List rewards (Parent)
- `POST /api/rewards` — Create reward (Parent)
- `PUT /api/rewards/:id` — Update reward (Parent)
- `DELETE /api/rewards/:id` — Delete reward (Parent)
- `GET /api/rewards/redemptions` — Pending redemptions (Parent)
- `POST /api/rewards/redemptions/:id/approve` — Approve redemption (Parent)
</details>

<details>
<summary>Data & Sync</summary>

- `GET /api/sync-configs` — List sync configs (Parent)
- `POST /api/sync-configs` — Create sync config (Parent)
- `POST /api/sync-configs/:id/push` — Trigger sync (Parent)
- `GET /api/reports` — Get reports
- `GET /api/export` — Export data (Parent, Admin)
- `GET /api/healthcheck` — Health check
</details>

## Testing

```bash
npm test                          # Unit tests
npx playwright test               # E2E tests (local)
PLAYWRIGHT_BASE_URL=https://sunschool.xyz npx playwright test  # E2E against production
```

The e2e suite covers: parent registration, add child, switch to learner mode, generate lesson, take quiz, submit answers, review results.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

All PRs require review before merging to `main`.

## License

MIT License

---

<p align="center">
  <sub>A product of <a href="https://allonething.xyz">All One Thing Labs</a>. Open source education for all.</sub>
</p>
