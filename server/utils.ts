import { Lesson } from "../shared/schema";

/**
 * Generate a cryptographically-strong random hash of the given length.  This is
 * used for public share-links etc.
 */
export function generateRandomHash(length: number = 24): string {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const array = new Uint32Array(length);
  // Use crypto if available (Node 19+, browsers) otherwise Math.random fallback.
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
      result += characters[array[i] % characters.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
  }
  return result;
}

// Function to check if an achievement should be awarded
export function checkForAchievements(lessonHistory: Lesson[], completedLesson?: Lesson) {
  const achievements: {
    type: string;
    payload: {
      title: string;
      description: string;
      icon: string;
    };
  }[] = [];
  
  // First lesson completed
  if (lessonHistory.filter(l => l.status === "DONE").length === 1) {
    achievements.push({
      type: "FIRST_LESSON",
      payload: {
        title: "First Steps",
        description: "Completed your very first lesson!",
        icon: "award"
      }
    });
  }
  
  // 5 lessons completed
  if (lessonHistory.filter(l => l.status === "DONE").length === 5) {
    achievements.push({
      type: "FIVE_LESSONS",
      payload: {
        title: "Learning Explorer",
        description: "Completed 5 lessons!",
        icon: "book-open"
      }
    });
  }
  
  // Perfect score on a quiz
  if (completedLesson && completedLesson.score === 100) {
    achievements.push({
      type: "PERFECT_SCORE",
      payload: {
        title: "Perfect Score!",
        description: "Got all answers correct in a quiz!",
        icon: "star"
      }
    });
  }
  
  return achievements;
}
