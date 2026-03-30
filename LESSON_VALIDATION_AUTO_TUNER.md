# Lesson Validation Auto-Tuner

## Overview

The lesson validation auto-tuner is a background monitoring system that tracks AI lesson generation quality and automatically detects patterns that indicate validation rules may need adjustment.

## Components

### 1. Validation Logging (`lesson_validation_log` table)

Every lesson validation (pass or fail) is logged to the database with:
- **subject**: The lesson subject (Math, Science, etc.)
- **topic**: The specific topic
- **gradeLevel**: Target grade level
- **model**: AI model used (e.g., `google/gemini-2.0-flash-001`)
- **passed**: Boolean indicating if validation passed
- **rejectionReason**: Error message if validation failed
- **specSnapshot**: JSON snapshot of the failed spec (for debugging)
- **createdAt**: Timestamp

### 2. Auto-Tuner Service (`lesson-validation-tuner.ts`)

Runs every 15 minutes (configurable) and performs the following checks:

#### Rejection Rate Monitoring

- Queries validation logs for the last hour
- Groups by model + subject combination
- Calculates rejection rate (failures / total validations)
- **Triggers action when rejection rate > 20%** (with minimum 5 validations)

#### Pattern Detection

When high rejection rates are detected, the auto-tuner analyzes common rejection reasons and suggests adjustments:

1. **"insufficient sections"** → Suggests counting subsections if models produce nested content instead of flat sections
2. **"placeholder"** → Suggests updating PLACEHOLDER_PATTERNS to catch new placeholder text
3. **"questions"** → Suggests prompt adjustments for question generation

#### Template Quality Monitoring

- **Low-quality templates**: Flags templates served >10 times with avgScore <40% for retirement
- **Proven templates**: Identifies templates served >50 times with avgScore >70% (skip regeneration)

### 3. Analytics Service (`lesson-analytics-service.ts`)

Provides data for monitoring and decision-making:

- **`getLessonAnalytics()`**: Comprehensive analytics including validation rejection rates
- **`flagLowQualityTemplates()`**: Returns templates with poor performance
- **`getTemplatePerformance(templateId)`**: Detailed metrics for a specific template

### 4. Admin Endpoints

All admin-only endpoints (require ADMIN role):

- **GET `/api/admin/lesson-analytics`**: Overall lesson and validation statistics
- **GET `/api/admin/low-quality-templates`**: Templates flagged for poor performance
- **GET `/api/admin/auto-tuner/history`**: Recent auto-tuner actions and suggestions
- **POST `/api/admin/auto-tuner/run`**: Manually trigger an auto-tuner check

## Workflow Example

1. **AI generates lesson**: `enhanced-lesson-service.ts` creates a lesson spec
2. **Validation with logging**: `validateLessonSpec()` is called with context (subject, topic, gradeLevel, model)
3. **Result logged**: Pass or fail is written to `lesson_validation_log`
4. **Auto-tuner runs** (every 15 minutes):
   - Queries logs for last hour
   - Detects: "google/gemini-2.0-flash-001 + Math = 35% rejection rate"
   - Analyzes: Most common reason is "Spec has 1 sections, need at least 2"
   - Suggests: "Model may produce subsections instead of sections. Consider updating validator."
5. **Developer action**: Reviews suggestion and updates `lesson-validator.ts` to count subsections

## Tuning Actions

The auto-tuner **suggests** but does not automatically apply changes. Actions are logged to an in-memory history (last 100 actions) accessible via `/api/admin/auto-tuner/history`.

Example tuning action:
```json
{
  "timestamp": "2026-03-30T01:30:00.000Z",
  "model": "google/gemini-2.0-flash-001",
  "subject": "Math",
  "action": "SUGGEST_COUNT_SUBSECTIONS",
  "reason": "High 'insufficient sections' rejections",
  "rejectionRate": 35.2
}
```

## Configuration

### Auto-Tuner Interval

Edit `server/index.ts`:
```typescript
// Default: 15 minutes
startAutoTuner(15);

// Run more frequently: 5 minutes
startAutoTuner(5);
```

### Rejection Threshold

The 20% threshold is hardcoded in `lesson-validation-tuner.ts`. To adjust:
```typescript
if (rejectionRatePercent > 20) {  // Change this value
  // ...
}
```

### Minimum Validation Count

Auto-tuner requires at least 5 validations before triggering. Adjust in `runAutoTuner()`:
```typescript
if (stat.totalValidations < 5) {  // Change this value
  continue;
}
```

## Database Migration

The `lesson_validation_log` table is created automatically via Drizzle migrations on server startup.

## Monitoring

### Check Auto-Tuner Status

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://sunschool.xyz/api/admin/auto-tuner/history
```

### View Recent Rejections

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://sunschool.xyz/api/admin/lesson-analytics
```

Look for the `validationRejectionRate` and `recentRejections` fields.

### Manually Trigger Auto-Tuner

```bash
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://sunschool.xyz/api/admin/auto-tuner/run
```

## Implementation Notes

### Fire-and-Forget Logging

Validation logging is non-blocking:
- Uses `.catch()` to prevent database errors from breaking lesson generation
- Logs failures but does not throw

### Context Passing

To enable validation logging, pass context when calling `validateLessonSpec()`:

```typescript
validateLessonSpec(spec, {
  subject: 'Math',
  topic: 'Fractions',
  gradeLevel: 4,
  model: 'google/gemini-2.0-flash-001',
});
```

Without context, validation still works but results are not logged.

## Future Enhancements

Potential improvements:

1. **Auto-adjustment**: Allow auto-tuner to apply safe adjustments (e.g., adding placeholder patterns)
2. **Email alerts**: Notify admins when rejection rates spike
3. **Per-model thresholds**: Different rejection thresholds for different AI models
4. **Template auto-retirement**: Automatically retire templates below quality thresholds
5. **A/B testing**: Test validation rule changes against a control group
6. **Dashboard**: Web UI for visualizing validation trends

## Related Files

- `server/services/lesson-validation-tuner.ts` — Auto-tuner logic
- `server/services/lesson-analytics-service.ts` — Analytics queries
- `server/services/lesson-validator.ts` — Validation rules and logging
- `server/services/enhanced-lesson-service.ts` — Lesson generation with validation
- `shared/schema.ts` — Database schema including `lesson_validation_log`
- `server/routes.ts` — Admin API endpoints
- `server/index.ts` — Auto-tuner startup
