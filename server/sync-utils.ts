import { Pool, Client } from 'pg';
import { storage } from './storage';
import { DbSyncConfig, User, LearnerProfile, Lesson, Achievement, dbSyncConfigs } from '../shared/schema';
import { db } from './db';
import { eq } from 'drizzle-orm';

/**
 * Synchronize a parent's data to an external database
 * This performs a one-way replication of the parent's data to the target database
 */
export async function synchronizeToExternalDatabase(parentId: string, syncConfig: DbSyncConfig): Promise<void> {
  // Create a client to connect to the target database
  const targetClient = new Client({
    connectionString: syncConfig.targetDbUrl
  });

  try {
    // Connect to the target database
    await targetClient.connect();

    // Start a transaction
    await targetClient.query('BEGIN');
    
    // Get all the parent's data to sync
    const [parent, children, profiles, allLessons, allAchievements] = await Promise.all([
      // Get the parent user
      storage.getUser(parentId),
      // Get all child users (learners) of this parent
      storage.getUsersByParentId(parentId),
      // We'll get all profiles in a separate step and filter them
      Promise.resolve<LearnerProfile[]>([]),
      // We'll get all lessons in a separate step and filter them
      Promise.resolve<Lesson[]>([]),
      // We'll get all achievements in a separate step and filter them
      Promise.resolve<Achievement[]>([])
    ]);
    
    if (!parent) {
      throw new Error(`Parent with ID ${parentId} not found`);
    }
    
    // Get all child IDs
    const childIds = children.map(child => child.id);
    
    // If there are children, get their profiles, lessons, and achievements
    if (childIds.length > 0) {
      // Get learner profiles for all children
      const profilePromises = childIds.map(id => storage.getLearnerProfile(id));
      const resolvedProfiles = await Promise.all(profilePromises);
      const validProfiles = resolvedProfiles.filter((profile): profile is LearnerProfile => profile !== undefined);
      
      // Get lessons for all children
      const lessonPromises = childIds.map(id => storage.getLessonHistory(id, 1000)); // Get up to 1000 lessons per child
      const lessonArrays = await Promise.all(lessonPromises);
      const allLessonsTemp = lessonArrays.flat();
      
      // Get achievements for all children
      const achievementPromises = childIds.map(id => storage.getAchievements(id));
      const achievementArrays = await Promise.all(achievementPromises);
      const allAchievementsTemp = achievementArrays.flat();
      
      // Update the resolved collections
      profiles.push(...validProfiles);
      allLessons.push(...allLessonsTemp);
      allAchievements.push(...allAchievementsTemp);
    }
    
    // Clear target tables and recreate schema if needed
    await createOrUpdateSchema(targetClient);
    
    // Insert parent first (with parentId set to null to avoid circular references)
    const parentCopy = { ...parent, parentId: null, password: parent.password };
    await insertOrUpdateUser(targetClient, parentCopy);
    
    // Insert all children
    for (const child of children) {
      await insertOrUpdateUser(targetClient, child);
    }
    
    // Insert all learner profiles
    for (const profile of profiles) {
      await insertOrUpdateLearnerProfile(targetClient, profile);
    }
    
    // Insert all lessons
    for (const lesson of allLessons) {
      await insertOrUpdateLesson(targetClient, lesson);
    }
    
    // Insert all achievements
    for (const achievement of allAchievements) {
      await insertOrUpdateAchievement(targetClient, achievement);
    }
    
    // Commit the transaction
    await targetClient.query('COMMIT');

    // Update the sync status to COMPLETED using the storage API
    try {
      const updatedConfig = await storage.updateSyncStatus(syncConfig.id, 'COMPLETED');

      if (!updatedConfig) {
        // Retry using direct query as a backup approach
        const checkConfig = await db.query.dbSyncConfigs.findFirst({
          where: eq(dbSyncConfigs.id, syncConfig.id)
        });

        if (checkConfig) {
          await db.update(dbSyncConfigs)
            .set({
              syncStatus: 'COMPLETED',
              lastSyncAt: new Date(),
              updatedAt: new Date()
            })
            .where(eq(dbSyncConfigs.id, syncConfig.id))
            .returning();
        }
      }
    } catch (updateError) {
      console.error('Error updating sync status:', updateError);
    }
    
  } catch (error) {
    // Rollback the transaction if there was an error
    try {
      await targetClient.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error rolling back transaction:', rollbackError);
    }
    
    // Update the sync status to FAILED using the storage API
    try {
      const updatedConfig = await storage.updateSyncStatus(
        syncConfig.id,
        'FAILED',
        error.message || 'Synchronization failed'
      );

      if (!updatedConfig) {
        // Retry using direct query as a backup approach
        const checkConfig = await db.query.dbSyncConfigs.findFirst({
          where: eq(dbSyncConfigs.id, syncConfig.id)
        });

        if (checkConfig) {
          await db.update(dbSyncConfigs)
            .set({
              syncStatus: 'FAILED',
              lastSyncAt: new Date(),
              errorMessage: error.message || 'Synchronization failed',
              updatedAt: new Date()
            })
            .where(eq(dbSyncConfigs.id, syncConfig.id))
            .returning();
        }
      }
    } catch (updateError) {
      console.error('Error updating sync failure status:', updateError);
    }
    
    console.error('Error synchronizing data:', error);
    throw error;
  } finally {
    // Close the connection
    try {
      await targetClient.end();
    } catch (disconnectError) {
      console.error('Error disconnecting from target database:', disconnectError);
    }
  }
}

/**
 * Create or update the schema in the target database
 */
async function createOrUpdateSchema(client: Client): Promise<void> {
  try {
    // Create enums if they don't exist
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
          CREATE TYPE user_role AS ENUM ('ADMIN', 'PARENT', 'LEARNER');
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lesson_status') THEN
          CREATE TYPE lesson_status AS ENUM ('QUEUED', 'ACTIVE', 'DONE');
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sync_status') THEN
          CREATE TYPE sync_status AS ENUM ('IDLE', 'IN_PROGRESS', 'FAILED', 'COMPLETED');
        END IF;
      END
      $$;
    `);
    
    // Drop and recreate tables - WARNING: This will delete existing data!
    // Users table
    await client.query(`
      DROP TABLE IF EXISTS achievements CASCADE;
      DROP TABLE IF EXISTS lessons CASCADE;
      DROP TABLE IF EXISTS learner_profiles CASCADE;
      DROP TABLE IF EXISTS db_sync_configs CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role user_role NOT NULL,
        password TEXT NOT NULL,
        parent_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS learner_profiles (
        id UUID PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        grade_level INTEGER NOT NULL,
        graph JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS lessons (
        id UUID PRIMARY KEY,
        learner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module_id TEXT NOT NULL,
        status lesson_status NOT NULL DEFAULT 'QUEUED',
        spec JSONB,
        score INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS achievements (
        id UUID PRIMARY KEY,
        learner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        payload JSONB,
        awarded_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS db_sync_configs (
        id UUID PRIMARY KEY,
        parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_db_url TEXT NOT NULL,
        last_sync_at TIMESTAMP,
        sync_status sync_status NOT NULL DEFAULT 'IDLE',
        continuous_sync BOOLEAN NOT NULL DEFAULT FALSE,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
  } catch (error) {
    console.error('Error creating schema:', error);
    throw error;
  }
}

/**
 * Insert or update a user in the target database
 */
async function insertOrUpdateUser(client: Client, user: User): Promise<void> {
  try {
    // Use UPSERT (INSERT ... ON CONFLICT DO UPDATE)
    await client.query(`
      INSERT INTO users (id, email, username, name, role, password, parent_id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE
      SET email = $2, username = $3, name = $4, role = $5, password = $6, parent_id = $7, created_at = $8
    `, [
      user.id, 
      user.email, 
      user.username, 
      user.name, 
      user.role, 
      user.password, 
      user.parentId, 
      user.createdAt || new Date()
    ]);
  } catch (error) {
    console.error(`Error inserting/updating user ${user.id}:`, error);
    throw error;
  }
}

/**
 * Insert or update a learner profile in the target database
 */
async function insertOrUpdateLearnerProfile(client: Client, profile: LearnerProfile): Promise<void> {
  try {
    await client.query(`
      INSERT INTO learner_profiles (id, user_id, grade_level, graph, created_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE
      SET user_id = $2, grade_level = $3, graph = $4, created_at = $5
    `, [
      profile.id,
      profile.userId,
      profile.gradeLevel,
      profile.graph || null,
      profile.createdAt || new Date()
    ]);
  } catch (error) {
    console.error(`Error inserting/updating learner profile ${profile.id}:`, error);
    throw error;
  }
}

/**
 * Insert or update a lesson in the target database
 */
async function insertOrUpdateLesson(client: Client, lesson: Lesson): Promise<void> {
  try {
    await client.query(`
      INSERT INTO lessons (id, learner_id, module_id, status, spec, score, created_at, completed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE
      SET learner_id = $2, module_id = $3, status = $4, spec = $5, score = $6, created_at = $7, completed_at = $8
    `, [
      lesson.id,
      lesson.learnerId,
      lesson.moduleId,
      lesson.status,
      lesson.spec || null,
      lesson.score || null,
      lesson.createdAt || new Date(),
      lesson.completedAt || null
    ]);
  } catch (error) {
    console.error(`Error inserting/updating lesson ${lesson.id}:`, error);
    throw error;
  }
}

/**
 * Insert or update an achievement in the target database
 */
async function insertOrUpdateAchievement(client: Client, achievement: Achievement): Promise<void> {
  try {
    await client.query(`
      INSERT INTO achievements (id, learner_id, type, payload, awarded_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE
      SET learner_id = $2, type = $3, payload = $4, awarded_at = $5
    `, [
      achievement.id,
      achievement.learnerId,
      achievement.type,
      achievement.payload || null,
      achievement.awardedAt || new Date()
    ]);
  } catch (error) {
    console.error(`Error inserting/updating achievement ${achievement.id}:`, error);
    throw error;
  }
}