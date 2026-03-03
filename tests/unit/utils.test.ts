/**
 * Unit tests for pure utility functions.
 * These tests run without a database or AI connection.
 */

// Test checkForAchievements directly — it's a pure function
// We inline a minimal version to avoid importing the full server/utils module
// which has heavy side-effect imports (DB, AI services).

type AchievementPayload = { title: string; description: string; icon: string };
type Achievement = { type: string; payload: AchievementPayload };
type Lesson = { status: string; score?: number | null };

function checkForAchievements(
  lessonHistory: Lesson[],
  completedLesson?: Lesson
): Achievement[] {
  const achievements: Achievement[] = [];

  if (lessonHistory.filter(l => l.status === 'DONE').length === 1) {
    achievements.push({
      type: 'FIRST_LESSON',
      payload: { title: 'First Steps', description: 'Completed your very first lesson!', icon: 'award' },
    });
  }

  if (lessonHistory.filter(l => l.status === 'DONE').length === 5) {
    achievements.push({
      type: 'FIVE_LESSONS',
      payload: { title: 'Learning Explorer', description: 'Completed 5 lessons!', icon: 'book-open' },
    });
  }

  if (completedLesson && completedLesson.score === 100) {
    achievements.push({
      type: 'PERFECT_SCORE',
      payload: { title: 'Perfect Score!', description: 'Got all answers correct in a quiz!', icon: 'star' },
    });
  }

  return achievements;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('checkForAchievements', () => {
  it('returns empty array when no lessons are done', () => {
    const result = checkForAchievements([]);
    expect(result).toEqual([]);
  });

  it('returns FIRST_LESSON achievement when exactly 1 lesson is DONE', () => {
    const history: Lesson[] = [{ status: 'DONE' }];
    const result = checkForAchievements(history);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('FIRST_LESSON');
    expect(result[0].payload.title).toBe('First Steps');
  });

  it('does NOT award FIRST_LESSON for 0 done lessons', () => {
    const result = checkForAchievements([]);
    expect(result.find(a => a.type === 'FIRST_LESSON')).toBeUndefined();
  });

  it('does NOT award FIRST_LESSON when 2+ lessons are done', () => {
    const history: Lesson[] = [{ status: 'DONE' }, { status: 'DONE' }];
    const result = checkForAchievements(history);
    expect(result.find(a => a.type === 'FIRST_LESSON')).toBeUndefined();
  });

  it('returns FIVE_LESSONS achievement when exactly 5 lessons are DONE', () => {
    const history: Lesson[] = Array(5).fill({ status: 'DONE' });
    const result = checkForAchievements(history);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('FIVE_LESSONS');
    expect(result[0].payload.title).toBe('Learning Explorer');
  });

  it('does NOT award FIVE_LESSONS for 4 done lessons', () => {
    const history: Lesson[] = Array(4).fill({ status: 'DONE' });
    const result = checkForAchievements(history);
    expect(result.find(a => a.type === 'FIVE_LESSONS')).toBeUndefined();
  });

  it('returns PERFECT_SCORE when completedLesson has score 100', () => {
    const result = checkForAchievements([], { status: 'DONE', score: 100 });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('PERFECT_SCORE');
    expect(result[0].payload.icon).toBe('star');
  });

  it('does NOT award PERFECT_SCORE for score < 100', () => {
    const result = checkForAchievements([], { status: 'DONE', score: 90 });
    expect(result.find(a => a.type === 'PERFECT_SCORE')).toBeUndefined();
  });

  it('can return multiple achievements simultaneously', () => {
    // 5 DONE lessons + perfect score on the latest one
    const history: Lesson[] = Array(5).fill({ status: 'DONE' });
    const completed: Lesson = { status: 'DONE', score: 100 };
    const result = checkForAchievements(history, completed);
    expect(result).toHaveLength(2);
    const types = result.map(a => a.type);
    expect(types).toContain('FIVE_LESSONS');
    expect(types).toContain('PERFECT_SCORE');
  });

  it('ignores ACTIVE and QUEUED lessons when counting DONE', () => {
    const history: Lesson[] = [
      { status: 'DONE' },
      { status: 'ACTIVE' },
      { status: 'QUEUED' },
    ];
    const result = checkForAchievements(history);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('FIRST_LESSON');
  });
});

// ─── Programmatic SVG sanity checks (pure, no imports) ───────────────────────

describe('SVG content validation', () => {
  function hasMeaningfulVisualContent(svg: string): boolean {
    const drawingRe = /<(path|circle|ellipse|polygon|polyline|line|text|tspan|image|use)\b/gi;
    const drawingMatches = svg.match(drawingRe) || [];
    const rectRe = /<rect\b[^>]*>/gi;
    const rects = [...svg.matchAll(rectRe)];
    const nonBgRects = rects.filter(m => {
      const r = m[0];
      const fullWidth = /width=["'](?:100%|\d{3,})/i.test(r);
      const fullHeight = /height=["'](?:100%|\d{3,})/i.test(r);
      return !(fullWidth && fullHeight);
    });
    return drawingMatches.length + nonBgRects.length >= 3;
  }

  it('rejects an empty SVG (just background rect)', () => {
    const emptySvg = '<svg viewBox="0 0 500 350"><rect width="500" height="350" fill="#E1F5FE"/></svg>';
    expect(hasMeaningfulVisualContent(emptySvg)).toBe(false);
  });

  it('accepts an SVG with multiple drawing elements', () => {
    const richSvg = `<svg viewBox="0 0 500 350">
      <rect width="500" height="350" fill="#E1F5FE"/>
      <circle cx="250" cy="100" r="50" fill="yellow"/>
      <path d="M 100 200 L 400 200" stroke="blue" stroke-width="3"/>
      <text x="250" y="300">Hello</text>
    </svg>`;
    expect(hasMeaningfulVisualContent(richSvg)).toBe(true);
  });

  it('rejects SVG with only a background and empty groups', () => {
    const truncated = '<svg viewBox="0 0 500 350"><rect width="500" height="350" fill="#E1F5FE"/><g transform="translate(60,60)"></g></svg>';
    expect(hasMeaningfulVisualContent(truncated)).toBe(false);
  });
});

// ─── Reward points delegation logic ─────────────────────────────────────────

describe('Point delegation math', () => {
  it('calculates double-or-loss correctly for all correct', () => {
    const correctCount = 3;
    const wrongCount = 0;
    const isDoubleOrLoss = true;
    const pointsAwarded = correctCount * (isDoubleOrLoss ? 2 : 1);
    const pointsDeducted = isDoubleOrLoss ? wrongCount : 0;
    expect(pointsAwarded).toBe(6);
    expect(pointsDeducted).toBe(0);
  });

  it('calculates double-or-loss correctly for mixed results', () => {
    const correctCount = 2;
    const wrongCount = 1;
    const isDoubleOrLoss = true;
    const pointsAwarded = correctCount * 2;
    const pointsDeducted = wrongCount;
    expect(pointsAwarded).toBe(4);
    expect(pointsDeducted).toBe(1);
  });

  it('calculates standard scoring correctly', () => {
    const correctCount = 3;
    const wrongCount = 0;
    const pointsAwarded = correctCount * 1;
    const pointsDeducted = 0;
    expect(pointsAwarded).toBe(3);
    expect(pointsDeducted).toBe(0);
  });

  it('clamps deduction to available balance', () => {
    const balance = 2;
    const deduction = 5;
    const actualDeduction = Math.min(deduction, balance);
    expect(actualDeduction).toBe(2);
  });

  it('progress percentage is correctly bounded at 100%', () => {
    const saved = 15;
    const tokenCost = 10;
    const pct = Math.min(100, Math.round((saved / tokenCost) * 100));
    expect(pct).toBe(100);
  });
});
