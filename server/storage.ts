import { users, lessons, learnerProfiles, achievements, dbSyncConfigs } from "../shared/schema";
import crypto from "crypto";
import type { 
  User, InsertUser, 
  Lesson, InsertLesson, 
  LearnerProfile, InsertLearnerProfile, 
  Achievement, InsertAchievement,
  DbSyncConfig, InsertDbSyncConfig
} from "../shared/schema";
import { db, pool, withRetry, checkDatabaseConnection } from "./db";
import { eq, and, desc } from "drizzle-orm";

// Type for upserting users from Replit auth
export interface UpsertUser {
  id: string;
  email?: string;
  username?: string;
  name?: string;
  role?: "ADMIN" | "PARENT" | "LEARNER";
}

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(insertUser: InsertUser): Promise<User>;
  getUsersByParentId(parentId: string | number): Promise<User[]>;
  getAllParents(): Promise<User[]>;
  getAllLearners(): Promise<User[]>;
  upsertUser(userData: UpsertUser): Promise<User>;

  // Learner profile operations
  getLearnerProfile(userId: string | null | undefined): Promise<LearnerProfile | undefined>;
  createLearnerProfile(profile: InsertLearnerProfile): Promise<LearnerProfile>;
  updateLearnerProfile(userId: string, data: Partial<InsertLearnerProfile>): Promise<LearnerProfile | undefined>;

  // Lesson operations
  createLesson(lesson: InsertLesson): Promise<Lesson>;
  getLessonById(id: string): Promise<Lesson | undefined>;
  getActiveLesson(learnerId: string): Promise<Lesson | undefined>;
  getLearnerLessons(learnerId: string): Promise<Lesson[]>;
  getLessonHistory(learnerId: string, limit?: number): Promise<Lesson[]>;
  updateLessonStatus(id: string, status: "QUEUED" | "ACTIVE" | "DONE", score?: number): Promise<Lesson | undefined>;
  updateLessonImages(id: string, enhancedSpec: any, imagePaths: any): Promise<void>;

  // Achievement operations
  createAchievement(achievement: InsertAchievement): Promise<Achievement>;
  getAchievements(learnerId: string): Promise<Achievement[]>;

  // Database sync operations
  getSyncConfigsByParentId(parentId: string): Promise<DbSyncConfig[]>;
  getSyncConfigById(id: string): Promise<DbSyncConfig | undefined>;
  createSyncConfig(config: InsertDbSyncConfig): Promise<DbSyncConfig>;
  updateSyncConfig(id: string, data: Partial<InsertDbSyncConfig>): Promise<DbSyncConfig | undefined>;
  deleteSyncConfig(id: string): Promise<boolean>;
  updateSyncStatus(id: string, status: "IDLE" | "IN_PROGRESS" | "FAILED" | "COMPLETED", errorMessage?: string): Promise<DbSyncConfig | undefined>;
}

export class DatabaseStorage implements IStorage {
  constructor() {
    // Initialize database connection if needed
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    try {
      // Use specific fields that exist in the database
      const result = await db
        .select({
          id: users.id,
          email: users.email,
          username: users.username,
          name: users.name,
          role: users.role,
          password: users.password,
          parentId: users.parentId,
          createdAt: users.createdAt,
          // Don't select updatedAt or profileImageUrl as they don't exist in the database
        })
        .from(users)
        .where(eq(users.id, id));

      const users_found = Array.isArray(result) ? result : [result];
      return users_found.length > 0 ? users_found[0] as User : undefined;
    } catch (error) {
      console.error(`Error in getUser for id "${id}":`, error);
      return undefined;
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      return await withRetry(async () => {
        // Use specific fields that exist in the database
        const result = await db
          .select({
            id: users.id,
            email: users.email,
            username: users.username,
            name: users.name,
            role: users.role,
            password: users.password,
            parentId: users.parentId,
            createdAt: users.createdAt,
            // Don't select updatedAt or profileImageUrl as they don't exist in the database
          })
          .from(users)
          .where(eq(users.username, username));

        const users_found = Array.isArray(result) ? result : [result];
        return users_found.length > 0 ? users_found[0] as User : undefined;
      });
    } catch (error) {
      console.error(`Error in getUserByUsername for username "${username}":`, error);

      // Check database connection when an error occurs
      await checkDatabaseConnection();

      // Return undefined on error after logging it
      return undefined;
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    const user = Array.isArray(result) ? result[0] : result;
    return user as User;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    try {
      // Set default role if not provided
      if (!userData.role) {
        userData.role = "LEARNER";
      }

      // Make sure name is set
      if (!userData.name) {
        userData.name = userData.username || userData.email?.split('@')[0] || 'New User';
      }

      // Set username if not provided
      if (!userData.username && userData.email) {
        // Use the email part before @ as username
        userData.username = userData.email.split('@')[0];
      }

      // If we still don't have a username, create one from id
      if (!userData.username) {
        userData.username = `user-${userData.id.substring(0, 6)}`;
      }

      // Use only the fields that exist in the database schema
      const dbSafeUserData = {
        id: userData.id,
        email: userData.email,
        username: userData.username,
        name: userData.name,
        role: userData.role
      };

      // Check if user already exists
      const existingUser = await this.getUser(userData.id);

      if (existingUser) {
        // Update existing user
        const [user] = await db
          .update(users)
          .set({
            ...dbSafeUserData
            // Removed updatedAt as it doesn't exist in the database
          })
          .where(eq(users.id, userData.id))
          .returning();
        return user as User;
      } else {
        // Create new user
        const result = await db
          .insert(users)
          .values({
            ...dbSafeUserData,
            createdAt: new Date()
            // Removed updatedAt as it doesn't exist in the database
          })
          .returning();
        const user = Array.isArray(result) ? result[0] : result;
        return user as User;
      }
    } catch (error) {
      console.error('Error in upsertUser:', error);
      throw error;
    }
  }

  async getUsersByParentId(parentId: string | number): Promise<User[]> {
    try {
      // Safely convert parentId to number
      let parentIdNum: number;

      if (typeof parentId === 'number') {
        parentIdNum = parentId;
      } else if (typeof parentId === 'string') {
        parentIdNum = parseInt(parentId, 10);
        if (isNaN(parentIdNum)) {
          console.error(`Invalid parentId format: "${parentId}" is not a valid number`);
          return [];
        }
      } else {
        console.error(`Invalid parentId type: ${typeof parentId}`);
        return [];
      }

      const result = await db.select().from(users).where(eq(users.parentId, parentIdNum));
      return Array.isArray(result) ? result.map(user => user as User) : [result as User];
    } catch (error) {
      console.error(`Error in getUsersByParentId for parent ID "${parentId}":`, error);
      return [];
    }
  }

  async getAllParents(): Promise<User[]> {
    try {
      const result = await db.select().from(users).where(eq(users.role, "PARENT"));
      return Array.isArray(result) ? result.map(user => user as User) : [result as User];
    } catch (error) {
      console.error('Error in getAllParents:', error);
      return [];
    }
  }

  async getAllLearners(): Promise<User[]> {
    try {
      const result = await db.select().from(users).where(eq(users.role, "LEARNER"));
      return Array.isArray(result) ? result.map(user => user as User) : [result as User];
    } catch (error) {
      console.error('Error in getAllLearners:', error);
      return [];
    }
  }

  // Learner profile operations
  async getLearnerProfile(userId: string | number | null | undefined): Promise<LearnerProfile | undefined> {
    try {
      if (!userId) {
        console.error(`Invalid user ID: ${userId}`);
        return undefined;
      }

      // Use raw SQL via the pool to avoid type issues with ORM
      const result = await pool.query(
        'SELECT * FROM learner_profiles WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length > 0) {
        // Get the row from database
        const row = result.rows[0];

        // Parse JSON fields safely
        let graph = { nodes: [], edges: [] };
        let subjects = ['Math', 'Reading', 'Science'];
        let subjectPerformance = {};
        let recommendedSubjects = [];
        let strugglingAreas = [];

        try {
          if (row.graph) {
            graph = typeof row.graph === 'string' ? JSON.parse(row.graph) : row.graph;
          }

          if (row.subjects) {
            subjects = typeof row.subjects === 'string' ? JSON.parse(row.subjects) : row.subjects;
          }

          if (row.subject_performance) {
            subjectPerformance = typeof row.subject_performance === 'string' 
              ? JSON.parse(row.subject_performance) 
              : row.subject_performance;
          }

          if (row.recommended_subjects) {
            recommendedSubjects = typeof row.recommended_subjects === 'string' 
              ? JSON.parse(row.recommended_subjects) 
              : row.recommended_subjects;
          }

          if (row.struggling_areas) {
            strugglingAreas = typeof row.struggling_areas === 'string' 
              ? JSON.parse(row.struggling_areas) 
              : row.struggling_areas;
          }
        } catch (err) {
          console.error('Error parsing learner profile JSON fields:', err);
        }

        // Construct a complete profile with data from the row
        const completeProfile: LearnerProfile = {
          id: row.id,
          userId: row.user_id,
          gradeLevel: row.grade_level,
          graph,
          subjects,
          subjectPerformance,
          recommendedSubjects,
          strugglingAreas,
          createdAt: row.created_at
        };

        return completeProfile;
      }

      return undefined;
    } catch (error) {
      console.error('Error in getLearnerProfile:', error);
      return undefined;
    }
  }

  async createLearnerProfile(profile: Omit<InsertLearnerProfile, "userId"> & { userId: string | number }): Promise<LearnerProfile> {
    try {
      // Make sure we have a UUID for the id field to prevent not-null constraint violations
      const profileWithId = {
        ...profile,
        id: profile.id || crypto.randomUUID(),
        userId: typeof profile.userId === "string" ? Number(profile.userId) : profile.userId
      };

      const result = await db.insert(learnerProfiles).values(profileWithId).returning();
      const learnerProfile = Array.isArray(result) ? result[0] : result;
      return learnerProfile as LearnerProfile;
    } catch (error) {
      console.error('Error in createLearnerProfile:', error);

      // Try again with just minimal fields if we encounter a column-related error
      if (error.message && error.message.includes('column') && error.message.includes('does not exist')) {
        // Create with only the essential fields
        const minimalProfile = {
          id: profile.id || crypto.randomUUID(),
          userId: typeof profile.userId === 'string' ? Number(profile.userId) : profile.userId,
          gradeLevel: profile.gradeLevel,
          graph: profile.graph || { nodes: [], edges: [] }
        };

        const minResult = await db.insert(learnerProfiles).values(minimalProfile as any).returning();
        const minProfile = Array.isArray(minResult) ? minResult[0] : minResult;
        return minProfile as LearnerProfile;
      }

      throw error;
    }
  }

  async updateLearnerProfile(userId: string | number, data: Partial<InsertLearnerProfile>): Promise<LearnerProfile | undefined> {
    try {
      // Convert userId to integer for database comparison (as the column is INTEGER type)
      const userIdNum = typeof userId === 'string' ? parseInt(userId) : userId;

      if (isNaN(userIdNum)) {
        console.error(`Invalid user ID for update: ${userId}`);
        return undefined;
      }

      // Use direct SQL for profile update to bypass type issues
      // First check if profile exists
      const checkQuery = `SELECT * FROM learner_profiles WHERE user_id = $1`;
      const checkResult = await pool.query(checkQuery, [userIdNum]);

      if (checkResult.rowCount === 0) {
        console.error(`Cannot update profile for user ${userId}: profile does not exist`);
        return undefined;
      }

      const existingProfileRow = checkResult.rows[0];

      // Build SET statements for the update query
      const setStatements = [];
      const queryParams = [userIdNum]; // userId is always $1
      let paramCounter = 2;

      // Process each field that can be updated
      if (data.gradeLevel !== undefined) {
        setStatements.push(`grade_level = $${paramCounter}`);
        queryParams.push(data.gradeLevel);
        paramCounter++;
      }

      if (data.graph !== undefined) {
        setStatements.push(`graph = $${paramCounter}`);
        queryParams.push(JSON.stringify(data.graph) as unknown as number);
        paramCounter++;
      }

      if (data.subjects !== undefined) {
        setStatements.push(`subjects = $${paramCounter}`);
        queryParams.push(JSON.stringify(data.subjects) as unknown as number);
        paramCounter++;
      }

      if (data.subjectPerformance !== undefined) {
        setStatements.push(`subject_performance = $${paramCounter}`);
        queryParams.push(JSON.stringify(data.subjectPerformance) as unknown as number);
        paramCounter++;
      }

      if (data.recommendedSubjects !== undefined) {
        setStatements.push(`recommended_subjects = $${paramCounter}`);
        queryParams.push(JSON.stringify(data.recommendedSubjects) as unknown as number);
        paramCounter++;
      }

      if (data.strugglingAreas !== undefined) {
        setStatements.push(`struggling_areas = $${paramCounter}`);
        queryParams.push(JSON.stringify(data.strugglingAreas) as unknown as number);
        paramCounter++;
      }

      // If we have nothing to update, just return the existing profile
      if (setStatements.length === 0) {
        return this.getLearnerProfile(userIdNum);
      }

      // Create and execute the update query
      const updateQuery = `
        UPDATE learner_profiles
        SET ${setStatements.join(', ')}
        WHERE user_id = $1
        RETURNING *
      `;

      const updateResult = await pool.query(updateQuery, queryParams);

      if (updateResult.rowCount > 0) {
        // Convert database row to expected profile format
        const updatedRow = updateResult.rows[0];

        // Parse JSON fields safely
        let graph = { nodes: [], edges: [] };
        let subjects = ['Math', 'Reading', 'Science'];
        let subjectPerformance = {};
        let recommendedSubjects = [];
        let strugglingAreas = [];

        try {
          if (updatedRow.graph) {
            graph = typeof updatedRow.graph === 'string' ? JSON.parse(updatedRow.graph) : updatedRow.graph;
          }

          if (updatedRow.subjects) {
            subjects = typeof updatedRow.subjects === 'string' ? JSON.parse(updatedRow.subjects) : updatedRow.subjects;
          }

          if (updatedRow.subject_performance) {
            subjectPerformance = typeof updatedRow.subject_performance === 'string' 
              ? JSON.parse(updatedRow.subject_performance) 
              : updatedRow.subject_performance;
          }

          if (updatedRow.recommended_subjects) {
            recommendedSubjects = typeof updatedRow.recommended_subjects === 'string' 
              ? JSON.parse(updatedRow.recommended_subjects) 
              : updatedRow.recommended_subjects;
          }

          if (updatedRow.struggling_areas) {
            strugglingAreas = typeof updatedRow.struggling_areas === 'string' 
              ? JSON.parse(updatedRow.struggling_areas) 
              : updatedRow.struggling_areas;
          }
        } catch (err) {
          console.error('Error parsing JSON fields:', err);
        }

        const completeProfile: LearnerProfile = {
          id: updatedRow.id,
          userId: updatedRow.user_id,
          gradeLevel: updatedRow.grade_level,
          graph,
          subjects,
          subjectPerformance,
          recommendedSubjects,
          strugglingAreas,
          createdAt: updatedRow.created_at
        };

        return completeProfile;
      }

      return undefined;
    } catch (error) {
      console.error('Error in updateLearnerProfile:', error);
      return undefined;
    }
  }

  // Lesson operations
  async createLesson(lesson: InsertLesson): Promise<Lesson> {
    // Make sure we have a UUID for the id field to prevent not-null constraint violations
    const lessonWithId = {
      ...lesson,
      id: crypto.randomUUID()
    };

    const result = await db.insert(lessons).values(lessonWithId).returning();
    const newLesson = Array.isArray(result) ? result[0] : result;
    return newLesson as Lesson;
  }

  async getLessonById(id: string): Promise<Lesson | undefined> {
    try {
      // Try to get the full lesson first
      try {
        const result = await db.select().from(lessons).where(eq(lessons.id, id));
        const lessonList = Array.isArray(result) ? result : [result];
        if (lessonList.length > 0) {
          return lessonList[0] as Lesson;
        }
      } catch (e) {
        // Fall back to basic query below
      }

      // Fallback to a more specific query to avoid "column does not exist" errors
      const result = await db
        .select({
          id: lessons.id,
          learnerId: lessons.learnerId,
          moduleId: lessons.moduleId,
          status: lessons.status,
          spec: lessons.spec,
          score: lessons.score,
          createdAt: lessons.createdAt,
          completedAt: lessons.completedAt,
        })
        .from(lessons)
        .where(eq(lessons.id, id));

      const lessonList = Array.isArray(result) ? result : [result];

      if (lessonList.length > 0) {
        // Return a lesson with default values for potentially missing columns
        const baseLesson = lessonList[0];
        const fullLesson = {
          ...baseLesson,
          enhancedSpec: null,
          subject: null, 
          category: null,
          difficulty: 'beginner' as const,
          imagePaths: null
        };
        return fullLesson as Lesson;
      }

      return undefined;
    } catch (error) {
      console.error('Error in getLessonById:', error);
      return undefined;
    }
  }

  async getActiveLesson(learnerId: string | number): Promise<Lesson | undefined> {
    try {
      // Try to get the full lesson first
      try {
        const result = await db.select()
          .from(lessons)
          .where(and(eq(lessons.learnerId, Number(Number(learnerId))), eq(lessons.status, "ACTIVE")))
          .orderBy(desc(lessons.createdAt))
          .limit(1);
        const lessonList = Array.isArray(result) ? result : [result];
        if (lessonList.length > 0) {
          return lessonList[0] as Lesson;
        }
      } catch (e) {
        // Fall back to basic query below
      }

      // Fallback to a more specific query to avoid "column does not exist" errors
      const result = await db
        .select({
          id: lessons.id,
          learnerId: lessons.learnerId,
          moduleId: lessons.moduleId,
          status: lessons.status,
          spec: lessons.spec,
          score: lessons.score,
          createdAt: lessons.createdAt,
          completedAt: lessons.completedAt,
        })
        .from(lessons)
        .where(and(eq(lessons.learnerId, Number(Number(learnerId))), eq(lessons.status, "ACTIVE")))
        .orderBy(desc(lessons.createdAt))
        .limit(1);

      const lessonList = Array.isArray(result) ? result : [result];

      if (lessonList.length > 0) {
        // Return a lesson with default values for potentially missing columns
        const baseLesson = lessonList[0];
        const fullLesson = {
          ...baseLesson,
          enhancedSpec: null,
          subject: null,
          category: null,
          difficulty: 'beginner' as const,
          imagePaths: null
        };
        return fullLesson as Lesson;
      }

      return undefined;
    } catch (error) {
      // Log the error but don't crash
      console.error("Error in getActiveLesson:", error);
      return undefined;
    }
  }

  async getLearnerLessons(learnerId: string | number): Promise<Lesson[]> {
    try {
      const learnerIdNum = typeof learnerId === 'string' ? parseInt(learnerId) : learnerId;
      if (isNaN(learnerIdNum)) {
        console.error(`Invalid learner ID: ${learnerId}`);
        return [];
      }

      // Get all lessons for a learner (used for determining previous lesson subjects)
      const result = await db
        .select()
        .from(lessons)
        .where(eq(lessons.learnerId, Number(Number(learnerIdNum))))
        .orderBy(desc(lessons.createdAt));

      return Array.isArray(result) ? result.map(lesson => lesson as Lesson) : [result as Lesson];
    } catch (error) {
      console.error('Error in getLearnerLessons:', error);
      return [];
    }
  }

  async getLessonHistory(learnerId: string | number | number | number | number | number | number | number | number | number | number | number | number | number | number, limit: number = 10): Promise<Lesson[]> {
    try {
      // Try to get the full lesson history first
      try {
        const result = await db
          .select()
          .from(lessons)
          .where(eq(lessons.learnerId, Number(Number(learnerId))))
          .orderBy(desc(lessons.createdAt))
          .limit(limit);
        return Array.isArray(result) ? result.map(lesson => lesson as Lesson) : [result as Lesson];
      } catch (e) {
        // Fall back to basic query below
      }

      // Fallback to a more specific query to avoid "column does not exist" errors
      const result = await db
        .select({
          id: lessons.id,
          learnerId: lessons.learnerId,
          moduleId: lessons.moduleId,
          status: lessons.status,
          subject: lessons.subject,
          category: lessons.category,
          difficulty: lessons.difficulty,
          spec: lessons.spec,
          enhancedSpec: lessons.enhancedSpec,
          imagePaths: lessons.imagePaths,
          score: lessons.score,
          createdAt: lessons.createdAt,
          completedAt: lessons.completedAt,
        })
        .from(lessons)
        .where(eq(lessons.learnerId, Number(Number(learnerId))))
        .orderBy(desc(lessons.createdAt))
        .limit(limit);

      // Add default values for potentially missing columns
      return result.map(baseLesson => ({
        ...baseLesson,
        enhancedSpec: baseLesson.enhancedSpec || null,
        subject: baseLesson.subject || null,
        category: baseLesson.category || null,
        difficulty: baseLesson.difficulty || 'beginner' as const,
        imagePaths: baseLesson.imagePaths || null
      })) as Lesson[];
    } catch (error) {
      console.error('Error in getLessonHistory:', error);
      return [];
    }
  }

  async updateLessonStatus(id: string, status: "QUEUED" | "ACTIVE" | "DONE", score?: number): Promise<Lesson | undefined> {
    try {
      const updateData: Partial<InsertLesson> = { status };

      if (status === "DONE" && score !== undefined) {
        updateData.score = score;
        updateData.completedAt = new Date();
      }

      // Try to update only the specific fields we know exist in the database
      try {
        const result = await db
          .update(lessons)
          .set(updateData)
          .where(eq(lessons.id, id))
          .returning({
            id: lessons.id,
            learnerId: lessons.learnerId,
            moduleId: lessons.moduleId,
            status: lessons.status,
            spec: lessons.spec,
            score: lessons.score,
            createdAt: lessons.createdAt,
            completedAt: lessons.completedAt,
          });

        const lessonList = Array.isArray(result) ? result : [result];

        if (lessonList.length > 0) {
          // Return a lesson with default values for potentially missing columns
          const baseLesson = lessonList[0];
          const fullLesson = {
            ...baseLesson,
            enhancedSpec: null,
            subject: null,
            category: null,
            difficulty: 'beginner' as const,
            imagePaths: null
          };
          return fullLesson as Lesson;
        }
      } catch (e) {
        console.error('Error updating lesson status with full returning:', e);

        // Fallback: Update without returning all fields
        await db
          .update(lessons)
          .set(updateData)
          .where(eq(lessons.id, id));

        // Fetch the updated lesson separately
        return this.getLessonById(id);
      }

      return undefined;
    } catch (error) {
      console.error('Error in updateLessonStatus:', error);
      return undefined;
    }
  }

  async updateLessonImages(id: string, enhancedSpec: any, imagePaths: any): Promise<void> {
    try {
      await db
        .update(lessons)
        .set({ enhancedSpec, imagePaths })
        .where(eq(lessons.id, id));
    } catch (error) {
      console.error('Error in updateLessonImages:', error);
    }
  }

  // Achievement operations
  async createAchievement(achievement: InsertAchievement): Promise<Achievement> {
    // Make sure we have a UUID for the id field to prevent not-null constraint violations
    const achievementWithId = {
      ...achievement,
      id: crypto.randomUUID()
    };

    const result = await db.insert(achievements).values(achievementWithId).returning();
    const newAchievement = Array.isArray(result) ? result[0] : result;
    return newAchievement as Achievement;
  }

  async getAchievements(learnerId: string | number): Promise<Achievement[]> {
    const result = await db
      .select()
      .from(achievements)
      .where(eq(achievements.learnerId, learnerId.toString()))
      .orderBy(desc(achievements.awardedAt));
    return Array.isArray(result) ? result.map(achievement => achievement as Achievement) : [result as Achievement];
  }

  // Database sync operations
  async getSyncConfigsByParentId(parentId: string): Promise<DbSyncConfig[]> {
    const result = await db
      .select()
      .from(dbSyncConfigs)
      .where(eq(dbSyncConfigs.parentId, parentId.toString()));
    return Array.isArray(result) ? result.map(config => config as DbSyncConfig) : [result as DbSyncConfig];
  }

  async getSyncConfigById(id: string): Promise<DbSyncConfig | undefined> {
    const result = await db
      .select()
      .from(dbSyncConfigs)
      .where(eq(dbSyncConfigs.id, id));
    const configs = Array.isArray(result) ? result : [result];
    return configs.length > 0 ? configs[0] as DbSyncConfig : undefined;
  }

  async createSyncConfig(config: InsertDbSyncConfig): Promise<DbSyncConfig> {
    const result = await db
      .insert(dbSyncConfigs)
      .values(config)
      .returning();
    const configs = Array.isArray(result) ? result : [result];
    return configs[0] as DbSyncConfig;
  }

  async updateSyncConfig(id: string, data: Partial<InsertDbSyncConfig>): Promise<DbSyncConfig | undefined> {
    const result = await db
      .update(dbSyncConfigs)
      .set({ 
        ...data, 
        updatedAt: new Date() 
      })
      .where(eq(dbSyncConfigs.id, id))
      .returning();

    const configs = Array.isArray(result) ? result : [result];
    return configs.length > 0 ? configs[0] as DbSyncConfig : undefined;
  }

  async deleteSyncConfig(id: string): Promise<boolean> {
    const result = await db
      .delete(dbSyncConfigs)
      .where(eq(dbSyncConfigs.id, id))
      .returning();
    const configs = Array.isArray(result) ? result : [result];
    return configs.length > 0;
  }

  async updateSyncStatus(id: string, status: "IDLE" | "IN_PROGRESS" | "FAILED" | "COMPLETED", errorMessage?: string): Promise<DbSyncConfig | undefined> {
    let updateData: Partial<InsertDbSyncConfig> = { 
      syncStatus: status,
      updatedAt: new Date()
    };

    // Set lastSyncAt when job completes
    if (status === 'COMPLETED') {
      updateData.lastSyncAt = new Date();
    }

    // Set errorMessage when job fails
    if (status === 'FAILED' && errorMessage) {
      updateData.errorMessage = errorMessage;
    }

    const result = await db
      .update(dbSyncConfigs)
      .set(updateData)
      .where(eq(dbSyncConfigs.id, id))
      .returning();

    const configs = Array.isArray(result) ? result : [result];
    return configs.length > 0 ? configs[0] as DbSyncConfig : undefined;
  }

  // Delete a user and all associated data
  async deleteUser(id: string): Promise<boolean> {
    try {
      // First, check if this is a learner and delete their profile if it exists
      const user = await this.getUser(id);
      if (!user) return false;

      if (user.role === "LEARNER") {
        // Delete the learner profile if it exists
        const profile = await this.getLearnerProfile(id);
        if (profile) {
          await db.delete(learnerProfiles).where(eq(learnerProfiles.userId, Number(Number(id))));
        }

        // Delete any lessons associated with this learner
        await db.delete(lessons).where(eq(lessons.learnerId, Number(Number(id))));

        // Delete any achievements associated with this learner
        await db.delete(achievements).where(eq(achievements.learnerId, id.toString()));
      }

      // Now delete the user
      try {
        const result = await db.delete(users).where(eq(users.id, id));
        return true; // If we get here without error, the deletion was successful
      } catch {
        return false;
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      return false;
    }
  }
}

export const storage = new DatabaseStorage();

// Helper function to convert userId to number, returns -1 if invalid
function toNumber(userId: string | number | null | undefined): number {
  if (userId === null || userId === undefined) {
    return -1;
  }

  const userIdNum = typeof userId === 'string' ? parseInt(userId) : userId;

  if (isNaN(userIdNum)) {
    return -1;
  }

  return userIdNum;
}