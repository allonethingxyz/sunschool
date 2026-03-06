import { relations } from "drizzle-orm";
import { 
  integer, pgEnum, pgTable, serial, text, timestamp, uuid, json, boolean, 
  varchar, jsonb, index 
} from "drizzle-orm/pg-core";

// Enums
export const userRoleEnum = pgEnum("user_role", ["ADMIN", "PARENT", "LEARNER"]);
export const lessonStatusEnum = pgEnum("lesson_status", ["QUEUED", "ACTIVE", "DONE"]);
export const syncStatusEnum = pgEnum("sync_status", ["IDLE", "IN_PROGRESS", "FAILED", "COMPLETED"]);

// Session storage table.
// This table is mandatory for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(), // Store ID as integer with auto-increment
  email: varchar("email").unique(),
  username: text("username").unique(),
  name: text("name"),
  role: userRoleEnum("role").default("LEARNER"),
  password: text("password"), // For non-Replit auth users
  parentId: integer("parent_id").references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  parent: one(users, {
    fields: [users.parentId],
    references: [users.id],
  }),
  children: many(users),
  learnerProfile: one(learnerProfiles, {
    fields: [users.id],
    references: [learnerProfiles.userId],
  }),
  achievements: many(achievements),
  lessons: many(lessons),
}));

// Learner Profiles table
export const learnerProfiles = pgTable("learner_profiles", {
  id: text("id").primaryKey().notNull(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  gradeLevel: integer("grade_level").notNull(),
  graph: json("graph").$type<{ nodes: any[], edges: any[] }>(),
  subjects: json("subjects").$type<string[]>().default(['Math', 'Science']),
  subjectPerformance: json("subject_performance").$type<Record<string, {
    score: number,
    lessonCount: number,
    lastAttempted: string,
    masteryLevel: 'beginner' | 'intermediate' | 'advanced'
  }>>().default({}),
  recommendedSubjects: json("recommended_subjects").$type<string[]>().default([]),
  strugglingAreas: json("struggling_areas").$type<string[]>().default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const learnerProfilesRelations = relations(learnerProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [learnerProfiles.userId],
    references: [users.id],
  }),
  lessons: many(lessons),
  achievements: many(achievements),
}));

// Define image type
export type LessonImage = {
  id: string;
  description: string;
  alt: string;
  base64Data?: string;
  svgData?: string;
  promptUsed: string;
  path?: string; // Local filesystem path for persistent storage
};

// Define diagram type
export type LessonDiagram = {
  id: string;
  type: "flowchart" | "comparison" | "process" | "cycle" | "hierarchy";
  title: string;
  svgData: string;
  description: string;
};

// Define section type
export type LessonSection = {
  title: string;
  content: string;
  type: "introduction" | "key_concepts" | "examples" | "practice" | "summary" | "fun_facts";
  imageIds?: string[];
  imageDescription?: string;
};

// Define enhanced lesson spec type
export type EnhancedLessonSpec = {
  title: string;
  targetGradeLevel: number;
  subtitle?: string;
  summary: string;
  sections: LessonSection[];
  featuredImage?: string;
  images: LessonImage[];
  diagrams: LessonDiagram[];
  questions: {
    text: string;
    options: string[];
    /** Parallel array of SVG markup strings for visual answer options (same length as options) */
    optionSvgs?: string[];
    correctIndex: number;
    explanation: string;
    difficulty?: "easy" | "medium" | "hard";
    type?: "multiple_choice" | "true_false" | "image_based" | "sequence";
    /** ID of a LessonImage to show above the question stem */
    imageId?: string;
    /** Inline SVG to show above the question stem (alternative to imageId) */
    imageSvg?: string;
  }[];
  graph?: {
    nodes: {
      id: string;
      label: string;
      category?: string;
      importance?: number;
    }[];
    edges: {
      source: string;
      target: string;
      label?: string;
      strength?: number;
    }[];
  };
  keywords: string[];
  relatedTopics: string[];
  estimatedDuration: number;
  difficultyLevel: "beginner" | "intermediate" | "advanced";
};

// Lessons table
export const lessons = pgTable("lessons", {
  id: text("id").primaryKey().notNull(),
  learnerId: integer("learner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  moduleId: text("module_id").notNull(),
  status: lessonStatusEnum("status").notNull().default("QUEUED"),
  subject: text("subject"),
  category: text("category"),
  difficulty: text("difficulty", { enum: ["beginner", "intermediate", "advanced"] }).default("beginner"),
  imagePaths: json("image_paths").$type<{
    path: string;
    alt: string;
    description: string;
  }[]>(),
  spec: json("spec").$type<{
    title: string;
    content: string;
    questions: {
      text: string;
      options: string[];
      correctIndex: number;
      explanation: string;
    }[];
    graph?: {
      nodes: {
        id: string;
        label: string;
      }[];
      edges: {
        source: string;
        target: string;
      }[];
    };
  }>(),
  enhancedSpec: json("enhanced_spec").$type<EnhancedLessonSpec>(),
  score: integer("score"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const lessonsRelations = relations(lessons, ({ one }) => ({
  learner: one(users, {
    fields: [lessons.learnerId],
    references: [users.id],
  }),
}));

// Achievements table
export const achievements = pgTable("achievements", {
  id: uuid("id").defaultRandom().primaryKey(),
  learnerId: varchar("learner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  payload: json("payload").$type<{
    title: string;
    description: string;
    icon: string;
  }>(),
  awardedAt: timestamp("awarded_at").defaultNow(),
});

export const achievementsRelations = relations(achievements, ({ one }) => ({
  learner: one(users, {
    fields: [achievements.learnerId],
    references: [users.id],
  }),
}));

// Database Sync Configurations table
export const dbSyncConfigs = pgTable("db_sync_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  parentId: varchar("parent_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  targetDbUrl: text("target_db_url").notNull(),
  lastSyncAt: timestamp("last_sync_at"),
  syncStatus: syncStatusEnum("sync_status").notNull().default("IDLE"),
  continuousSync: boolean("continuous_sync").notNull().default(false),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const dbSyncConfigsRelations = relations(dbSyncConfigs, ({ one }) => ({
  parent: one(users, {
    fields: [dbSyncConfigs.parentId],
    references: [users.id],
  }),
}));

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type LearnerProfile = typeof learnerProfiles.$inferSelect;
export type InsertLearnerProfile = typeof learnerProfiles.$inferInsert;

export type Lesson = typeof lessons.$inferSelect;
export type InsertLesson = typeof lessons.$inferInsert;

export type Achievement = typeof achievements.$inferSelect;
export type InsertAchievement = typeof achievements.$inferInsert;

export type DbSyncConfig = typeof dbSyncConfigs.$inferSelect;
export type InsertDbSyncConfig = typeof dbSyncConfigs.$inferInsert;

// Quiz Answers table (for individual answer tracking)
export const quizAnswers = pgTable("quiz_answers", {
  id: uuid("id").defaultRandom().primaryKey(),
  learnerId: integer("learner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  lessonId: text("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
  questionIndex: integer("question_index").notNull(),
  questionText: text("question_text").notNull(),
  questionHash: varchar("question_hash", { length: 64 }).notNull(),
  userAnswer: integer("user_answer").notNull(),
  correctAnswer: integer("correct_answer").notNull(),
  isCorrect: boolean("is_correct").notNull(),
  conceptTags: text("concept_tags").array(),
  answeredAt: timestamp("answered_at").defaultNow(),
}, (table) => [
  index("idx_learner_answers").on(table.learnerId, table.answeredAt),
  index("idx_lesson_answers").on(table.lessonId),
  index("idx_question_hash").on(table.questionHash),
]);

export const quizAnswersRelations = relations(quizAnswers, ({ one }) => ({
  learner: one(users, {
    fields: [quizAnswers.learnerId],
    references: [users.id],
  }),
  lesson: one(lessons, {
    fields: [quizAnswers.lessonId],
    references: [lessons.id],
  }),
}));

// Concept Mastery table (for tracking mastery levels)
export const conceptMastery = pgTable("concept_mastery", {
  id: uuid("id").defaultRandom().primaryKey(),
  learnerId: integer("learner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conceptName: text("concept_name").notNull(),
  subject: text("subject").notNull(),
  correctCount: integer("correct_count").notNull().default(0),
  totalCount: integer("total_count").notNull().default(0),
  masteryLevel: integer("mastery_level").notNull().default(0), // Store as integer (0-100) for precision
  lastTested: timestamp("last_tested").defaultNow(),
  needsReinforcement: boolean("needs_reinforcement").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_learner_mastery").on(table.learnerId, table.subject),
  index("idx_needs_reinforcement").on(table.learnerId, table.needsReinforcement),
]);

export const conceptMasteryRelations = relations(conceptMastery, ({ one }) => ({
  learner: one(users, {
    fields: [conceptMastery.learnerId],
    references: [users.id],
  }),
}));

// Types for new tables
export type QuizAnswer = typeof quizAnswers.$inferSelect;
export type InsertQuizAnswer = typeof quizAnswers.$inferInsert;

export type ConceptMastery = typeof conceptMastery.$inferSelect;
export type InsertConceptMastery = typeof conceptMastery.$inferInsert;

// ─────────────────────────────────────────────────────────────────────────────
// Rewards system TypeScript types (tables managed via raw SQL migrations)
// ─────────────────────────────────────────────────────────────────────────────

export type Reward = {
  id: string;
  parentId: number;
  title: string;
  description: string | null;
  tokenCost: number;
  category: string;
  isActive: boolean;
  maxRedemptions: number | null;
  currentRedemptions: number;
  imageEmoji: string;
  color: string;
  createdAt: string;
  updatedAt: string;
};

export type InsertReward = Omit<Reward, 'id' | 'currentRedemptions' | 'createdAt' | 'updatedAt'>;

export type RewardGoalSavings = {
  id: string;
  learnerId: number;
  rewardId: string;
  savedPoints: number;
  createdAt: string;
  updatedAt: string;
};

export type RewardRedemption = {
  id: string;
  learnerId: number;
  rewardId: string;
  tokensSpent: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  timesRedeemed: number;
  requestedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  completedAt: string | null;
  parentNotes: string | null;
  learnerNotes: string | null;
};

export type LearningGoal = {
  id: string;
  learnerId: number;
  parentId: number;
  title: string;
  description: string | null;
  subject: string | null;
  targetType: string;
  targetValue: number;
  currentValue: number;
  isCompleted: boolean;
  deadline: string | null;
  tokenReward: number;
  createdAt: string;
  completedAt: string | null;
};

/** Points ledger source types including new ones */
export type PointsSourceType =
  | 'QUIZ_CORRECT'
  | 'LESSON_COMPLETE'
  | 'ACHIEVEMENT'
  | 'REDEMPTION'
  | 'ADMIN_ADJUST'
  | 'DOUBLE_OR_LOSS_DEDUCTION'
  | 'GOAL_DELEGATION';

export type PointsLedgerEntry = {
  id: string;
  learnerId: number;
  amount: number;
  sourceType: PointsSourceType;
  sourceId: string | null;
  description: string;
  createdAt: string;
};
