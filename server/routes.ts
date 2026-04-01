import express, { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { checkForAchievements } from "./utils";
import { asyncHandler, authenticateJwt, hasRoleMiddleware, AuthRequest } from "./middleware/auth";
import { synchronizeToExternalDatabase } from "./sync-utils";
import { InsertDbSyncConfig } from "../shared/schema";
import { USE_AI } from "./config/flags";
import { db, pool } from "./db";
import { sql, eq, and, like, ne } from "drizzle-orm";
import crypto from "crypto";
import rateLimit from 'express-rate-limit';

const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many submissions. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
import { users, lessons } from "../shared/schema";
// content-generator used by image-generation-router, not directly by routes
import { pointsService } from "./services/points-service";
import { activityService } from "./services/activity-service";

// Helper function to ensure consistent string IDs for cross-domain compatibility
function ensureString(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

// Authentication middleware
function isAuthenticated(req: Request, res: Response, next: NextFunction): void {
  authenticateJwt(req as AuthRequest, res, next);
}

// Import services
import('./services/subject-recommendation');
import { generateLessonWithRetry, generateLessonImages } from './services/enhanced-lesson-service';
import { findOrCreateTemplate } from './services/lesson-template-service';
import { storeQuizAnswers, extractConceptTags } from './services/quiz-tracking-service';
import { bulkUpdateMasteryFromAnswers } from './services/mastery-service';
import { storeQuestionHashes } from './services/question-deduplication';
import { validatePromptInput } from './services/prompt-safety';
import { detectOrphanedImages, detectPartialQuizSubmissions, reconcilePointsBalances } from './services/maintenance-service';
import { getLessonAnalytics, flagLowQualityTemplates } from './services/lesson-analytics-service';
import { getTuningHistory, runAutoTuner } from './services/lesson-validation-tuner';
import { getAllCircuitBreakerStates } from './services/circuit-breaker';

function hasRole(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // First authenticate the user
    authenticateJwt(req as AuthRequest, res, (err?: any) => {
      if (err) return next(err);

      // Then check the role
      hasRoleMiddleware(roles)(req as AuthRequest, res, next);
    });
  };
}

function backgroundTask(name: string, fn: () => Promise<void>) {
  setImmediate(async () => {
    try { await fn(); }
    catch (err) { console.error(`[BG] ${name} failed:`, err); }
  });
}

export function registerRoutes(app: Express): Server {
  // Set up authentication routes
  setupAuth(app);

  // Feedback / support submission (no auth required)
  app.post("/api/feedback", feedbackLimiter, asyncHandler(async (req: Request, res: Response) => {
    const { message, email, page } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length < 2) {
      return res.status(400).json({ error: "Message is required (min 2 characters)" });
    }
    if (message.length > 5000) {
      return res.status(400).json({ error: "Message too long (max 5000 characters)" });
    }
    if (email && typeof email === 'string' && email.length > 255) {
      return res.status(400).json({ error: "Email too long" });
    }
    const userAgent = req.headers['user-agent'] || null;
    // Try to get userId from auth token if present
    let userId: number | null = null;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const jwt = await import('jsonwebtoken');
        const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? undefined : 'dev-jwt-secret-do-not-use-in-prod');
        if (!jwtSecret) {
          throw new Error('JWT_SECRET environment variable must be set in production');
        }
        const decoded: any = jwt.default.verify(authHeader.slice(7), jwtSecret);
        userId = decoded.id ? parseInt(decoded.id, 10) : null;
      }
    } catch { /* no auth — that's fine */ }
    const client = await pool.connect();
    try {
      await client.query(
        'INSERT INTO feedback_submissions (message, email, user_id, user_agent, page) VALUES ($1, $2, $3, $4, $5)',
        [message.trim(), email?.trim() || null, userId, userAgent, page || null]
      );
    } catch (err: any) {
      // Table may not exist yet — create it and retry
      if (err.code === '42P01') {
        await client.query(`
          CREATE TABLE IF NOT EXISTS feedback_submissions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            message TEXT NOT NULL,
            email VARCHAR(255),
            user_id INTEGER,
            user_agent TEXT,
            page VARCHAR(512),
            created_at TIMESTAMP DEFAULT NOW()
          )
        `);
        await client.query(
          'INSERT INTO feedback_submissions (message, email, user_id, user_agent, page) VALUES ($1, $2, $3, $4, $5)',
          [message.trim(), email?.trim() || null, userId, userAgent, page || null]
        );
      } else {
        throw err;
      }
    } finally { client.release(); }
    res.json({ ok: true });
  }));

  // Get all parent accounts (Admin only)
  app.get("/api/parents", hasRole(["ADMIN"]), asyncHandler(async (req: AuthRequest, res) => {
    const parents = await storage.getAllParents();
    res.json(parents);
  }));

  // Get learners for a parent (Parent only)
  app.get("/api/learners", hasRole(["PARENT", "ADMIN"]), asyncHandler(async (req: AuthRequest, res) => {
    try {
      let learners;
      if (req.user?.role === "ADMIN") {
        // For admin users, if parentId is provided, get learners for that parent
        // If no parentId is provided, get all learners with role=LEARNER
        if (req.query.parentId) {
          const parentId = typeof req.query.parentId === 'string' ? req.query.parentId : String(req.query.parentId);
          learners = await storage.getUsersByParentId(parentId);
        } else {
          learners = await storage.getAllLearners();
        }
      } else if (req.user?.role === "PARENT") {
        learners = await storage.getUsersByParentId(req.user.id);
      } else {
        res.status(400).json({ error: "Invalid request" });
      }

      res.json(learners);
    } catch (error) {
      console.error('Error in GET /api/learners:', error);
      res.status(500).json({ error: "Internal server error", details: error.message });
    }
  }));

  // Create a new learner account
  app.post("/api/learners", hasRole(["PARENT", "ADMIN"]), asyncHandler(async (req: AuthRequest, res) => {
    const { name, role = "LEARNER" } = req.body;

    if (!name) {
      res.status(400).json({ error: "Missing required field: name" });
    }

    try {
      // Email is optional for learners
      let email = req.body.email;

      // If email is provided, validate it
      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          res.status(400).json({ error: "Invalid email format" });
        }

        // Check if email already exists - first check by username
        const existingUserByUsername = await storage.getUserByUsername(email);
        if (existingUserByUsername) {
          res.status(409).json({ error: "Email already in use as a username" });
        }

        // Also check the email field directly to prevent database constraint violations
        try {
          const emailCheckResult = await db.select().from(users).where(sql`LOWER(email) = LOWER(${email})`);
          if (emailCheckResult.length > 0) {
            res.status(409).json({ error: "Email already in use" });
          }
        } catch (emailCheckError) {
          console.error("Error checking email existence:", emailCheckError);
          // Continue with the operation
        }
      }

      // Set parent ID based on the user's role
      let parentId: string | null = null;

      // For PARENT users, the parent is the user themselves
      if (req.user?.role === "PARENT") {
        parentId = ensureString(req.user.id);
      } 
      // For ADMIN users, check if parentId was provided in the request
      else if (req.user?.role === "ADMIN") {
        // If parentId was provided in the request body, use that
        if (req.body.parentId) {
          parentId = req.body.parentId as string;
        } 
        // If creating a LEARNER as an ADMIN but no parentId specified,
        // use the admin as the parent (this is our fallback solution)
        else if (role === "LEARNER") {
          parentId = ensureString(req.user.id);
        }
      } 
      // For any other scenario where a LEARNER is being created without a parent
      else if (role === "LEARNER" && !parentId) {
        // Learners must have a parent
        res.status(400).json({ error: "Learner accounts must have a parent" });
      }

      // Generate a unique username based on name and timestamp
      const timestamp = Date.now().toString().slice(-6);
      const username = `${name.toLowerCase().replace(/\s+/g, '-')}-${timestamp}`;

      // Create the user object with only required fields
      const userObj: any = {
        username,
        name,
        role,
        parentId,
      };

      // Add email if provided, but only for backward compatibility
      if (req.body.email) {
        userObj.email = req.body.email;
      }

      // Only add password for parent accounts, not for learners
      if (role !== "LEARNER" && req.body.password) {
        userObj.password = req.body.password;
      }

      // Create the new user
      const newUser = await storage.createUser(userObj);

      // Create the learner profile first to avoid constraint issues
      if (newUser.role === "LEARNER") {
        try {
          // Parse grade level, default to 5 if not provided or invalid
          let gradeLevel = 5;
          if (req.body.gradeLevel !== undefined) {
            gradeLevel = typeof req.body.gradeLevel === 'string' ? 
              parseInt(req.body.gradeLevel) : req.body.gradeLevel;

            if (isNaN(gradeLevel)) {
              gradeLevel = 5;
            }
          }

          await storage.createLearnerProfile({
            id: crypto.randomUUID(),
            userId: newUser.id.toString(),
            gradeLevel,
            graph: { nodes: [], edges: [] },
          });

          // Create starter reward goals so the points system works immediately
          try {
            const { createReward } = await import('./services/rewards-service');
            const parentId = Number(req.user?.id ?? newUser.parentId);
            await createReward(parentId, { title: 'Extra Recess', description: '15 minutes of extra free time', tokenCost: 10, imageEmoji: '🏃', color: '#4CAF50' });
            await createReward(parentId, { title: 'Pick a Movie', description: 'Choose a movie for family night', tokenCost: 25, imageEmoji: '🎬', color: '#2196F3' });
            await createReward(parentId, { title: 'Special Outing', description: 'A trip to somewhere fun', tokenCost: 50, imageEmoji: '🎢', color: '#FF9800' });
          } catch (rewardErr) {
            console.error('Error creating starter rewards (non-fatal):', rewardErr);
          }
        } catch (profileError) {
          console.error('Error creating learner profile:', profileError);
          // Continue so we can return the user object even if profile creation fails
        }
      }

      // Return the created user without password
      const { password: _, ...userResponse } = newUser;
      res.status(201).json(userResponse);

    } catch (error) {
      console.error('Error creating new learner:', error);

      // Provide more specific error messages based on the error type
      if (error.code === '23505' && error.constraint === 'users_email_key') {
        // Duplicate email error - this means our earlier check missed it
        res.status(409).json({ 
          error: "This email is already registered. Please use a different email address."
        });
      } else if (error.code === '23505' && error.constraint === 'users_username_key') {
        // Duplicate username error
        res.status(409).json({ 
          error: "This username is already taken. Please choose a different username."
        });
      } else if (error.code === '23502' && error.column === 'email') {
        // Not-null constraint for email - generate a temporary email

        // Create a random email for the user (temporary solution until migration is complete)
        const timestamp = Date.now();
        const randomEmail = `learner-${timestamp}@example.org`;

        try {
          // Create a new user object with the generated email
          const retryUserObj = {
            username: req.body.name.toLowerCase().replace(/\s+/g, '-') + '-' + timestamp.toString().slice(-6),
            name: req.body.name,
            role: req.body.role || "LEARNER",
            parentId: req.user?.id,
            email: randomEmail,
            password: req.body.password || "temppass" + timestamp.toString().slice(-6)
          };

          const newUser = await storage.createUser(retryUserObj);

          // Create the learner profile
          if (newUser.role === "LEARNER") {
            let gradeLevel = 5;
            if (req.body.gradeLevel !== undefined) {
              gradeLevel = typeof req.body.gradeLevel === 'string' ? 
                parseInt(req.body.gradeLevel) : req.body.gradeLevel;

              if (isNaN(gradeLevel)) {
                gradeLevel = 5;
              }
            }

            await storage.createLearnerProfile({
              id: crypto.randomUUID(),
              userId: newUser.id.toString(),
              gradeLevel,
              graph: { nodes: [], edges: [] },
            });

            // Create starter reward goals
            try {
              const { createReward } = await import('./services/rewards-service');
              const parentId = Number(req.user?.id ?? newUser.parentId);
              await createReward(parentId, { title: 'Extra Recess', description: '15 minutes of extra free time', tokenCost: 10, imageEmoji: '🏃', color: '#4CAF50' });
              await createReward(parentId, { title: 'Pick a Movie', description: 'Choose a movie for family night', tokenCost: 25, imageEmoji: '🎬', color: '#2196F3' });
              await createReward(parentId, { title: 'Special Outing', description: 'A trip to somewhere fun', tokenCost: 50, imageEmoji: '🎢', color: '#FF9800' });
            } catch (rewardErr) {
              console.error('Error creating starter rewards (non-fatal):', rewardErr);
            }
          }

          // Return the created user without password
          const { password: _, ...userResponse } = newUser;
          res.status(201).json(userResponse);
        } catch (retryError) {
          console.error('Retry failed:', retryError);
          res.status(500).json({
            error: "Failed to create learner account. Please try again."
          });
        }
      }

      // Default error response
      res.status(500).json({ 
        error: "Failed to create learner account. Please try again."
      });
    }
  }));

  // Delete a learner account
  app.delete("/api/learners/:id", hasRole(["PARENT", "ADMIN"]), asyncHandler(async (req: AuthRequest, res) => {
    const learnerId = req.params.id;

    // Verify the learner exists
    const learner = await storage.getUser(learnerId);
    if (!learner) {
      res.status(404).json({ error: "Learner not found" });
    }

    // Verify this is actually a learner account
    if (learner.role !== "LEARNER") {
      res.status(400).json({ error: "Can only delete learner accounts" });
    }

    // Check authorization (parents can only delete their own learners)
    if (req.user?.role === "PARENT") {
      // Check if the learner belongs to this parent
      if (learner.parentId !== req.user.id && learner.parentId.toString() !== ensureString(req.user.id)) {
        res.status(403).json({ error: "Not authorized to delete this learner" });
      }
    }

    // Delete the learner
    const success = await storage.deleteUser(learnerId);

    if (success) {
      res.json({ success: true, message: "Learner deleted successfully" });
    } else {
      res.status(500).json({ error: "Failed to delete learner" });
    }
  }));

  // Get learner profile (create if needed)
  app.get("/api/learner-profile/:userId", isAuthenticated, asyncHandler(async (req: AuthRequest, res) => {
    const userIdParam = req.params.userId;
    // Convert userIdParam to number since database expects integer
    const userId = parseInt(userIdParam, 10);

    if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID format - must be a number" });
    }

    // Admins can view any profile, parents can view their children, learners can view their own
    if (
      req.user?.role === "ADMIN" ||
      (req.user?.role === "PARENT" && (await storage.getUsersByParentId(req.user.id)).some(u => u.id.toString() === userId.toString())) ||
      (req.user?.id.toString() === userId.toString())
    ) {
      try {
        // Get existing profile or create a new one
        let profile = await storage.getLearnerProfile(userId);

        // If no profile exists, create one - but we need to check first if the user exists
        if (!profile) {
          // Get the user to verify they exist
          const user = await storage.getUser(userId.toString());

          if (!user) {
            return res.status(404).json({ error: "User not found" });
          }

          // Create a default profile with grade level 5 and a generated ID
          profile = await storage.createLearnerProfile({
            id: crypto.randomUUID(), // Add a UUID for the ID field
            userId: userId.toString(), // Convert number to string
            gradeLevel: 5,  // Default to grade 5
            graph: { nodes: [], edges: [] },
            subjects: ['Math', 'Reading', 'Science'],
            subjectPerformance: {},
            recommendedSubjects: [],
            strugglingAreas: []
          });

          if (!profile) {
            return res.status(500).json({ error: "Failed to create learner profile" });
          }
        }

        return res.json(profile);
      } catch (error) {
        console.error('Error getting or creating learner profile:', error);
        return res.status(500).json({ error: "Failed to get or create learner profile" });
      }
    }

    return res.status(403).json({ error: "Forbidden" });
  }));

  // Update learner profile (supports updating grade level and subjects)
  app.put("/api/learner-profile/:userId", hasRole(["PARENT", "ADMIN"]), asyncHandler(async (req: AuthRequest, res) => {
    const userIdParam = req.params.userId;
    // Get the user ID as a string since our schema uses string IDs
    const userId = userIdParam;

    if (!userId) {
      return res.status(400).json({ error: "Invalid user ID format" });
    }

    const { gradeLevel, subjects, recommendedSubjects, strugglingAreas, graph, parentPromptGuidelines, contentRestrictions, requireLessonApproval } = req.body;

    // If no valid update data was provided
    if (!gradeLevel && !subjects && !recommendedSubjects && !strugglingAreas && !graph &&
        parentPromptGuidelines === undefined && contentRestrictions === undefined && requireLessonApproval === undefined) {
      return res.status(400).json({ error: "No valid update data provided" });
    }

    // Validate subjects arrays — these flow into LLM prompts during lesson pre-generation
    const validateSubjectArray = async (arr: any[], fieldName: string) => {
      if (!Array.isArray(arr)) return;
      for (const item of arr) {
        const val = typeof item === 'string' ? item : item?.name || item?.subject;
        if (val) {
          const check = await validatePromptInput(val);
          if (!check.safe) {
            return res.status(400).json({ error: `Invalid ${fieldName}: ${check.reason}` });
          }
        }
      }
    };
    if (subjects) { const r = await validateSubjectArray(subjects, 'subject'); if (r) return r; }
    if (recommendedSubjects) { const r = await validateSubjectArray(recommendedSubjects, 'recommended subject'); if (r) return r; }

    // Check authorization for parents
    if (req.user?.role === "PARENT") {
      try {
        // Check if the learner belongs to this parent (using direct SQL for type safety)
        const parentQuery = `
          SELECT 1 FROM users 
          WHERE id = $1 AND parent_id = $2
        `;
        const parentResult = await pool.query(parentQuery, [userId, parseInt(ensureString(req.user.id))]);

        if (parentResult.rowCount === 0) {
          return res.status(403).json({ error: "Not authorized to update this profile" });
        }
      } catch (err) {
        console.error('Error checking parent-child relationship:', err);
        return res.status(500).json({ error: "Error verifying permissions" });
      }
    }

    // Update the profile using direct SQL to avoid type issues
    try {
      // First check if profile exists
      const checkQuery = `SELECT * FROM learner_profiles WHERE user_id = $1`;
      const checkResult = await pool.query(checkQuery, [userId]);

      // Process grade level if present
      let gradeLevelNum = undefined;
      if (gradeLevel !== undefined) {
        // Convert 'K' to 0 for Kindergarten
        if (gradeLevel === 'K') {
          gradeLevelNum = 0; // Kindergarten
        } else {
          gradeLevelNum = parseInt(gradeLevel.toString());
          if (isNaN(gradeLevelNum) || gradeLevelNum < 0 || gradeLevelNum > 12) {
            return res.status(400).json({ error: "Grade level must be between K and 12" });
          }
        }
      }

      // If profile doesn't exist, create one with default values
      if (checkResult.rowCount === 0) {
        const newProfileId = crypto.randomUUID();
        const createQuery = `
          INSERT INTO learner_profiles (
            id, user_id, grade_level, graph, subjects, subject_performance, recommended_subjects, struggling_areas
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8
          ) RETURNING *
        `;

        const graphValue = graph || { nodes: [], edges: [] };
        const subjectsValue = subjects || ['Math', 'Reading', 'Science'];
        const subjectPerformanceValue = {};
        const recommendedSubjectsValue = recommendedSubjects || [];
        const strugglingAreasValue = strugglingAreas || [];

        const insertResult = await pool.query(createQuery, [
          newProfileId,
          userId,
          gradeLevelNum || 5, // Default to grade 5
          JSON.stringify(graphValue),
          JSON.stringify(subjectsValue),
          JSON.stringify(subjectPerformanceValue),
          JSON.stringify(recommendedSubjectsValue),
          JSON.stringify(strugglingAreasValue)
        ]);

        if (insertResult.rowCount > 0) {
          // Convert database row to expected profile format
          return res.json({
            id: insertResult.rows[0].id,
            userId: userId,
            gradeLevel: insertResult.rows[0].grade_level,
            graph: typeof insertResult.rows[0].graph === 'string' ? 
              JSON.parse(insertResult.rows[0].graph) : insertResult.rows[0].graph || { nodes: [], edges: [] },
            subjects: typeof insertResult.rows[0].subjects === 'string' ? 
              JSON.parse(insertResult.rows[0].subjects) : insertResult.rows[0].subjects || ['Math', 'Reading', 'Science'],
            subjectPerformance: typeof insertResult.rows[0].subject_performance === 'string' ? 
              JSON.parse(insertResult.rows[0].subject_performance) : insertResult.rows[0].subject_performance || {},
            recommendedSubjects: typeof insertResult.rows[0].recommended_subjects === 'string' ? 
              JSON.parse(insertResult.rows[0].recommended_subjects) : insertResult.rows[0].recommended_subjects || [],
            strugglingAreas: typeof insertResult.rows[0].struggling_areas === 'string' ? 
              JSON.parse(insertResult.rows[0].struggling_areas) : insertResult.rows[0].struggling_areas || [],
            createdAt: insertResult.rows[0].created_at
          });
        } else {
          console.error('Failed to create learner profile - no rows returned');
          return res.status(500).json({ error: "Failed to create learner profile" });
        }
      }

      // If we get here, the profile exists - update it
      const existingProfile = checkResult.rows[0];

      try {
        // Directly perform the update with all fields at once for simplicity and safety
        const updateQuery = `
          UPDATE learner_profiles
          SET
            grade_level = $2,
            graph = $3,
            subjects = $4,
            recommended_subjects = $5,
            struggling_areas = $6,
            parent_prompt_guidelines = $7,
            content_restrictions = $8,
            require_lesson_approval = $9
          WHERE user_id = $1
          RETURNING *
        `;

        // Use existing values for any undefined fields
        // Process params carefully to ensure proper JSON handling
        let graphValue = existingProfile.graph;
        if (graph !== undefined) {
          // Make sure graph is properly formatted as an object first
          if (typeof graph === 'string') {
            try {
              // If it's a string, try to parse it
              graphValue = JSON.parse(graph);
            } catch (e) {
              console.error('Error parsing graph JSON:', e);
              // Use default empty graph on error
              graphValue = { nodes: [], edges: [] };
            }
          } else {
            // If it's already an object, use it directly
            graphValue = graph;
          }
        }

        // Process subjects array with proper error handling
        let subjectsValue = existingProfile.subjects;
        if (subjects !== undefined) {
          if (Array.isArray(subjects)) {
            subjectsValue = subjects;
          } else if (typeof subjects === 'string') {
            try {
              subjectsValue = JSON.parse(subjects);
              if (!Array.isArray(subjectsValue)) {
                console.error('Subjects is not an array after parsing:', subjectsValue);
                subjectsValue = ['Math', 'Reading', 'Science']; // Default
              }
            } catch (e) {
              console.error('Error parsing subjects JSON:', e);
              subjectsValue = ['Math', 'Reading', 'Science']; // Default on error
            }
          } else {
            console.error('Subjects is in an unexpected format:', typeof subjects);
            subjectsValue = ['Math', 'Reading', 'Science']; // Default
          }
        }

        // Process recommended subjects array
        let recommendedSubjectsValue = existingProfile.recommended_subjects;
        if (recommendedSubjects !== undefined) {
          if (Array.isArray(recommendedSubjects)) {
            recommendedSubjectsValue = recommendedSubjects;
          } else if (typeof recommendedSubjects === 'string') {
            try {
              recommendedSubjectsValue = JSON.parse(recommendedSubjects);
              if (!Array.isArray(recommendedSubjectsValue)) {
                console.error('recommendedSubjects is not an array after parsing');
                recommendedSubjectsValue = []; // Default
              }
            } catch (e) {
              console.error('Error parsing recommendedSubjects JSON:', e);
              recommendedSubjectsValue = []; // Default on error
            }
          } else {
            console.error('recommendedSubjects is in an unexpected format:', typeof recommendedSubjects);
            recommendedSubjectsValue = []; // Default
          }
        }

        // Process struggling areas array
        let strugglingAreasValue = existingProfile.struggling_areas;
        if (strugglingAreas !== undefined) {
          if (Array.isArray(strugglingAreas)) {
            strugglingAreasValue = strugglingAreas;
          } else if (typeof strugglingAreas === 'string') {
            try {
              strugglingAreasValue = JSON.parse(strugglingAreas);
              if (!Array.isArray(strugglingAreasValue)) {
                console.error('strugglingAreas is not an array after parsing');
                strugglingAreasValue = []; // Default
              }
            } catch (e) {
              console.error('Error parsing strugglingAreas JSON:', e);
              strugglingAreasValue = []; // Default on error
            }
          } else {
            console.error('strugglingAreas is in an unexpected format:', typeof strugglingAreas);
            strugglingAreasValue = []; // Default
          }
        }


        // Process parent prompt guidelines
        let parentGuidelinesValue = existingProfile.parent_prompt_guidelines;
        if (parentPromptGuidelines !== undefined) {
          parentGuidelinesValue = parentPromptGuidelines || null;
        }

        // Process content restrictions
        let contentRestrictionsValue = existingProfile.content_restrictions;
        if (contentRestrictions !== undefined) {
          contentRestrictionsValue = contentRestrictions || null;
        }

        // Process require lesson approval
        let requireApprovalValue = existingProfile.require_lesson_approval;
        if (requireLessonApproval !== undefined) {
          requireApprovalValue = requireLessonApproval;
        }
        const updateParams = [
          userId,
          gradeLevelNum !== undefined ? gradeLevelNum : existingProfile.grade_level,
          JSON.stringify(graphValue),
          JSON.stringify(subjectsValue),
          JSON.stringify(recommendedSubjectsValue),
          JSON.stringify(strugglingAreasValue),
          parentGuidelinesValue,
          contentRestrictionsValue,
          requireApprovalValue
        ];

        const updateResult = await pool.query(updateQuery, updateParams);

        if (updateResult.rowCount > 0) {
          // Convert database row to expected profile format
          const profile = updateResult.rows[0];
          return res.json({
            id: profile.id,
            userId: userId,
            gradeLevel: profile.grade_level,
            graph: typeof profile.graph === 'string' ? 
              JSON.parse(profile.graph) : profile.graph || { nodes: [], edges: [] },
            subjects: typeof profile.subjects === 'string' ? 
              JSON.parse(profile.subjects) : profile.subjects || ['Math', 'Reading', 'Science'],
            subjectPerformance: typeof profile.subject_performance === 'string' ? 
              JSON.parse(profile.subject_performance) : profile.subject_performance || {},
            recommendedSubjects: typeof profile.recommended_subjects === 'string' ? 
              JSON.parse(profile.recommended_subjects) : profile.recommended_subjects || [],
            strugglingAreas: typeof profile.struggling_areas === 'string' ? 
              JSON.parse(profile.struggling_areas) : profile.struggling_areas || [],
            createdAt: profile.created_at
          });
        } else {
          console.error('Failed to update learner profile - no rows affected');
          return res.status(500).json({ error: "Failed to update learner profile" });
        }
      } catch (updateError) {
        console.error('Error during profile update:', updateError);
        return res.status(500).json({ error: "Error updating profile: " + updateError.message });
      }
    } catch (error) {
      console.error('Error updating learner profile:', error);
      return res.status(500).json({ error: "Failed to update learner profile: " + error.message });
    }
  }));

  // Get active lesson for learner
  app.get("/api/lessons/active", isAuthenticated, asyncHandler(async (req: AuthRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      // Use learnerId query param if provided (parent viewing as child), otherwise use auth user
      const learnerId = (req.query.learnerId as string) || req.user.id;

      const activeLesson = await storage.getActiveLesson(learnerId);

      if (activeLesson) {
        return res.json(activeLesson);
      }

      // If no active lesson, don't auto-generate (handle on frontend)
      return res.json(null);
    } catch (error) {
      console.error('Error fetching active lesson:', error);
      return res.status(500).json({ error: "Failed to fetch active lesson" });
    }
  }));

  // Create a custom lesson for a learner
  app.post("/api/lessons/create", isAuthenticated, asyncHandler(async (req: AuthRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const {
      topic = '',
      gradeLevel,
      learnerId,
      subject = '',
      category = '',
      difficulty = 'beginner'
    } = req.body;

    if (!gradeLevel || !learnerId) {
      return res.status(400).json({ error: "Missing required fields: gradeLevel, learnerId" });
    }

    // Validate prompt safety on user-provided text fields
    if (topic) {
      const topicCheck = await validatePromptInput(topic);
      if (!topicCheck.safe) {
        return res.status(400).json({ error: `Invalid topic: ${topicCheck.reason}` });
      }
    }
    if (subject) {
      const subjectCheck = await validatePromptInput(subject);
      if (!subjectCheck.safe) {
        return res.status(400).json({ error: `Invalid subject: ${subjectCheck.reason}` });
      }
    }
    if (category) {
      const categoryCheck = await validatePromptInput(category);
      if (!categoryCheck.safe) {
        return res.status(400).json({ error: `Invalid category: ${categoryCheck.reason}` });
      }
    }

    // Validate user permissions
    const targetLearnerId = learnerId as string;

    // Self-create for learners
    if (req.user.role === "LEARNER" && req.user.id !== targetLearnerId) {
      return res.status(403).json({ error: "Learners can only create lessons for themselves" });
    }

    // Parents can only create for their children
    if (req.user.role === "PARENT") {
      const children = await storage.getUsersByParentId(req.user.id);
      if (!children.some(child => child.id.toString() === targetLearnerId.toString())) {
        return res.status(403).json({ error: "Parent can only create lessons for their children" });
      }
    }

    try {
      // Get learner profile
      const learnerProfile = await storage.getLearnerProfile(targetLearnerId);
      if (!learnerProfile) {
        return res.status(404).json({ error: "Learner profile not found" });
      }

      // Determine the subject if not provided
      let finalSubject = subject;
      if (!finalSubject && learnerProfile.subjects && learnerProfile.subjects.length > 0) {
        finalSubject = learnerProfile.subjects[Math.floor(Math.random() * learnerProfile.subjects.length)];
      }

      // Get subject category if not provided
      let finalCategory = category;
      if (!finalCategory && finalSubject) {
        const { getSubjectCategory } = await import('./services/subject-recommendation');
        finalCategory = getSubjectCategory(finalSubject);
      }

      // Check for stale ACTIVE lessons before generation
      // If an ACTIVE lesson exists, was created >30min ago, and has no completedAt, it's stuck
      const existingActive = await storage.getActiveLesson(targetLearnerId);
      if (existingActive) {
        const ageMs = Date.now() - new Date(existingActive.createdAt!).getTime();
        const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
        if (ageMs > STALE_THRESHOLD_MS && !existingActive.completedAt) {
          console.warn(`[Lesson] Auto-retiring stale lesson ${existingActive.id}, created ${existingActive.createdAt}`);
          await storage.updateLessonStatus(existingActive.id, "DONE", 0);
        }
      }

      // Use shared lesson library: reuse existing template or generate new one
      let spec;
      let templateId: string | undefined;
      try {
        const templateResult = await findOrCreateTemplate(
          storage,
          finalSubject,
          gradeLevel,
          topic || finalSubject,
          difficulty || 'beginner',
          () => generateLessonWithRetry(gradeLevel, topic, {
            subject: finalSubject,
            difficulty: difficulty as 'beginner' | 'intermediate' | 'advanced',
            learnerId: Number(targetLearnerId),
          })
        );
        spec = templateResult.spec;
        templateId = templateResult.templateId;
      } catch (genErr) {
        console.error('[Lesson] Generation failed:', genErr);
        const errMsg = genErr instanceof Error ? genErr.message : String(genErr);
        // Return 402 for billing issues so clients can distinguish from transient failures
        if (/API error: 402/.test(errMsg) || /Insufficient credits/.test(errMsg)) {
          return res.status(402).json({ error: "AI service billing issue. Please check OpenRouter credits." });
        }
        if (/API error: 403/.test(errMsg) || /Key limit exceeded/.test(errMsg)) {
          return res.status(402).json({ error: "AI service key limit exceeded. The OpenRouter API key's monthly spending limit needs to be increased at https://openrouter.ai/settings/keys" });
        }
        return res.status(503).json({ error: "Lesson generation failed after multiple attempts. Please try again." });
      }

      // Assert lesson spec integrity before saving
      if (!spec.title) {
        console.error('[Lesson] Generated spec missing title');
        return res.status(503).json({ error: "Lesson generation produced invalid content (missing title). Please try again." });
      }
      if (!spec.sections || spec.sections.length < 2) {
        console.error('[Lesson] Generated spec has insufficient sections:', spec.sections?.length ?? 0);
        return res.status(503).json({ error: "Lesson generation produced invalid content (insufficient sections). Please try again." });
      }
      if (!spec.questions || spec.questions.length < 2) {
        console.error('[Lesson] Generated spec has insufficient questions:', spec.questions?.length ?? 0);
        return res.status(503).json({ error: "Lesson generation produced invalid content (insufficient questions). Please try again." });
      }

      // Determine lesson status: QUEUED if parent requires approval, ACTIVE otherwise
      const lessonStatus = learnerProfile.requireLessonApproval ? "QUEUED" : "ACTIVE";

      // Retire any existing ACTIVE lesson — handle unique index conflict
      const previousLesson = await storage.getActiveLesson(targetLearnerId);
      if (previousLesson) {
        await storage.updateLessonStatus(previousLesson.id, "DONE", 0);
      }

      let newLesson;
      try {
        newLesson = await storage.createLesson({
          id: crypto.randomUUID(),
          learnerId: Number(targetLearnerId),
          templateId,
          moduleId: "custom-" + Date.now(),
          status: lessonStatus,
          subject: finalSubject,
          category: finalCategory,
          difficulty,
          spec,
          imagePaths: []
        });
      } catch (insertErr: any) {
        // Handle unique index conflict (23505) — another ACTIVE lesson snuck in
        if (insertErr?.code === '23505') {
          const conflicting = await storage.getActiveLesson(targetLearnerId);
          if (conflicting) {
            await storage.updateLessonStatus(conflicting.id, "DONE", 0);
          }
          newLesson = await storage.createLesson({
            id: crypto.randomUUID(),
            learnerId: Number(targetLearnerId),
            templateId,
            moduleId: "custom-" + Date.now(),
            status: lessonStatus,
            subject: finalSubject,
            category: finalCategory,
            difficulty,
            spec,
            imagePaths: []
          });
        } else {
          throw insertErr;
        }
      }

      // Background image generation
      const lessonId = newLesson.id;
      const savedSpec = spec;
      backgroundTask(`images-${lessonId}`, async () => {
        const { images: generatedImages, diagrams } = await generateLessonImages(
          savedSpec, topic, gradeLevel, finalSubject
        );
        if (generatedImages?.length) {
          const imgPaths = generatedImages
            .filter((img: any) => img.path)
            .map((img: any) => ({ path: img.path, alt: img.alt || img.description, description: img.description }));
          // Merge generated images into the original spec images by ID,
          // preserving metadata for images that weren't generated (over the cap)
          const generatedById = new Map(generatedImages.map((img: any) => [img.id, img]));
          const mergedImages = (savedSpec.images || []).map((origImg: any) => {
            const generated = generatedById.get(origImg.id);
            return generated ? { ...origImg, ...generated } : origImg;
          });
          const mergedSpec = { ...savedSpec, images: mergedImages, diagrams: diagrams || [] };
          await storage.updateLessonImages(lessonId, mergedSpec, imgPaths);
          console.log(`[BG] Images generated for lesson ${lessonId} (${generatedImages.length} generated, ${mergedImages.length} total)`);
        }
      });

      return res.json(newLesson);
    } catch (error) {
      console.error('Error creating custom lesson:', error);
      return res.status(500).json({ error: "Failed to generate lesson content" });
    }
  }));

  // Get a specific lesson by ID
  app.get("/api/lessons/:lessonId", isAuthenticated, asyncHandler(async (req: AuthRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const lessonId = req.params.lessonId;
    const lesson = await storage.getLessonById(lessonId);

    if (!lesson) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    // Check user's permission to access this lesson
    if (
      req.user.role === "ADMIN" ||
      ensureString(req.user.id) === lesson.learnerId.toString() ||
      (req.user.role === "PARENT" && (await storage.getUsersByParentId(req.user.id)).some(u => u.id === lesson.learnerId))
    ) {
      return res.json(lesson);
    }

    return res.status(403).json({ error: "Forbidden" });
  }));

  // Get lesson history
  app.get("/api/lessons", isAuthenticated, asyncHandler(async (req: AuthRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let learnerId: string;

    if (req.user.role === "LEARNER") {
      learnerId = ensureString(req.user.id);
    } else if (req.query.learnerId) {
      learnerId = req.query.learnerId as string;

      // Check if user is authorized to view this learner's lessons
      if (req.user.role === "PARENT") {
        const children = await storage.getUsersByParentId(req.user.id);
        if (!children.some(child => child.id.toString() === learnerId.toString())) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }
    } else {
      return res.status(400).json({ error: "learnerId is required" });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const lessons = await storage.getLessonHistory(learnerId, limit);
    res.json(lessons);
  }));

  // Submit answer to a quiz question
  app.post("/api/lessons/:lessonId/answer", isAuthenticated, asyncHandler(async (req: AuthRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const lessonId = req.params.lessonId;
    const { answers, doubleOrLoss: doubleOrLossFlag, doubleQuestionIndices } = req.body;

    if (!Array.isArray(answers)) {
      return res.status(400).json({ error: "Answers must be an array" });
    }

    const lesson = await storage.getLessonById(lessonId);

    if (!lesson) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    // Allow the learner themselves, their parent, or an admin to submit answers
    const isOwner = lesson.learnerId.toString() === ensureString(req.user.id);
    const isParent = req.user.role === "PARENT" &&
      (await storage.getUsersByParentId(req.user.id)).some(u => u.id.toString() === lesson.learnerId.toString());
    const isAdmin = req.user.role === "ADMIN";

    if (!isOwner && !isParent && !isAdmin) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (lesson.status !== "ACTIVE") {
      return res.status(400).json({ error: "Lesson is not active" });
    }

    // Calculate score
    if (!lesson.spec) {
      return res.status(400).json({ error: "Invalid lesson specification" });
    }

    const questions = lesson.spec.questions;
    let correctCount = 0;

    for (let i = 0; i < Math.min(answers.length, questions.length); i++) {
      if (answers[i] === questions[i].correctIndex) {
        correctCount++;
      }
    }

    const score = Math.round((correctCount / questions.length) * 100);

    // Update lesson status
    const updatedLesson = await storage.updateLessonStatus(lessonId, "DONE", score);

    // Update template average score if this lesson came from the library
    if (lesson.templateId) {
      storage.updateTemplateAvgScore(lesson.templateId, score).catch(err =>
        console.error('[Library] Failed to update template avg score:', err)
      );
    }

    // Use the lesson's learner ID (not req.user.id) so that points, mastery,
    // and analytics are attributed to the child even when a parent submits.
    const learnerId: number = typeof lesson.learnerId === 'number' ? lesson.learnerId : parseInt(String(lesson.learnerId), 10);

    // === NEW: Store individual quiz answers for analytics ===
    try {
      await storeQuizAnswers(
        learnerId,
        lessonId,
        questions,
        answers,
        lesson.subject || 'General'
      );
    } catch (error) {
      console.error('Error storing quiz answers:', error);
      // Don't fail the request if storage fails
    }

    // === NEW: Update concept mastery tracking ===
    try {
      const conceptsAndCorrectness = questions.map((question, index) => {
        const concepts = extractConceptTags(question, lesson.subject || 'General');
        const isCorrect = answers[index] === question.correctIndex;
        return { concepts, isCorrect };
      });

      await bulkUpdateMasteryFromAnswers(
        learnerId,
        lesson.subject || 'General',
        conceptsAndCorrectness
      );
    } catch (error) {
      console.error('Error updating concept mastery:', error);
      // Don't fail the request if mastery update fails
    }

    // === NEW: Store question hashes for deduplication ===
    try {
      await storeQuestionHashes(
        learnerId,
        lesson.subject || 'General',
        questions
      );
    } catch (error) {
      console.error('Error storing question hashes:', error);
      // Don't fail the request if deduplication storage fails
    }

    // Check for achievements
    const lessonHistory = await storage.getLessonHistory(learnerId);
    const newAchievements = checkForAchievements(lessonHistory, updatedLesson);

    // Award any new achievements (skip duplicates)
    const existingAchievements = await storage.getAchievements(ensureString(learnerId));
    const existingTypes = new Set(existingAchievements.map(a => a.type));

    for (const achievement of newAchievements) {
      if (existingTypes.has(achievement.type)) continue;
      await storage.createAchievement({
        learnerId: ensureString(learnerId),
        type: achievement.type,
        payload: achievement.payload
      });
    }

    // After score calculation — award points with per-question Double-or-Loss
    const wrongCount = questions.length - correctCount;

    // Support both legacy whole-quiz flag and new per-question indices
    const perQuestionDoubles: Set<number> = new Set(
      Array.isArray(doubleQuestionIndices) ? doubleQuestionIndices : []
    );
    const isLegacyDoubleOrLoss = doubleOrLossFlag === true && perQuestionDoubles.size === 0;

    let pointsAwarded = 0;
    let pointsDeducted = 0;

    for (let i = 0; i < questions.length; i++) {
      const isCorrect = answers[i] === questions[i].correctIndex;
      const isDoubled = isLegacyDoubleOrLoss || perQuestionDoubles.has(i);
      if (isCorrect) {
        pointsAwarded += isDoubled ? 2 : 1;
      } else if (isDoubled) {
        pointsDeducted += 1;
      }
    }

    const hasAnyDouble = isLegacyDoubleOrLoss || perQuestionDoubles.size > 0;

    let newBalance = 0;
    try {
      if (pointsAwarded > 0) {
        await pointsService.awardPoints({
          learnerId,
          amount: pointsAwarded,
          sourceType: "QUIZ_CORRECT",
          sourceId: lessonId,
          description: `Quiz ${score}%${hasAnyDouble ? ' [Double-or-Loss]' : ''}`
        });
      }

      // Double-or-Loss deduction for wrong answers on doubled questions
      if (pointsDeducted > 0) {
        const { applyDoubleOrLossDeduction } = await import('./services/rewards-service');
        await applyDoubleOrLossDeduction(learnerId, pointsDeducted);
      }

      newBalance = await pointsService.getBalance(learnerId);
    } catch (pointsErr) {
      console.error('Points/rewards error (quiz still succeeds):', pointsErr);
    }

    res.json({
      lesson: updatedLesson,
      score,
      correctCount,
      totalQuestions: questions.length,
      wrongCount,
      pointsAwarded,
      pointsDeducted,
      doubleOrLoss: hasAnyDouble,
      doubleQuestionIndices: Array.from(perQuestionDoubles),
      newBalance,
      newAchievements: newAchievements.map(a => a.payload)
    });

    // ── Background pre-generation: queue next lesson so one is always ready ──
    backgroundTask(`pregen-learner-${learnerId}`, async () => {
      // Check if learner already has an ACTIVE lesson
      const existingActive = await storage.getActiveLesson(String(learnerId));
      if (existingActive) return; // already has one ready

      const profile = await storage.getLearnerProfile(String(learnerId));
      if (!profile || !profile.subjects?.length) return;

      const nextSubject = profile.subjects[Math.floor(Math.random() * profile.subjects.length)];
      const { getSubjectCategory } = await import('./services/subject-recommendation');
      const nextCategory = getSubjectCategory(nextSubject);

      // Use shared lesson library for pre-generation too
      const { spec, templateId } = await findOrCreateTemplate(
        storage,
        nextSubject,
        profile.gradeLevel,
        nextSubject,
        'beginner',
        () => generateLessonWithRetry(profile.gradeLevel, nextSubject, {
          subject: nextSubject,
          difficulty: 'beginner',
          learnerId: Number(learnerId),
        })
      );

      const queued = await storage.createLesson({
        id: crypto.randomUUID(),
        learnerId: Number(learnerId),
        templateId,
        moduleId: "auto-" + Date.now(),
        status: "ACTIVE",
        subject: nextSubject,
        category: nextCategory,
        difficulty: 'beginner',
        spec,
        imagePaths: []
      });
      console.log(`[BG] Pre-generated lesson ${queued.id} for learner ${learnerId}`);
    });
  }));

  // Get achievements for a learner
  app.get("/api/achievements", isAuthenticated, asyncHandler(async (req: AuthRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let learnerId: string;

    if (req.user.role === "LEARNER") {
      learnerId = ensureString(req.user.id);
    } else if (req.query.learnerId) {
      learnerId = req.query.learnerId as string;

      // Check if user is authorized to view this learner's achievements
      if (req.user.role === "PARENT") {
        const children = await storage.getUsersByParentId(req.user.id);
        if (!children.some(child => child.id.toString() === learnerId.toString())) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }
    } else {
      return res.status(400).json({ error: "learnerId is required" });
    }

    const achievements = await storage.getAchievements(learnerId);
    res.json(achievements);
  }));

  // Get reports data
  app.get("/api/reports", isAuthenticated, asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!req.query.learnerId) {
      return res.status(400).json({ error: "learnerId is required" });
    }

    const learnerId = req.query.learnerId as string;
    const reportType = (req.query.type as string) || 'all';

    // Check if user is authorized to view this learner's reports
    if (req.user.role !== 'ADMIN' && ensureString(req.user.id) !== learnerId.toString()) {
      if (req.user.role === "PARENT") {
        const children = await storage.getUsersByParentId(req.user.id);
        if (!children.some(child => child.id.toString() === learnerId.toString())) {
          return res.status(403).json({ error: "Forbidden" });
        }
      } else {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    // Get the learner data based on report type
    try {
      if (reportType === 'progress' || reportType === 'all') {
        const [learner, profile, lessons, achievements] = await Promise.all([
          storage.getUser(learnerId),
          storage.getLearnerProfile(learnerId),
          storage.getLessonHistory(learnerId),
          storage.getAchievements(learnerId)
        ]);

        if (!learner) {
          return res.status(404).json({ error: "Learner not found" });
        }

        // Remove sensitive information
        const { password: _, ...learnerData } = learner;

        // Calculate statistics
        const completedLessons = lessons.filter(lesson => lesson.status === 'DONE').length;
        const activeLessons = lessons.filter(lesson => lesson.status === 'ACTIVE').length;
        const queuedLessons = lessons.filter(lesson => lesson.status === 'QUEUED').length;

        // Calculate subject performance if available
        let subjectPerformance = profile?.subjectPerformance || {};

        // Get concept mastery count from the mastery service
        let conceptsLearnedCount = 0;
        try {
          const { getMasterySummary } = await import('./services/mastery-service');
          const masterySummary = await getMasterySummary(Number(learnerId));
          conceptsLearnedCount = masterySummary.totalConcepts;
        } catch (e) {
          console.error('Error fetching mastery summary for report:', e);
        }

        // Calculate additional analytics
        const analytics = {
          lessonsCompleted: completedLessons,
          lessonsActive: activeLessons,
          lessonsQueued: queuedLessons,
          totalLessons: lessons.length,
          achievementsCount: achievements.length,
          conceptsLearned: conceptsLearnedCount,
          progressRate: lessons.length > 0 ? (completedLessons / lessons.length) * 100 : 0,
          subjectDistribution: {} as Record<string, number>
        };

        // Calculate subject distribution
        lessons.forEach(lesson => {
          if (lesson.subject) {
            analytics.subjectDistribution[lesson.subject] = 
              (analytics.subjectDistribution[lesson.subject] || 0) + 1;
          }
        });

        res.json({
          learner: learnerData,
          profile,
          analytics,
          subjectPerformance,
          reportGeneratedAt: new Date().toISOString()
        });
      } else if (reportType === 'lessons') {
        const lessons = await storage.getLessonHistory(learnerId);
        res.json({
          lessons,
          reportGeneratedAt: new Date().toISOString()
        });
      } else if (reportType === 'achievements') {
        const achievements = await storage.getAchievements(learnerId);
        res.json({
          achievements,
          reportGeneratedAt: new Date().toISOString()
        });
      } else {
        return res.status(400).json({ error: "Invalid report type" });
      }
    } catch (error) {
      console.error("Error generating report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  }));

  // Export learner data (for data portability)
  app.get("/api/export", hasRole(["PARENT", "ADMIN"]), asyncHandler(async (req: AuthRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!req.query.learnerId) {
      return res.status(400).json({ error: "learnerId is required" });
    }

    const learnerId = req.query.learnerId as string;

    // Verify parent has access to this learner
    if (req.user.role === "PARENT") {
      const children = await storage.getUsersByParentId(req.user.id);
      if (!children.some(child => child.id.toString() === learnerId.toString())) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    // Get all the learner data
    const [learner, profile, lessons, achievements, promptLogResult] = await Promise.all([
      storage.getUser(learnerId),
      storage.getLearnerProfile(learnerId),
      storage.getLessonHistory(learnerId, 1000), // Get a large number of lessons
      storage.getAchievements(learnerId),
      pool.query(
        `SELECT * FROM prompt_log WHERE learner_id = $1 ORDER BY created_at DESC`,
        [parseInt(learnerId, 10)]
      )
    ]);

    if (!learner) {
      res.status(404).json({ error: "Learner not found" });
    }

    // Remove sensitive information
    const { password: _, ...learnerData } = learner;

    // Set filename for download
    const filename = `learner-data-${learnerId}-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');

    // Return combined data
    res.json({
      learner: learnerData,
      profile,
      lessons,
      achievements,
      promptLog: promptLogResult.rows,
      exportDate: new Date().toISOString(),
      exportedBy: req.user.id
    });
  }));

  // Database Synchronization Endpoints

  // Get all sync configurations for a parent
  app.get("/api/sync-configs", hasRole(["PARENT", "ADMIN"]), asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const syncConfigs = await storage.getSyncConfigsByParentId(ensureString(req.user.id));
      res.json(syncConfigs);
    } catch (error) {
      console.error('Error getting sync configurations:', error);
      res.status(500).json({ error: "Failed to retrieve synchronization configurations" });
    }
  }));

  // Get a specific sync configuration
  app.get("/api/sync-configs/:id", hasRole(["PARENT", "ADMIN"]), asyncHandler(async (req: AuthRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const syncConfig = await storage.getSyncConfigById(req.params.id);

      if (!syncConfig) {
        return res.status(404).json({ error: "Sync configuration not found" });
      }

      // Check if the sync config belongs to the requesting parent (admins can access all)
      if (req.user.role !== 'ADMIN' && ensureString(syncConfig.parentId) !== ensureString(req.user.id)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      res.json(syncConfig);
    } catch (error) {
      console.error('Error getting sync configuration:', error);
      res.status(500).json({ error: "Failed to retrieve synchronization configuration" });
    }
  }));

  // Create a new sync configuration
  app.post("/api/sync-configs", hasRole(["PARENT", "ADMIN"]), asyncHandler(async (req: AuthRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { targetDbUrl, continuousSync = false } = req.body;

    if (!targetDbUrl) {
      return res.status(400).json({ error: "Missing required field: targetDbUrl" });
    }

    // Validate PostgreSQL connection string format
    const postgresRegex = /^postgresql:\/\/\w+:.*@[\w.-]+:\d+\/\w+(\?.*)?$/;
    if (!postgresRegex.test(targetDbUrl)) {
      return res.status(400).json({ 
        error: "Invalid PostgreSQL connection string format",
        message: "Connection string should be in format: postgresql://username:password@hostname:port/database"
      });
    }

    try {
      const syncConfig = await storage.createSyncConfig({
        parentId: ensureString(req.user.id),
        targetDbUrl,
        continuousSync,
        syncStatus: "IDLE"
      });

      res.status(201).json(syncConfig);
    } catch (error) {
      console.error('Error creating sync configuration:', error);
      res.status(500).json({ error: "Failed to create synchronization configuration" });
    }
  }));

  // Update a sync configuration
  app.put("/api/sync-configs/:id", hasRole(["PARENT", "ADMIN"]), asyncHandler(async (req: AuthRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { targetDbUrl, continuousSync } = req.body;
    const updateData: Partial<InsertDbSyncConfig> = {};

    if (targetDbUrl !== undefined) {
      // Validate PostgreSQL connection string format
      const postgresRegex = /^postgresql:\/\/\w+:.*@[\w.-]+:\d+\/\w+(\?.*)?$/;
      if (!postgresRegex.test(targetDbUrl)) {
        res.status(400).json({ 
          error: "Invalid PostgreSQL connection string format",
          message: "Connection string should be in format: postgresql://username:password@hostname:port/database"
        });
      }
      updateData.targetDbUrl = targetDbUrl;
    }

    if (continuousSync !== undefined) {
      updateData.continuousSync = continuousSync;
    }

    try {
      // Check if the sync config exists and belongs to the requesting parent
      const syncConfig = await storage.getSyncConfigById(req.params.id);

      if (!syncConfig) {
        return res.status(404).json({ error: "Sync configuration not found" });
      }

      if (req.user.role !== 'ADMIN' && ensureString(syncConfig.parentId) !== ensureString(req.user.id)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Update the sync config
      const updatedConfig = await storage.updateSyncConfig(req.params.id, updateData);
      res.json(updatedConfig);
    } catch (error) {
      console.error('Error updating sync configuration:', error);
      res.status(500).json({ error: "Failed to update synchronization configuration" });
    }
  }));

  // Delete a sync configuration
  app.delete("/api/sync-configs/:id", hasRole(["PARENT", "ADMIN"]), asyncHandler(async (req: AuthRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      // Check if the sync config exists and belongs to the requesting parent
      const syncConfig = await storage.getSyncConfigById(req.params.id);

      if (!syncConfig) {
        return res.status(404).json({ error: "Sync configuration not found" });
      }

      if (req.user.role !== 'ADMIN' && ensureString(syncConfig.parentId) !== ensureString(req.user.id)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Delete the sync config
      const deleted = await storage.deleteSyncConfig(req.params.id);

      if (deleted) {
        res.status(204).end();
      } else {
        res.status(500).json({ error: "Failed to delete synchronization configuration" });
      }
    } catch (error) {
      console.error('Error deleting sync configuration:', error);
      res.status(500).json({ error: "Failed to delete synchronization configuration" });
    }
  }));

  // Initiate a one-time sync (push)
  app.post("/api/sync-configs/:id/push", hasRole(["PARENT", "ADMIN"]), asyncHandler(async (req: AuthRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      // Check if the sync config exists and belongs to the requesting parent
      const syncConfig = await storage.getSyncConfigById(req.params.id);

      if (!syncConfig) {
        return res.status(404).json({ error: "Sync configuration not found" });
      }

      if (req.user.role !== 'ADMIN' && ensureString(syncConfig.parentId) !== ensureString(req.user.id)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Update status to IN_PROGRESS
      await storage.updateSyncStatus(req.params.id, "IN_PROGRESS");

      // Start the synchronization process (handled by a separate function)
      // Note: synchronizeToExternalDatabase now handles its own status updates
      synchronizeToExternalDatabase(ensureString(req.user.id), syncConfig)
        .then(() => {
          console.log(`Synchronization process completed for config ID: ${req.params.id}`);
          // The synchronizeToExternalDatabase function now updates the status internally
        })
        .catch((error) => {
          // Just log the error - the function handles status updates itself
          console.error('Error during synchronization (caught in route handler):', error);
        });

      // Return immediately to the client with a status indicating the sync has started
      res.json({ 
        message: "Synchronization started", 
        syncId: req.params.id,
        status: "IN_PROGRESS" 
      });
    } catch (error) {
      console.error('Error initiating synchronization:', error);
      res.status(500).json({ error: "Failed to initiate synchronization" });
    }
  }));

  // NEW: Points balance endpoint
  app.get("/api/points/balance", isAuthenticated, asyncHandler(async (req: AuthRequest, res) => {
    const learnerIdRaw = req.user?.role === "LEARNER" ? req.user.id : req.query.learnerId;
    const learnerId = String(learnerIdRaw);
    if (!learnerId) return res.status(400).json({ error: "learnerId required" });

    // Parents can only access their children
    if (req.user?.role === "PARENT" && learnerId.toString() !== req.user.id.toString()) {
      const children = await storage.getUsersByParentId(req.user.id);
      if (!children.some(c => c.id.toString() === learnerId.toString())) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }
    const balance = await pointsService.getBalance(learnerId);
    res.json({ balance });
  }));

  // NEW: Points history endpoint
  app.get("/api/points/history", isAuthenticated, asyncHandler(async (req: AuthRequest, res) => {
    const learnerIdRaw = req.user?.role === "LEARNER" ? req.user.id : req.query.learnerId;
    const learnerId = String(learnerIdRaw);
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    if (!learnerId) return res.status(400).json({ error: "learnerId required" });
    // Authorization same as above
    if (req.user?.role === "PARENT" && learnerId.toString() !== req.user.id.toString()) {
      const children = await storage.getUsersByParentId(req.user.id);
      if (!children.some(c => c.id.toString() === learnerId.toString())) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }
    const history = await pointsService.getHistory(learnerId, limit);
    res.json(history);
  }));

  // Get current token balance for learner
  app.get("/api/points", isAuthenticated, asyncHandler(async (req: AuthRequest, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const balance = await pointsService.getBalance(req.user.id);
    res.json({ balance });
  }));

  // List active activities (rewards) catalog
  app.get("/api/activities", isAuthenticated, asyncHandler(async (_req, res) => {
    const activities = await activityService.getAll();
    res.json(activities);
  }));

  // Allocate tokens to activities (creates awards)
  app.post("/api/awards/allocate", isAuthenticated, asyncHandler(async (req: AuthRequest, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { allocations } = req.body; // [{activityId, tokens}]
    if (!Array.isArray(allocations)) {
      return res.status(400).json({ error: "allocations must be an array" });
    }

    try {
      const awards = await activityService.allocateTokens(String(req.user.id), allocations);
      res.json({ awards });
    } catch (err: any) {
      if (err.message === "INSUFFICIENT_TOKENS") {
        return res.status(400).json({ error: "Not enough tokens" });
      }
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  }));

  // Mark award as cashed in
  app.post("/api/awards/:awardId/cash-in", isAuthenticated, asyncHandler(async (req: AuthRequest, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { awardId } = req.params;
    await activityService.markCashedIn(awardId, String(req.user.id));
    res.json({ status: "OK" });
  }));

  // Toggle sharing for an award
  app.post("/api/awards/:awardId/share", isAuthenticated, asyncHandler(async (req: AuthRequest, res) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    const { awardId } = req.params;
    const { active, title, description } = req.body;
    const hash = await activityService.toggleShare(awardId, String(req.user.id), !!active, title, description);
    res.json({ shareUrl: `${process.env.APP_BASE_URL || ''}/users/${req.user.username}/award/${hash}` });
  }));

  // Public award share endpoint (no auth)
  app.get("/users/:username/award/:hash", asyncHandler(async (req, res) => {
    const { username, hash } = req.params;
    const share = await activityService.getShareByHash(username, hash);
    if (!share) return res.status(404).json({ error: "Not found" });
    res.json(share);
  }));

  // ─────────────────────────────────────────────────────────────────────
  // REWARDS SYSTEM
  // ─────────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const rewardsService = require('./services/rewards-service');

  // ── Parent: Reward CRUD ───────────────────────────────────────────────

  app.get('/api/rewards', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const user = authReq.user!;
    const learnerId = req.query.learnerId ? Number(req.query.learnerId) : null;

    // If a learnerId is provided (parent viewing for a specific learner) use that
    if (learnerId) {
      const rewards = await rewardsService.getRewardsForLearner(learnerId);
      return res.json(rewards);
    }
    if (user.role === 'LEARNER') {
      // Learners see their parent's rewards with their own savings progress
      const rewards = await rewardsService.getRewardsForLearner(Number(user.id));
      return res.json(rewards);
    }
    // Parents/admins see their own rewards catalog
    const rewards = await rewardsService.getRewardsForParent(Number(user.id));
    res.json(rewards);
  }));

  app.post('/api/rewards', hasRole(['PARENT', 'ADMIN']), asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { title, description, tokenCost, category, maxRedemptions, imageEmoji, color } = req.body;
    if (!title || !tokenCost) return res.status(400).json({ error: 'title and tokenCost are required' });
    const reward = await rewardsService.createReward(Number(authReq.user!.id), {
      title, description, tokenCost: Number(tokenCost), category, maxRedemptions, imageEmoji, color,
    });
    res.status(201).json(reward);
  }));

  app.put('/api/rewards/:rewardId', hasRole(['PARENT', 'ADMIN']), asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { rewardId } = req.params;
    const reward = await rewardsService.updateReward(rewardId, Number(authReq.user!.id), req.body);
    res.json(reward);
  }));

  app.delete('/api/rewards/:rewardId', hasRole(['PARENT', 'ADMIN']), asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    await rewardsService.deleteReward(req.params.rewardId, Number(authReq.user!.id));
    res.json({ success: true });
  }));

  // ── Learner: Goal savings & redemption requests ───────────────────────

  app.post('/api/rewards/:rewardId/save', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const { points } = req.body;
    if (!points || Number(points) <= 0) return res.status(400).json({ error: 'points must be positive' });
    const learnerId = req.query.learnerId
      ? Number(req.query.learnerId)
      : Number(authReq.user!.id);
    try {
      await rewardsService.delegatePointsToGoal(learnerId, req.params.rewardId, Number(points));
      res.json({ success: true, pointsDelegated: Number(points) });
    } catch (err: any) {
      const msg = err?.message ?? '';
      if (msg.includes('Insufficient balance')) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }
      throw err;
    }
  }));

  app.post('/api/rewards/:rewardId/redeem', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const learnerId = req.query.learnerId
      ? Number(req.query.learnerId)
      : Number(authReq.user!.id);
    try {
      const redemption = await rewardsService.requestRedemption(learnerId, req.params.rewardId);
      res.status(201).json(redemption);
    } catch (err: any) {
      const msg = err?.message ?? '';
      if (msg.includes('saved points') || msg.includes('Insufficient') || msg.includes('Need ')) {
        return res.status(400).json({ error: 'Insufficient saved points' });
      }
      if (msg.includes('not found')) {
        return res.status(404).json({ error: msg });
      }
      if (msg.includes('already pending')) {
        return res.status(409).json({ error: msg });
      }
      throw err;
    }
  }));

  // ── Parent: Redemption management ────────────────────────────────────

  app.get('/api/redemptions', hasRole(['PARENT', 'ADMIN']), asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const status = req.query.status as string | undefined;
    const redemptions = await rewardsService.getRedemptionsForParent(Number(authReq.user!.id), status);
    res.json(redemptions);
  }));

  app.get('/api/redemptions/my', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const learnerId = req.query.learnerId
      ? Number(req.query.learnerId)
      : Number(authReq.user!.id);
    const redemptions = await rewardsService.getRedemptionsForLearner(learnerId);
    res.json(redemptions);
  }));

  app.put('/api/redemptions/:redemptionId/approve', hasRole(['PARENT', 'ADMIN']), asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const result = await rewardsService.approveRedemption(
      req.params.redemptionId,
      Number(authReq.user!.id),
      req.body.notes
    );
    res.json(result);
  }));

  app.put('/api/redemptions/:redemptionId/reject', hasRole(['PARENT', 'ADMIN']), asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const result = await rewardsService.rejectRedemption(
      req.params.redemptionId,
      Number(authReq.user!.id),
      req.body.notes
    );
    res.json(result);
  }));

  // ── Double-or-loss mode ───────────────────────────────────────────────

  app.get('/api/learner-settings/:learnerId', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
    const doubleOrLoss = await rewardsService.getDoubleOrLoss(Number(req.params.learnerId));
    res.json({ doubleOrLossEnabled: doubleOrLoss });
  }));

  app.put('/api/learner-settings/:learnerId/double-or-loss', hasRole(['PARENT', 'ADMIN']), asyncHandler(async (req: Request, res: Response) => {
    const { enabled } = req.body;
    const result = await rewardsService.setDoubleOrLoss(Number(req.params.learnerId), Boolean(enabled));
    res.json(result);
  }));

  // ── Rewards summary for learner dashboard ─────────────────────────────

  app.get('/api/rewards-summary', isAuthenticated, asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    const learnerId = req.query.learnerId
      ? Number(req.query.learnerId)
      : Number(authReq.user!.id);
    const summary = await rewardsService.getRewardSummaryForLearner(learnerId);
    res.json(summary);
  }));

  // ── Stale lesson cleanup (admin-only) ──────────────────────────────────
  app.get("/api/lessons/cleanup", hasRole(["ADMIN"]), asyncHandler(async (req: AuthRequest, res) => {
    // Find all ACTIVE lessons older than 1 hour with no quiz answers
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - ONE_HOUR_MS);

    const activeRows = await db.select()
      .from(lessons)
      .where(eq(lessons.status, "ACTIVE"));

    let cleaned = 0;
    for (const lesson of activeRows) {
      const createdAt = lesson.createdAt ? new Date(lesson.createdAt) : null;
      if (!createdAt || createdAt >= cutoff) continue;

      // Check for quiz answers via raw SQL (quizAnswers table)
      const answerResult = await pool.query(
        'SELECT COUNT(*) as cnt FROM quiz_answers WHERE lesson_id = $1',
        [lesson.id]
      );
      const hasAnswers = parseInt(answerResult.rows[0]?.cnt ?? '0', 10) > 0;
      if (hasAnswers) continue;

      await storage.updateLessonStatus(lesson.id, "DONE", 0);
      console.warn(`[Cleanup] Retired stale lesson ${lesson.id}, created ${lesson.createdAt}`);
      cleaned++;
    }

    return res.json({ cleaned, message: `Retired ${cleaned} stale lesson(s)` });
  }));

  // Admin: purge E2E test users (email matching %@test.com, non-ADMIN)
  app.delete("/api/admin/cleanup-test-users", hasRole(["ADMIN"]), asyncHandler(async (_req: Request, res: Response) => {
    const testUsers = await db.select().from(users).where(
      and(
        like(users.email, '%@test.com'),
        ne(users.role, 'ADMIN')
      )
    );
    for (const u of testUsers) {
      await db.delete(users).where(eq(users.id, u.id));
    }
    return res.json({ deleted: testUsers.length, users: testUsers.map(u => ({ id: u.id, username: u.username, email: u.email })) });
  }));

  // ── Circuit breaker status (admin-only) ──────────────────────────────────
  app.get("/api/admin/circuit-breakers", hasRole(["ADMIN"]), (_req: Request, res: Response) => {
    res.json(getAllCircuitBreakerStates());
  });

  // ── Lesson analytics endpoints (admin-only) ────────────────────────────────

  app.get("/api/admin/lesson-analytics", hasRole(["ADMIN"]), asyncHandler(async (_req: Request, res: Response) => {
    const analytics = await getLessonAnalytics();
    return res.json(analytics);
  }));

  app.get("/api/admin/low-quality-templates", hasRole(["ADMIN"]), asyncHandler(async (_req: Request, res: Response) => {
    const flagged = await flagLowQualityTemplates();
    return res.json({ count: flagged.length, templates: flagged });
  }));

  app.get("/api/admin/auto-tuner/history", hasRole(["ADMIN"]), (_req: Request, res: Response) => {
    const history = getTuningHistory(50);
    res.json({ history });
  });

  app.post("/api/admin/auto-tuner/run", hasRole(["ADMIN"]), asyncHandler(async (_req: Request, res: Response) => {
    await runAutoTuner();
    res.json({ message: "Auto-tuner run completed" });
  }));

  // ── Maintenance endpoints (admin-only) ────────────────────────────────────

  app.get("/api/admin/maintenance/orphaned-images", hasRole(["ADMIN"]), asyncHandler(async (_req: Request, res: Response) => {
    const result = await detectOrphanedImages(false);
    res.json(result);
  }));

  app.post("/api/admin/maintenance/orphaned-images/fix", hasRole(["ADMIN"]), asyncHandler(async (_req: Request, res: Response) => {
    const result = await detectOrphanedImages(true);
    res.json(result);
  }));

  app.get("/api/admin/maintenance/partial-quizzes", hasRole(["ADMIN"]), asyncHandler(async (_req: Request, res: Response) => {
    const result = await detectPartialQuizSubmissions(false);
    res.json(result);
  }));

  app.get("/api/admin/maintenance/points-reconciliation", hasRole(["ADMIN"]), asyncHandler(async (_req: Request, res: Response) => {
    const result = await reconcilePointsBalances(false);
    res.json(result);
  }));

  app.post("/api/admin/maintenance/points-reconciliation/fix", hasRole(["ADMIN"]), asyncHandler(async (_req: Request, res: Response) => {
    const result = await reconcilePointsBalances(true);
    res.json(result);
  }));

  app.get("/api/admin/maintenance/all", hasRole(["ADMIN"]), asyncHandler(async (_req: Request, res: Response) => {
    const [orphanedImages, partialQuizzes, pointsReconciliation] = await Promise.all([
      detectOrphanedImages(false),
      detectPartialQuizSubmissions(false),
      reconcilePointsBalances(false),
    ]);
    res.json({ orphanedImages, partialQuizzes, pointsReconciliation });
  }));

  // ── Prompt Audit Endpoints ──────────────────────────────────────────────
  // GET /api/lessons/:lessonId/prompts — all prompt_log entries for a lesson
  app.get("/api/lessons/:lessonId/prompts", isAuthenticated, asyncHandler(async (req: AuthRequest, res) => {
    const { lessonId } = req.params;
    const { rows } = await pool.query(
      `SELECT * FROM prompt_log WHERE lesson_id = $1 ORDER BY created_at DESC`,
      [lessonId]
    );
    res.json(rows);
  }));

  // GET /api/learners/:learnerId/prompts — all prompt_log entries for a learner
  app.get("/api/learners/:learnerId/prompts", hasRole(["PARENT", "ADMIN"]), asyncHandler(async (req: AuthRequest, res) => {
    const learnerId = parseInt(req.params.learnerId, 10);
    if (isNaN(learnerId)) {
      return res.status(400).json({ error: "Invalid learnerId" });
    }

    // Verify parent has access to this learner
    if (req.user && req.user.role === "PARENT") {
      const children = await storage.getUsersByParentId(req.user.id);
      if (!children.some(child => child.id === learnerId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    const { rows } = await pool.query(
      `SELECT * FROM prompt_log WHERE learner_id = $1 ORDER BY created_at DESC`,
      [learnerId]
    );
    res.json(rows);
  }));

  // ─── Parent Prompt Controls ─────────────────────────────────────────────────

  // Update prompt settings for a learner profile
  app.put("/api/learner-profile/:userId/prompt-settings", hasRole(["PARENT", "ADMIN"]), asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.params.userId;
    if (!userId) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const { parentPromptGuidelines, contentRestrictions, requireLessonApproval } = req.body;

    // Validate parent owns this learner
    if (req.user?.role === "PARENT") {
      const children = await storage.getUsersByParentId(req.user.id);
      if (!children.some(child => child.id.toString() === userId.toString())) {
        return res.status(403).json({ error: "Not authorized to update this profile" });
      }
    }

    // Validate guidelines through prompt safety
    if (parentPromptGuidelines) {
      if (typeof parentPromptGuidelines !== 'string' || parentPromptGuidelines.length > 500) {
        return res.status(400).json({ error: "Guidelines must be a string of 500 characters or fewer" });
      }
      const check = await validatePromptInput(parentPromptGuidelines);
      if (!check.safe) {
        return res.status(400).json({ error: `Invalid guidelines: ${check.reason}` });
      }
    }

    if (contentRestrictions) {
      if (typeof contentRestrictions !== 'string' || contentRestrictions.length > 500) {
        return res.status(400).json({ error: "Content restrictions must be a string of 500 characters or fewer" });
      }
      const check = await validatePromptInput(contentRestrictions);
      if (!check.safe) {
        return res.status(400).json({ error: `Invalid content restrictions: ${check.reason}` });
      }
    }

    try {
      const updateQuery = `
        UPDATE learner_profiles
        SET parent_prompt_guidelines = COALESCE($2, parent_prompt_guidelines),
            content_restrictions = COALESCE($3, content_restrictions),
            require_lesson_approval = COALESCE($4, require_lesson_approval)
        WHERE user_id = $1
        RETURNING *
      `;
      const result = await pool.query(updateQuery, [
        userId,
        parentPromptGuidelines !== undefined ? parentPromptGuidelines : null,
        contentRestrictions !== undefined ? contentRestrictions : null,
        requireLessonApproval !== undefined ? requireLessonApproval : null,
      ]);

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Learner profile not found" });
      }

      const row = result.rows[0];
      return res.json({
        parentPromptGuidelines: row.parent_prompt_guidelines,
        contentRestrictions: row.content_restrictions,
        requireLessonApproval: row.require_lesson_approval,
      });
    } catch (error: any) {
      console.error('Error updating prompt settings:', error);
      return res.status(500).json({ error: "Failed to update prompt settings" });
    }
  }));

  // Approve a queued lesson (parent approval flow)
  app.put("/api/lessons/:lessonId/approve", hasRole(["PARENT", "ADMIN"]), asyncHandler(async (req: AuthRequest, res) => {
    const lessonId = req.params.lessonId;
    const lesson = await storage.getLessonById(lessonId);

    if (!lesson) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    if (lesson.status !== "QUEUED") {
      return res.status(400).json({ error: "Lesson is not pending approval" });
    }

    // Verify parent owns this learner
    if (req.user?.role === "PARENT") {
      const children = await storage.getUsersByParentId(req.user.id);
      if (!children.some(child => child.id === lesson.learnerId)) {
        return res.status(403).json({ error: "Not authorized to approve this lesson" });
      }
    }

    const updated = await storage.updateLessonStatus(lessonId, "DONE");
    return res.json(updated);
  }));

  // Reject a queued lesson (parent approval flow)
  app.put("/api/lessons/:lessonId/reject", hasRole(["PARENT", "ADMIN"]), asyncHandler(async (req: AuthRequest, res) => {
    const lessonId = req.params.lessonId;
    const lesson = await storage.getLessonById(lessonId);

    if (!lesson) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    if (lesson.status !== "QUEUED") {
      return res.status(400).json({ error: "Lesson is not pending approval" });
    }

    // Verify parent owns this learner
    if (req.user?.role === "PARENT") {
      const children = await storage.getUsersByParentId(req.user.id);
      if (!children.some(child => child.id === lesson.learnerId)) {
        return res.status(403).json({ error: "Not authorized to reject this lesson" });
      }
    }

    // Delete the rejected lesson
    try {
      await pool.query('DELETE FROM lessons WHERE id = $1', [lessonId]);
      return res.json({ message: "Lesson rejected and removed" });
    } catch (error: any) {
      console.error('Error rejecting lesson:', error);
      return res.status(500).json({ error: "Failed to reject lesson" });
    }
  }));

  // Error handling middleware
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "An internal server error occurred" });
  });

  const httpServer = createServer(app);
  return httpServer;
}
// Applying template literal fixes in routes.ts