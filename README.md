# SUNSCHOOL

<p align="center">
  <img src="generated-icon.png" alt="SUNSCHOOL Logo" width="120" height="120">
</p>

<p align="center">
  An AI-powered educational platform for personalized learning experiences.
</p>

## Overview

SUNSCHOOL is a web-based educational platform that provides AI-generated lessons and achievement tracking for learners. The platform supports role-based access with three user types: administrators, parents, and learners.

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Installation](#installation)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [Admin Onboarding](#admin-onboarding)
- [User Roles](#user-roles)
- [API Endpoints](#api-endpoints)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Features

### Implemented Features

- **AI-Generated Lessons**: Content created using OpenRouter API with age-appropriate validation
- **SVG & Image Integration**: Lessons include dynamically generated SVG illustrations and OpenRouter image model support
- **Parent-as-Learner Mode**: Parents can switch to learner mode to view and generate lessons for their children
- **Quiz Analytics & Tracking**: Individual answer storage with concept tagging and question deduplication
- **Concept Mastery System**: Track learner performance across specific concepts (addition, subtraction, etc.)
- **Adaptive Learning**: Question-level analytics to identify strengths and weaknesses
- **Achievement System**: Gamified learning with badges and recognition
- **User Management**: Three-tier system with ADMIN, PARENT, and LEARNER roles
- **Parent-Child Relationships**: Parents can manage multiple learner accounts
- **Database Synchronization**: Parents can configure external PostgreSQL database connections for data backup
- **Progress Tracking**: Comprehensive lesson completion, scoring, and points history
- **Cross-Platform Web App**: Works on desktop and mobile browsers
- **Automatic Database Migrations**: Schema updates applied automatically on server startup
- **End-to-End Testing**: Comprehensive Playwright test suite covering the full child lesson flow

### User Roles

**Administrators:**
- Full system access
- User management capabilities
- System-wide data access

**Parents:**
- Manage their children's learner accounts
- View children's progress and achievements
- Configure database synchronization settings
- Access to personal family data only

**Learners:**
- Access assigned lessons
- View personal achievements
- Complete lessons and submit answers

## Technology Stack

### Frontend
- **React 19.1.0** with TypeScript
- **React Native Web** for cross-platform compatibility
- **React Query** for data fetching and caching
- **Wouter** for client-side routing
- **Vite** for build tooling

### Backend
- **Node.js** with **Express.js 5.1.0**
- **TypeScript** for type safety
- **JWT authentication** with role-based access control
- **PostgreSQL** (Neon serverless) with **Drizzle ORM**

### AI Integration
- **OpenRouter API** for lesson content generation and image models
- **Perplexity API** for enhanced knowledge context
- **SVG Generation** for subject-specific educational illustrations

### Development Tools
- **Jest** for unit testing
- **Playwright** for end-to-end testing
- **Drizzle Kit** for database migrations

## Architecture

### Core Components

- **Web Frontend**: React application served via Express.js
- **REST API**: Express.js backend with JWT authentication
- **Database**: PostgreSQL with Drizzle ORM for schema management
- **Session Management**: Express sessions with database storage

### Data Flow

1. **Authentication**: JWT-based login with role verification
2. **Lesson Creation**: AI-generated content via OpenRouter API
3. **Progress Tracking**: Lesson completion and achievement awards
4. **Data Sync**: Optional external PostgreSQL database connections

## Installation

### Prerequisites

- Node.js (v18.x or newer)
- PostgreSQL database (local or cloud)
- npm package manager

### Clone and Setup

```bash
git clone https://github.com/All-One-Thing/sunschool.git
cd sunschool
npm install
```

## Database Setup

### Environment Configuration

Create a `.env` file with required variables:

```env
DATABASE_URL=postgresql://user:password@host:port/database
JWT_SECRET=your-jwt-secret-key
SESSION_SECRET=your-session-secret
OPENROUTER_API_KEY=your-openrouter-key
PERPLEXITY_API_KEY=your-perplexity-key
PORT=5000
```

### Database Initialization

The application automatically runs migrations on startup. For manual migration:

```bash
# Run migrations manually
npm run migrate

# Or push schema changes during development
npm run db:push

# Optional: Seed with sample data
npm run db:seed
```

**Note**: Database migrations are automatically applied when the server starts in production.

## Running the Application

### Development

```bash
npm run dev
```

Starts the server at http://localhost:5000 (or configured PORT).

### Production

```bash
npm run build
npm start
```

## Admin Setup

The first user to register is automatically promoted to the ADMIN role. After that, new registrations default to the LEARNER role.

### Manual Admin Creation

```bash
ts-node scripts/admin-onboard.ts
```

## User Roles

### ADMIN
- Full system access and user management
- Can view all data across the platform

### PARENT
- Manage their children's learner accounts
- View children's progress and achievements
- Configure database synchronization

### LEARNER
- Access assigned lessons
- Complete lessons and view achievements

## API Endpoints

### Authentication
- `POST /login` - User login
- `POST /register` - User registration
- `POST /logout` - User logout
- `GET /user` - Get current user info

### User Management
- `GET /api/parents` - List parents (ADMIN only)
- `GET /api/learners` - List learners (PARENT, ADMIN)
- `POST /api/learners` - Create learner (PARENT, ADMIN)
- `DELETE /api/learners/:id` - Delete learner (PARENT, ADMIN)
- `GET /api/learner-profile/:userId` - Get learner profile
- `PUT /api/learner-profile/:userId` - Update learner profile (PARENT, ADMIN)

### Lessons
- `POST /api/lessons/create` - Create lesson
- `GET /api/lessons/active` - Get active lesson
- `GET /api/lessons/:lessonId` - Get lesson details
- `GET /api/lessons` - List lessons
- `POST /api/lessons/:lessonId/answer` - Submit lesson answers

### Analytics & Performance
- `GET /api/learner/:learnerId/concept-performance` - Get concept mastery data
- `GET /api/learner/:learnerId/recent-answers` - Get recent quiz answers
- `GET /api/learner/:learnerId/points-history` - Get points history

### Achievements
- `GET /api/achievements` - Get user achievements

### Database Sync
- `GET /api/sync-configs` - List sync configurations (PARENT)
- `POST /api/sync-configs` - Create sync configuration (PARENT)
- `GET /api/sync-configs/:id` - Get sync config (PARENT)
- `PUT /api/sync-configs/:id` - Update sync config (PARENT)
- `DELETE /api/sync-configs/:id` - Delete sync config (PARENT)
- `POST /api/sync-configs/:id/push` - Trigger sync (PARENT)

### Other
- `GET /api/reports` - Get reports
- `GET /api/export` - Export data (PARENT, ADMIN)
- `GET /api/healthcheck` - Health check

## Development

### Project Structure
- `client/` - React frontend
- `server/` - Express.js backend
- `shared/` - TypeScript schemas and types
- `scripts/` - Database and utility scripts

### Development Commands
- `npm run dev` - Start development server
- `npm run db:push` - Update database schema
- `npm run db:seed` - Seed database with test data
- `npm run migrate` - Run database migrations
- `npm test` - Run unit tests
- `npx playwright test` - Run e2e tests
- `PLAYWRIGHT_BASE_URL=https://sunschool.xyz npx playwright test` - Run e2e tests against production

### E2E Test Suite

The Playwright test at `tests/e2e/child-lesson-flow.spec.ts` covers the complete user flow:

1. **Parent Registration** - Register a new parent account (API fallback + UI login)
2. **Add Child Learner** - Create a child with grade level selection
3. **Switch to Learner Mode** - Navigate from parent dashboard to learner view
4. **Generate Lesson** - Click "Random Lesson" and wait for AI lesson generation
5. **View Lesson** - Verify lesson content with SVG illustrations, Key Concepts, Examples, Practice sections
6. **Take Quiz** - Answer 3 multiple-choice questions with DOM-based option selection
7. **Submit & Review** - Submit answers and verify quiz results
8. **Return Home** - Navigate back to learner home

Screenshots are saved to `tests/e2e/screenshots/` for visual verification.

## Troubleshooting

### Common Issues

**Database Connection Errors**
- Ensure `DATABASE_URL` is properly set in `.env`
- For Neon databases, the WebSocket constructor is configured automatically
- Check connection pooling settings in `server/db.ts`

**Migration Failures**
- Migrations run automatically on startup
- If migrations fail, the server will still start (prevents deployment failures)
- Run `npm run migrate` manually to debug migration issues
- Check `drizzle/migrations/` folder for migration files

**Quiz Submission Errors**
- Ensure `quiz_answers` table exists (requires migrations)
- Check browser console for detailed error messages
- Verify learner has an active lesson before submitting

**TypeScript Compilation Errors**
- Run `npx tsc --noEmit` to check for type errors
- Ensure all dependencies are installed: `npm install`
- Clear build cache: `rm -rf client/dist server/dist`

**Keep-Alive Logging**
- Keep-alive pings occur every 2 minutes
- Only logged in development mode (`NODE_ENV=development`)
- Production mode silences these logs

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License
