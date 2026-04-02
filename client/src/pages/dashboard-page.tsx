import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useAuth } from '../hooks/use-auth';
import { colors, typography, commonStyles } from '../styles/theme';
import { Link, useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';
import { BookOpen, Award, BarChart2, Plus, ArrowRight, User, Eye, Settings, Trash2 } from 'react-feather';
import { useMode } from '../context/ModeContext';
import { useToast } from '../hooks/use-toast';
import GradePicker from '../components/GradePicker';
import { gradeToAge } from '../utils/gradeToAge';

// Child report data shape returned by the reports endpoint
interface ChildReport {
  analytics?: {
    lessonsCompleted?: number;
    achievementsCount?: number;
    averageScore?: number;
  };
}

// Individual child card component
const ChildCard: React.FC<{
  learner: { id: number; name: string; email: string; role: string };
  onView: () => void;
  onRemove: (id: number) => void;
  removing?: boolean;
}> = ({ learner, onView, onRemove, removing }) => {
  const [confirmRemove, setConfirmRemove] = useState(false);
  // Fetch report data for this child
  const { data: report, isLoading: reportLoading, error: reportError } = useQuery<ChildReport>({
    queryKey: [`/api/reports`, learner.id, 'progress'],
    queryFn: () =>
      apiRequest('GET', `/api/reports?learnerId=${learner.id}&type=progress`).then(
        (res: any) => res.data ?? res,
      ),
    enabled: !!learner.id,
    retry: 1,
  });

  // Fetch learner profile for grade level
  const { data: profile, isLoading: profileLoading, error: profileError } = useQuery({
    queryKey: [`/api/learner-profile/${learner.id}`],
    queryFn: () =>
      apiRequest('GET', `/api/learner-profile/${learner.id}`).then(
        (res: any) => res.data ?? res,
      ),
    enabled: !!learner.id,
    retry: 1,
  });

  // Fetch lessons to compute average score when the report doesn't provide one
  const { data: lessons } = useQuery<any[]>({
    queryKey: [`/api/lessons`, learner.id],
    queryFn: () =>
      apiRequest('GET', `/api/lessons?learnerId=${learner.id}`).then(
        (res: any) => res.data ?? res,
      ),
    enabled: !!learner.id,
    retry: 1,
  });

  const hasChildError = !!(reportError || profileError);

  const lessonsCompleted = report?.analytics?.lessonsCompleted ?? 0;
  const achievementsCount = report?.analytics?.achievementsCount ?? 0;

  // Average score: prefer the analytics value; fall back to computing from lessons
  let avgScore: number | null = null;
  if (report?.analytics?.averageScore != null) {
    avgScore = Math.round(report.analytics.averageScore);
  } else if (lessons && lessons.length > 0) {
    const scored = lessons.filter((l: any) => typeof l.score === 'number');
    if (scored.length > 0) {
      const total = scored.reduce((sum: number, l: any) => sum + l.score, 0);
      avgScore = Math.round(total / scored.length);
    }
  }

  const ageRange = profile?.gradeLevel != null ? gradeToAge(profile.gradeLevel) : '';
  const gradeLabel = profile?.gradeLevel != null
    ? `Grade ${profile.gradeLevel}${ageRange ? ` (${ageRange} yrs)` : ''}`
    : null;
  const isLoading = reportLoading || profileLoading;

  return (
    <View style={styles.childCard}>
      {/* Header row: avatar circle + name / grade */}
      <View style={styles.childCardHeader}>
        <View style={styles.childAvatar}>
          <Text style={styles.childAvatarText}>
            {learner.name?.charAt(0)?.toUpperCase() ?? '?'}
          </Text>
        </View>
        <View style={styles.childNameContainer}>
          <Text style={styles.childName}>{learner.name}</Text>
          {gradeLabel && (
            <View style={styles.gradeBadge}>
              <Text style={styles.gradeBadgeText}>{gradeLabel}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Stats row */}
      {isLoading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
      ) : hasChildError ? (
        <View style={{ paddingVertical: 12, paddingHorizontal: 8 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
            Could not load stats for {learner.name}
          </Text>
        </View>
      ) : (
        <View style={styles.childStatsRow}>
          <View style={styles.childStat}>
            <BookOpen size={14} color={colors.textSecondary} />
            <Text style={styles.childStatValue}>{lessonsCompleted}</Text>
            <Text style={styles.childStatLabel}>Lessons</Text>
          </View>

          <View style={styles.childStatDivider} />

          <View style={styles.childStat}>
            <BarChart2 size={14} color={colors.textSecondary} />
            <Text style={styles.childStatValue}>
              {avgScore !== null ? `${avgScore}%` : '--'}
            </Text>
            <Text style={styles.childStatLabel}>Avg Score</Text>
          </View>

          <View style={styles.childStatDivider} />

          <View style={styles.childStat}>
            <Award size={14} color={colors.textSecondary} />
            <Text style={styles.childStatValue}>{achievementsCount}</Text>
            <Text style={styles.childStatLabel}>Achievements</Text>
          </View>
        </View>
      )}

      {/* Action row */}
      <View style={styles.childActionRow}>
        <TouchableOpacity style={styles.childViewButton} onPress={onView}>
          <User size={14} color={colors.onPrimary} />
          <Text style={styles.childViewButtonText}>Start Learning as {learner.name}</Text>
          <ArrowRight size={14} color={colors.onPrimary} />
        </TouchableOpacity>
        <View style={styles.childCardFooterRow}>
          <Link href={`/learners/${learner.id}/prompt-settings`}>
            <View style={styles.promptSettingsLink}>
              <Settings size={14} color={colors.textSecondary} />
              <Text style={styles.promptSettingsText}>Prompt Settings</Text>
            </View>
          </Link>
          {!confirmRemove ? (
            <TouchableOpacity
              style={styles.removeLink}
              onPress={() => setConfirmRemove(true)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${learner.name}`}
            >
              <Trash2 size={12} color={colors.error} />
              <Text style={styles.removeLinkText}>Remove</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.removeConfirm}>
              <Text style={styles.removeConfirmText}>Remove {learner.name}?</Text>
              <TouchableOpacity
                onPress={() => { onRemove(learner.id); setConfirmRemove(false); }}
                style={styles.removeYes}
                disabled={removing}
              >
                <Text style={styles.removeYesText}>{removing ? '...' : 'Yes'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setConfirmRemove(false)}
                style={styles.removeNo}
              >
                <Text style={styles.removeNoText}>No</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

// Inline add-child form for first-time parents
const InlineAddChildForm: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const gradeToNumber = (grade: string): number | null => {
    if (grade === 'K') return 0;
    const num = parseInt(grade, 10);
    if (isNaN(num) || num < 1 || num > 12) return null;
    return num;
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Please enter a name');
      return;
    }
    const numericGrade = gradeToNumber(gradeLevel);
    if (numericGrade === null) {
      setError('Please select a grade level');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      await apiRequest('POST', '/api/learners', {
        name: name.trim(),
        gradeLevel: numericGrade,
        role: 'LEARNER',
        parentId: user?.id,
      });

      toast({ title: 'Success', description: `${name.trim()} has been added!` });
      queryClient.invalidateQueries({ queryKey: ['/api/learners'] });
      setName('');
      setGradeLevel('');
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create account. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.inlineForm}>
      {error ? (
        <View style={styles.inlineFormError}>
          <Text style={styles.inlineFormErrorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.inlineFormGroup}>
        <Text style={styles.inlineFormLabel}>Child's Name</Text>
        <TextInput
          style={styles.inlineFormInput}
          value={name}
          onChangeText={setName}
          placeholder="Enter child's name"
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <View style={styles.inlineFormGroup}>
        <GradePicker
          value={gradeLevel}
          onChange={setGradeLevel}
        />
      </View>

      <TouchableOpacity
        style={[styles.inlineFormButton, isSubmitting && { opacity: 0.7 }]}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator size="small" color={colors.onPrimary} />
        ) : (
          <>
            <Plus size={16} color={colors.onPrimary} />
            <Text style={styles.inlineFormButtonText}>Add Child</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

// Prompt Transparency summary card for the parent dashboard
const PromptTransparencyCard: React.FC<{ learners: any[] }> = ({ learners }) => {
  const firstLearnerId = learners?.[0]?.id;

  // Fetch prompt data for the first learner to show a preview
  const { data: prompts = [] } = useQuery<any[]>({
    queryKey: [`/api/learners/${firstLearnerId}/prompts`],
    queryFn: () =>
      apiRequest('GET', `/api/learners/${firstLearnerId}/prompts`).then(
        (res: any) => res.data ?? res,
      ),
    enabled: !!firstLearnerId,
    retry: 1,
  });

  // Count total lessons across all learners (from reports data already fetched)
  const totalPrompts = prompts.length;
  const uniqueLessons = new Set(prompts.map((p: any) => p.lessonId)).size;
  const lastPrompt = prompts[0]; // Most recent first

  const [, setLocation] = useLocation();

  return (
    <View style={styles.transparencyCard}>
      <View style={styles.transparencyCardHeader}>
        <Eye size={18} color={colors.primary} />
        <Text style={styles.transparencyCardTitle}>Prompt Transparency</Text>
      </View>
      <View style={styles.transparencyStatsRow}>
        <View style={styles.transparencyStat}>
          <Text style={styles.transparencyStatValue}>{uniqueLessons}</Text>
          <Text style={styles.transparencyStatLabel}>Lessons Generated</Text>
        </View>
        <View style={styles.transparencyStatDivider} />
        <View style={styles.transparencyStat}>
          <Text style={styles.transparencyStatValue}>{totalPrompts}</Text>
          <Text style={styles.transparencyStatLabel}>Prompts Logged</Text>
        </View>
      </View>
      {lastPrompt && (
        <View style={styles.transparencyPreview}>
          <Text style={styles.transparencyPreviewLabel}>Last prompt used:</Text>
          <Text style={styles.transparencyPreviewText} numberOfLines={1}>
            {lastPrompt.lessonTitle || `Lesson ${lastPrompt.lessonId}`} — {lastPrompt.model} — {new Date(lastPrompt.createdAt).toLocaleDateString()}
          </Text>
        </View>
      )}
      <TouchableOpacity
        style={styles.transparencyLink}
        onPress={() => setLocation('/prompts')}
      >
        <Text style={styles.transparencyLinkText}>View All Prompts</Text>
        <ArrowRight size={14} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
};

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { selectLearner } = useMode();

  // Fetch learners for the children overview (parents / admins)
  const {
    data: learners,
    isLoading: learnersLoading,
    error: learnersError,
  } = useQuery<any[]>({
    queryKey: ['/api/learners'],
    queryFn: () => apiRequest('GET', '/api/learners').then((res: any) => res.data ?? res),
    enabled: user?.role === 'PARENT' || user?.role === 'ADMIN',
  });

  const queryClient = useQueryClient();

  // Handle "Start Learning" on a child card -- switch into that learner's mode
  const handleViewChild = (learner: { id: number; name: string; email: string; role: string }) => {
    selectLearner(learner);
  };

  // Handle removing a child
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const handleRemoveChild = async (learnerId: number) => {
    if (removingId) return; // prevent double-tap
    setRemovingId(learnerId);
    setRemoveError(null);
    try {
      await apiRequest('DELETE', `/api/learners/${learnerId}`);
      queryClient.invalidateQueries({ queryKey: ['/api/learners'] });
    } catch (err) {
      setRemoveError('Could not remove child. Please try again.');
      console.error('Failed to remove learner:', err);
    } finally {
      setRemovingId(null);
    }
  };

  const hasChildren = learners && learners.length > 0;

  // Fetch pending review lessons for all children
  const { data: allLessons } = useQuery<any[]>({
    queryKey: ['/api/lessons/all-pending'],
    queryFn: async () => {
      if (!learners || learners.length === 0) return [];
      const lessonsPromises = learners.map((learner: any) =>
        apiRequest('GET', `/api/lessons?learnerId=${learner.id}`).then(
          (res: any) => (res.data ?? res).map((lesson: any) => ({ ...lesson, learnerName: learner.name }))
        ).catch(() => [])
      );
      const allResults = await Promise.all(lessonsPromises);
      return allResults.flat();
    },
    enabled: (user?.role === 'PARENT' || user?.role === 'ADMIN') && hasChildren,
  });

  const pendingLessons = allLessons?.filter((lesson: any) => lesson.status === 'PENDING_REVIEW') || [];

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content}>
        <Text style={styles.welcomeText}>Welcome, {user?.name || 'User'}!</Text>

        {/* Pending Review Banner */}
        {pendingLessons.length > 0 && (
          <View style={styles.pendingBanner}>
            <Text style={styles.pendingBannerTitle}>
              {pendingLessons.length} lesson{pendingLessons.length > 1 ? 's' : ''} waiting for your approval
            </Text>
            <Text style={styles.pendingBannerText}>
              Review lessons before they become available to your children.
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pendingLessonsList}>
              {pendingLessons.map((lesson: any) => (
                <View key={lesson.id} style={styles.pendingLessonCard}>
                  <Text style={styles.pendingLessonTitle} numberOfLines={1}>
                    {lesson.spec?.title || 'Untitled Lesson'}
                  </Text>
                  <Text style={styles.pendingLessonLearner}>{lesson.learnerName}</Text>
                  <View style={styles.pendingLessonActions}>
                    <TouchableOpacity
                      style={styles.approveButton}
                      onPress={async () => {
                        try {
                          await apiRequest('PUT', `/api/lessons/${lesson.id}/approve`, {});
                          queryClient.invalidateQueries({ queryKey: ['/api/lessons/all-pending'] });
                          queryClient.invalidateQueries({ queryKey: [`/api/lessons`, lesson.learnerId] });
                        } catch (err) {
                          console.error('Failed to approve lesson:', err);
                        }
                      }}
                    >
                      <Text style={styles.approveButtonText}>✓ Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectButton}
                      onPress={async () => {
                        try {
                          await apiRequest('PUT', `/api/lessons/${lesson.id}/reject`, { regenerate: true });
                          queryClient.invalidateQueries({ queryKey: ['/api/lessons/all-pending'] });
                          queryClient.invalidateQueries({ queryKey: [`/api/lessons`, lesson.learnerId] });
                        } catch (err) {
                          console.error('Failed to reject lesson:', err);
                        }
                      }}
                    >
                      <Text style={styles.rejectButtonText}>✗ Regenerate</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {(user?.role === 'PARENT' || user?.role === 'ADMIN') && (
          <>
            {learnersLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 24 }} />
            ) : learnersError ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>
                  Unable to load your children. Please try again.
                </Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => queryClient.invalidateQueries({ queryKey: ['/api/learners'] })}
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : hasChildren ? (
              <>
                {/* Child cards */}
                {learners.map((learner: any) => (
                  <ChildCard
                    key={learner.id}
                    learner={learner}
                    onView={() => handleViewChild(learner)}
                    onRemove={handleRemoveChild}
                    removing={removingId === learner.id}
                  />
                ))}

                {removeError && (
                  <Text style={{ color: colors.error, fontSize: 13, textAlign: 'center', marginBottom: 8 }}>{removeError}</Text>
                )}

                {/* Add Another Child */}
                <TouchableOpacity
                  style={styles.addAnotherButton}
                  onPress={() => setLocation('/add-learner')}
                >
                  <Plus size={16} color={colors.primary} />
                  <Text style={styles.addAnotherButtonText}>Add Another Child</Text>
                </TouchableOpacity>

                {/* Prompt Transparency card */}
                <PromptTransparencyCard learners={learners} />

                {/* Minimal tools row */}
                <View style={styles.toolsRow}>
                  <Link href="/reports">
                    <Text style={styles.toolLink}>Reports</Text>
                  </Link>
                  <Text style={styles.toolDivider}>·</Text>
                  <Link href="/prompts">
                    <Text style={styles.toolLink}>Prompts</Text>
                  </Link>
                  <Text style={styles.toolDivider}>·</Text>
                  <Link href="/rewards">
                    <Text style={styles.toolLink}>Rewards</Text>
                  </Link>
                  {user?.role === 'ADMIN' && (
                    <>
                      <Text style={styles.toolDivider}>·</Text>
                      <Link href="/admin">
                        <Text style={styles.toolLink}>Admin Panel</Text>
                      </Link>
                    </>
                  )}
                </View>
              </>
            ) : (
              <>
                {/* First-time parent: inline add-child form */}
                <Text style={styles.subtitle}>Add your child to get started</Text>
                <InlineAddChildForm onSuccess={() => {}} />
              </>
            )}
          </>
        )}

        {user?.role === 'LEARNER' && (
          <View style={styles.learnerRedirect}>
            <Text style={styles.learnerRedirectText}>
              Redirecting to your learning dashboard...
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    maxWidth: '100%',
  },
  content: {
    flex: 1,
    padding: 24,
    maxWidth: '100%',
  },
  welcomeText: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body1,
    color: colors.textSecondary,
    marginBottom: 24,
  },

  // ------------------------------------------------------------------
  // Child cards (kept from original)
  // ------------------------------------------------------------------
  childCard: {
    backgroundColor: colors.surfaceColor,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  childCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  childAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  childAvatarText: {
    ...typography.h5,
    color: colors.onPrimary,
    fontWeight: '700',
    marginBottom: 0,
  },
  childNameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  childName: {
    ...typography.h6,
    color: colors.text,
    marginBottom: 0,
    marginRight: 8,
  },
  gradeBadge: {
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  gradeBadgeText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  childStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  childStat: {
    alignItems: 'center',
    flex: 1,
  },
  childStatValue: {
    ...typography.h6,
    color: colors.text,
    marginTop: 4,
    marginBottom: 2,
  },
  childStatLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },
  childStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  childViewButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
  },
  childViewButtonText: {
    ...typography.button,
    color: colors.onPrimary,
    marginHorizontal: 8,
  },
  childActionRow: {
    gap: 8,
  },
  promptSettingsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 6,
  },
  promptSettingsText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  childCardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  removeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  removeLinkText: {
    fontSize: 12,
    color: colors.error,
    fontWeight: '500',
  },
  removeConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  removeConfirmText: {
    fontSize: 12,
    color: colors.error,
    fontWeight: '500',
  },
  removeYes: {
    backgroundColor: colors.error,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  removeYesText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  removeNo: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  removeNoText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },

  // ------------------------------------------------------------------
  // Add Another Child button (subtle, secondary)
  // ------------------------------------------------------------------
  addAnotherButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary + '40',
    marginTop: 4,
    marginBottom: 16,
  },
  addAnotherButtonText: {
    ...typography.button,
    color: colors.primary,
    marginLeft: 8,
  },

  // ------------------------------------------------------------------
  // Minimal tools row
  // ------------------------------------------------------------------
  toolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  toolLink: {
    ...typography.body2,
    color: colors.primary,
  },
  toolDivider: {
    ...typography.body2,
    color: colors.textSecondary,
    marginHorizontal: 12,
  },

  // ------------------------------------------------------------------
  // Inline add-child form
  // ------------------------------------------------------------------
  inlineForm: {
    backgroundColor: colors.surfaceColor,
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  inlineFormGroup: {
    marginBottom: 16,
  },
  inlineFormLabel: {
    ...typography.body2,
    color: colors.textSecondary,
    fontWeight: '500',
    marginBottom: 8,
  },
  inlineFormInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  inlineFormButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 8,
  },
  inlineFormButtonText: {
    ...typography.button,
    color: colors.onPrimary,
    marginLeft: 8,
  },
  inlineFormError: {
    backgroundColor: colors.error + '18',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  inlineFormErrorText: {
    ...typography.body2,
    color: colors.error,
  },

  // ------------------------------------------------------------------
  // Error / retry
  // ------------------------------------------------------------------
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  errorText: {
    ...typography.body1,
    color: colors.error,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    ...typography.button,
    color: colors.onPrimary,
  },

  // ------------------------------------------------------------------
  // Pending Review Banner
  // ------------------------------------------------------------------
  pendingBanner: {
    backgroundColor: '#FFF4E6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFB84D',
  },
  pendingBannerTitle: {
    ...typography.h6,
    color: '#CC5500',
    marginBottom: 4,
  },
  pendingBannerText: {
    ...typography.body2,
    color: '#995000',
    marginBottom: 12,
  },
  pendingLessonsList: {
    marginTop: 8,
  },
  pendingLessonCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginRight: 12,
    width: 240,
    borderWidth: 1,
    borderColor: '#FFB84D',
  },
  pendingLessonTitle: {
    ...typography.body1,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  pendingLessonLearner: {
    ...typography.body2,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  pendingLessonActions: {
    flexDirection: 'row',
    gap: 8,
  },
  approveButton: {
    flex: 1,
    backgroundColor: '#22C55E',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  approveButtonText: {
    ...typography.body2,
    color: '#FFF',
    fontWeight: '600',
  },
  rejectButton: {
    flex: 1,
    backgroundColor: '#EF4444',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  rejectButtonText: {
    ...typography.body2,
    color: '#FFF',
    fontWeight: '600',
  },

  // ------------------------------------------------------------------
  // Learner fallback
  // ------------------------------------------------------------------
  learnerRedirect: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  learnerRedirectText: {
    ...typography.body2,
    color: colors.textSecondary,
  },

  // ------------------------------------------------------------------
  // Prompt Transparency card
  // ------------------------------------------------------------------
  transparencyCard: {
    backgroundColor: colors.surfaceColor,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.primary + '30',
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  transparencyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  transparencyCardTitle: {
    ...typography.h6,
    color: colors.text,
    marginBottom: 0,
  },
  transparencyStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  transparencyStat: {
    alignItems: 'center',
    flex: 1,
  },
  transparencyStatValue: {
    ...typography.h6,
    color: colors.primary,
    marginBottom: 2,
  },
  transparencyStatLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },
  transparencyStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  transparencyPreview: {
    marginBottom: 12,
  },
  transparencyPreviewLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  transparencyPreviewText: {
    ...typography.body2,
    color: colors.text,
    fontSize: 13,
  },
  transparencyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  transparencyLinkText: {
    ...typography.button,
    color: colors.primary,
    fontSize: 13,
  },
});

export default DashboardPage;
