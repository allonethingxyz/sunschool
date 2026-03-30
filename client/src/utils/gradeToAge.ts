/**
 * Maps a grade level (0 = Kindergarten, 1-12) to its typical age range string.
 * Returns an empty string for unrecognised grades.
 */
export function gradeToAge(grade: number | string): string {
  const map: Record<string, string> = {
    '0': '5-6', '1': '6-7', '2': '7-8', '3': '8-9', '4': '9-10',
    '5': '10-11', '6': '11-12', '7': '12-13', '8': '13-14',
    '9': '14-15', '10': '15-16', '11': '16-17', '12': '17-18',
  };
  return map[String(grade)] || '';
}
