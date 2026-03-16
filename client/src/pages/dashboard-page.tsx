import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useAuth } from '../hooks/use-auth';
import { colors, typography, commonStyles } from '../styles/theme';
import { Link, useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';
import { BookOpen, Award, BarChart2, Plus, ArrowRight, User } from 'react-feather';
import { useMode } from '../context/ModeContext';
import { useToast } from '../hooks/use-toast';
import GradePicker from '../components/GradePicker';

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
}> = ({ learner, onView }) => {
  // Fetch report data for this child
  const { data: report, isLoading: reportLoading } = useQuery<ChildReport>({
    queryKey: [`/api/reports`, learner.id, 'progress'],
    queryFn: () =>
      apiRequest('GET', `/api/reports?learnerId=${learner.id}&type=progress`).then(
        (res: any) => res.data ?? res,
      ),
    enabled: !!learner.id,
  });

  // Fetch learner profile for grade level
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: [`/api/learner-profile/${learner.id}`],
    queryFn: () =>
      apiRequest('GET', `/api/learner-profile/${learner.id}`).then(
        (res: any) => res.data ?? res,
      ),
    enabled: !!learner.id,
  });

  // Fetch lessons to compute average score when the report doesn't provide one
  const { data: lessons } = useQuery<any[]>({
    queryKey: [`/api/lessons`, learner.id],
    queryFn: () =>
      apiRequest('GET', `/api/lessons?learnerId=${learner.id}`).then(
        (res: any) => res.data ?? res,
      ),
    enabled: !!learner.id,
  });

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

  const gradeLabel = profile?.gradeLevel ? `Grade ${profile.gradeLevel}` : null;
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

      {/* Start Learning button */}
      <TouchableOpacity style={styles.childViewButton} onPress={onView}>
        <User size={14} color={colors.onPrimary} />
        <Text style={styles.childViewButtonText}>Start Learning as {learner.name}</Text>
        <ArrowRight size={14} color={colors.onPrimary} />
      </TouchableOpacity>
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

const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { selectLearner } = useMode();

  // Fetch learners for the children overview (parents / admins)
  const {
    data: learners,
    isLoading: learnersLoading,
  } = useQuery<any[]>({
    queryKey: ['/api/learners'],
    queryFn: () => apiRequest('GET', '/api/learners').then((res: any) => res.data ?? res),
    enabled: user?.role === 'PARENT' || user?.role === 'ADMIN',
  });

  // Handle "Start Learning" on a child card -- switch into that learner's mode
  const handleViewChild = (learner: { id: number; name: string; email: string; role: string }) => {
    selectLearner(learner);
  };

  const hasChildren = learners && learners.length > 0;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content}>
        <Text style={styles.welcomeText}>Welcome, {user?.name || 'User'}!</Text>

        {(user?.role === 'PARENT' || user?.role === 'ADMIN') && (
          <>
            {learnersLoading ? (
              <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 24 }} />
            ) : hasChildren ? (
              <>
                {/* Child cards */}
                {learners.map((learner: any) => (
                  <ChildCard
                    key={learner.id}
                    learner={learner}
                    onView={() => handleViewChild(learner)}
                  />
                ))}

                {/* Add Another Child */}
                <TouchableOpacity
                  style={styles.addAnotherButton}
                  onPress={() => setLocation('/add-learner')}
                >
                  <Plus size={16} color={colors.primary} />
                  <Text style={styles.addAnotherButtonText}>Add Another Child</Text>
                </TouchableOpacity>

                {/* Minimal tools row */}
                <View style={styles.toolsRow}>
                  <Link href="/reports">
                    <Text style={styles.toolLink}>Reports</Text>
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
});

export default DashboardPage;
