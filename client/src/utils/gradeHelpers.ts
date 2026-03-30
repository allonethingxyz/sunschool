/**
 * Grade utility functions for displaying grade information
 */

/**
 * Convert grade level to typical age range
 * @param grade - Grade level (0 for Kindergarten, 1-12 for grades)
 * @returns Age range string (e.g., "5-6 yrs")
 */
export function gradeToAge(grade: number): string {
  const ageMap: Record<number, string> = {
    0: '5-6 yrs',   // Kindergarten
    1: '6-7 yrs',   // Grade 1
    2: '7-8 yrs',   // Grade 2
    3: '8-9 yrs',   // Grade 3
    4: '9-10 yrs',  // Grade 4
    5: '10-11 yrs', // Grade 5
    6: '11-12 yrs', // Grade 6
    7: '12-13 yrs', // Grade 7
    8: '13-14 yrs', // Grade 8
    9: '14-15 yrs', // Grade 9
    10: '15-16 yrs', // Grade 10
    11: '16-17 yrs', // Grade 11
    12: '17-18 yrs', // Grade 12
  };

  return ageMap[grade] || `${grade + 5}-${grade + 6} yrs`;
}

/**
 * Get display text for grade level
 * @param gradeLevel - Grade level number
 * @returns Display string (e.g., "Kindergarten" or "Grade 3")
 */
export function getGradeDisplayText(gradeLevel: number): string {
  if (gradeLevel === 0) return 'Kindergarten';
  return `Grade ${gradeLevel}`;
}

/**
 * Get display text for grade level with age context (for parent-facing views)
 * @param gradeLevel - Grade level number
 * @returns Display string with age (e.g., "Kindergarten (5-6 yrs)" or "Grade 3 (8-9 yrs)")
 */
export function getGradeDisplayTextWithAge(gradeLevel: number): string {
  const gradeText = getGradeDisplayText(gradeLevel);
  const ageText = gradeToAge(gradeLevel);
  return `${gradeText} (${ageText})`;
}
