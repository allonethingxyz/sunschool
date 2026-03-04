import { LearnerProfile, Lesson } from '../../shared/schema';

// Common education subjects by grade level
export const gradeSubjects: Record<number, string[]> = {
  0: ['Alphabet', 'Numbers', 'Colors', 'Shapes', 'Basic Vocabulary', 'Social Skills'],
  1: ['Reading', 'Writing', 'Basic Math', 'Science', 'Art', 'Social Studies'],
  2: ['Reading', 'Writing', 'Math', 'Science', 'Art', 'Social Studies', 'Health'],
  3: ['Reading', 'Writing', 'Math', 'Science', 'Social Studies', 'Art', 'Health', 'Geography'],
  4: ['Reading', 'Writing', 'Math', 'Science', 'Social Studies', 'Geography', 'Art', 'Music'],
  5: ['Reading', 'Literature', 'Writing', 'Math', 'Science', 'History', 'Geography', 'Art'],
  6: ['Literature', 'Writing', 'Pre-Algebra', 'Earth Science', 'World History', 'Geography', 'Art', 'Music'],
  7: ['Literature', 'Writing', 'Algebra', 'Life Science', 'History', 'Geography', 'Foreign Language', 'Technology'],
  8: ['Literature', 'Writing', 'Algebra', 'Physical Science', 'History', 'Civics', 'Foreign Language', 'Technology'],
  9: ['Literature', 'Composition', 'Geometry', 'Biology', 'World History', 'Foreign Language', 'Health', 'Electives'],
  10: ['Literature', 'Composition', 'Algebra II', 'Chemistry', 'History', 'Foreign Language', 'Physical Education', 'Electives'],
  11: ['American Literature', 'Composition', 'Precalculus', 'Physics', 'US History', 'Foreign Language', 'Electives'],
  12: ['British Literature', 'Research Writing', 'Calculus', 'Advanced Science', 'Government', 'Economics', 'Electives']
};

// Subject categories that group similar subjects
export const subjectCategories: Record<string, string[]> = {
  'Language Arts': ['Reading', 'Writing', 'Literature', 'Composition', 'American Literature', 'British Literature', 'Research Writing', 'Alphabet', 'Basic Vocabulary'],
  'Mathematics': ['Numbers', 'Basic Math', 'Math', 'Pre-Algebra', 'Algebra', 'Geometry', 'Algebra II', 'Precalculus', 'Calculus'],
  'Science': ['Science', 'Earth Science', 'Life Science', 'Physical Science', 'Biology', 'Chemistry', 'Physics', 'Advanced Science'],
  'Social Studies': ['Social Studies', 'History', 'World History', 'US History', 'Government', 'Economics', 'Civics', 'Geography'],
  'Arts': ['Art', 'Music', 'Drama', 'Painting', 'Drawing'],
  'Life Skills': ['Health', 'Physical Education', 'Social Skills', 'Financial Literacy', 'Career Preparation'],
  'World Languages': ['Foreign Language', 'Spanish', 'French', 'German', 'Mandarin', 'Latin'],
  'Technology': ['Technology', 'Computer Science', 'Programming', 'Digital Media', 'Robotics']
};

// Mapping of subjects to categories for reverse lookup
const subjectToCategoryMap: Record<string, string> = {};

// Initialize the subject-to-category map
for (const [category, subjects] of Object.entries(subjectCategories)) {
  for (const subject of subjects) {
    subjectToCategoryMap[subject] = category;
  }
}

/**
 * Get the category for a subject
 * @param subject The subject name
 * @returns The category name or 'Other' if not found
 */
export function getSubjectCategory(subject: string): string {
  return subjectToCategoryMap[subject] || 'Other';
}

/**
 * Get appropriate subjects for a grade level
 * @param gradeLevel The grade level
 * @returns Array of appropriate subjects
 */
export function getSubjectsForGradeLevel(gradeLevel: number): string[] {
  // Ensure valid grade level (0 = Kindergarten, 1-12 = grades 1-12)
  const safeGradeLevel = (gradeLevel >= 0 && gradeLevel <= 12) ? gradeLevel : 5;
  return gradeSubjects[safeGradeLevel] || gradeSubjects[5]; // Default to grade 5 if not found
}

/**
 * Get all available subject categories
 * @returns Array of category names
 */
export function getAllCategories(): string[] {
  return Object.keys(subjectCategories);
}

/**
 * Get subjects for a specific category
 * @param category The category name
 * @returns Array of subjects in the category
 */
export function getSubjectsForCategory(category: string): string[] {
  return subjectCategories[category] || [];
}

/**
 * Analyze lesson performance to identify struggling areas
 * @param lessonHistory Past lessons for the learner
 * @returns Subject areas where the learner is struggling
 */
export function identifyStrugglingAreas(lessonHistory: Lesson[]): string[] {
  const subjectScores: Record<string, { total: number, count: number }> = {};
  
  // Only consider completed lessons with scores
  const completedLessons = lessonHistory.filter(
    lesson => lesson.status === 'DONE' && lesson.score !== null
  );
  
  // Group scores by subject
  for (const lesson of completedLessons) {
    // Skip if no subject or score
    if (!lesson.subject || lesson.score === null) continue;
    
    if (!subjectScores[lesson.subject]) {
      subjectScores[lesson.subject] = { total: 0, count: 0 };
    }
    
    subjectScores[lesson.subject].total += lesson.score;
    subjectScores[lesson.subject].count += 1;
  }
  
  // Find subjects with average score below 70%
  const strugglingSubjects = Object.entries(subjectScores)
    .filter(([_, stats]) => (stats.total / stats.count) < 70)
    .map(([subject, _]) => subject);
  
  return strugglingSubjects;
}

/**
 * Recommend new subjects based on learner profile and performance
 * @param profile Learner profile
 * @param lessonHistory Past lesson history
 * @returns Array of recommended subjects
 */
export function recommendSubjects(
  profile: LearnerProfile,
  lessonHistory: Lesson[]
): string[] {
  // Get appropriate subjects for the grade level
  const gradeAppropriate = getSubjectsForGradeLevel(profile.gradeLevel);
  
  // Get subjects the learner is currently using
  const currentSubjects = profile.subjects || [];
  
  // Get subjects the learner is struggling with
  const strugglingSubjects = identifyStrugglingAreas(lessonHistory);
  
  // Find subjects that are appropriate but not yet assigned
  const potentialNewSubjects = gradeAppropriate.filter(
    subject => !currentSubjects.includes(subject)
  );
  
  // Recommend up to 3 new subjects
  // Prioritize grade-appropriate subjects they haven't tried yet
  const recommendations = potentialNewSubjects.slice(0, 3);
  
  // Add struggling subjects to work on if there's room
  for (const subject of strugglingSubjects) {
    if (recommendations.length < 3 && !recommendations.includes(subject)) {
      recommendations.push(subject);
    }
  }
  
  return recommendations;
}

/**
 * Update the learner's subject performance based on a completed lesson
 * @param profile Learner profile
 * @param lesson The completed lesson
 * @returns Updated subject performance record
 */
export function updateSubjectPerformance(
  profile: LearnerProfile,
  lesson: Lesson
): Record<string, any> {
  // Skip if the lesson has no subject or score
  if (!lesson.subject || lesson.score === null) {
    return profile.subjectPerformance || {};
  }
  
  // Get current performance data or initialize if empty
  const performances = profile.subjectPerformance || {};
  
  // Get or initialize the performance for this subject
  const current = performances[lesson.subject] || {
    score: 0,
    lessonCount: 0,
    lastAttempted: new Date().toISOString(),
    masteryLevel: 'beginner' as 'beginner' | 'intermediate' | 'advanced'
  };
  
  // Update the performance with the new lesson
  const newLessonCount = current.lessonCount + 1;
  const newScore = Math.round(
    (current.score * current.lessonCount + lesson.score) / newLessonCount
  );
  
  // Determine mastery level based on average score and lesson count
  let masteryLevel: 'beginner' | 'intermediate' | 'advanced' = 'beginner';
  if (newScore >= 85 && newLessonCount >= 5) {
    masteryLevel = 'advanced';
  } else if (newScore >= 70 && newLessonCount >= 3) {
    masteryLevel = 'intermediate';
  }
  
  // Update the performance object
  performances[lesson.subject] = {
    score: newScore,
    lessonCount: newLessonCount,
    lastAttempted: new Date().toISOString(),
    masteryLevel
  };
  
  return performances;
}