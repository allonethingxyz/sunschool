import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Image,
  Modal,
} from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { useAuth } from '../hooks/use-auth';
import { apiRequest, queryClient } from '../lib/queryClient';
import { useTheme } from '../styles/theme';
import { colors as parentColors, typography as parentTypography, commonStyles as parentCommonStyles } from '../styles/theme';
import LessonCard from '../components/LessonCard';
import KnowledgeGraph from '../components/KnowledgeGraph';
import SubjectSelector from '../components/SubjectSelector';
import { Book, Award, BarChart2, User, Compass, Zap, Plus, X, Gift } from 'react-feather';
import { useMode } from '../context/ModeContext';
import FunLoader from '../components/FunLoader';


// Use parent colors for static StyleSheet, override with theme at runtime
const colors = parentColors;
const typography = parentTypography;
const commonStyles = parentCommonStyles;

// ─── Goals progress strip (inline, so we don't add a separate import) ────────
import { useQuery as _useQuery } from '@tanstack/react-query';

const GoalsStrip: React.FC<{ learnerId?: number; onPress: () => void; theme: any }> = ({ learnerId, onPress, theme }) => {
  const { data: goals = [] } = _useQuery<any[]>({
    queryKey: ['/api/rewards-summary', learnerId],
    queryFn: () => apiRequest('GET', `/api/rewards-summary?learnerId=${learnerId}`).then(r => r.data),
    enabled: !!learnerId,
  });
  if (!goals.length) return null;
  const topGoal = goals[0];
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        backgroundColor: theme.colors.surfaceColor, borderRadius: 12,
        padding: 14, marginBottom: 16,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Gift size={16} color={theme.colors.primary} />
        <Text style={{ marginLeft: 6, fontWeight: '700', color: theme.colors.textPrimary, fontSize: 14 }}>My Goals</Text>
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 12, color: theme.colors.primary, fontWeight: '600' }}>See all →</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontSize: 24, marginRight: 8 }}>{topGoal.imageEmoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.textPrimary, marginBottom: 4 }}>
            {topGoal.title}
          </Text>
          <View style={{ height: 8, backgroundColor: theme.colors.divider, borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${topGoal.progressPct}%`, backgroundColor: topGoal.color, borderRadius: 4 }} />
          </View>
          <Text style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 3 }}>
            {topGoal.savedPoints}/{topGoal.tokenCost} pts · {topGoal.progressPct}%
          </Text>
        </View>
      </View>
      {goals.length > 1 && (
        <Text style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 6, textAlign: 'right' }}>
          +{goals.length - 1} more goal{goals.length > 2 ? 's' : ''}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const LearnerHome = () => {
  const { user } = useAuth();
  const { selectedLearner } = useMode();
  const theme = useTheme();
  const [, setLocation] = useLocation();
  const [refreshing, setRefreshing] = useState(false);
  const [subjectSelectorVisible, setSubjectSelectorVisible] = useState(false);

  // Fetch active lesson
  const {
    data: activeLesson,
    isLoading: isLessonLoading,
    error: lessonError,
  } = useQuery({
    queryKey: ['/api/lessons/active', selectedLearner?.id],
    queryFn: async () => {
      try {
        const res = await apiRequest('GET', `/api/lessons/active?learnerId=${selectedLearner?.id}`);
        return res.data;
      } catch (err) {
        console.error('Error fetching active lesson:', err);
        throw err;
      }
    },
    enabled: !!selectedLearner?.id,
  });

  // Fetch learner profile
  const {
    data: profile,
    isLoading: isProfileLoading,
    error: profileError,
  } = useQuery({
    queryKey: [`/api/learner-profile/${selectedLearner?.id}`],
    queryFn: async () => {
      try {
        const res = await apiRequest('GET', `/api/learner-profile/${selectedLearner?.id}`);
        return res.data;
      } catch (err) {
        console.error('Error fetching learner profile:', err);
        throw err;
      }
    },
    enabled: !!selectedLearner?.id,
  });

  // Generate a new lesson
    const generateLessonMutation = useMutation({
    mutationFn: (data: { learnerId: number, topic: string, gradeLevel: number, subject: string, category: string, difficulty: 'beginner' | 'intermediate' | 'advanced' }) => {
      return apiRequest('POST', '/api/lessons/create', data).then(res => res.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lessons/active', selectedLearner?.id] });
    },
    onError: (error) => {
      console.error('Error generating lesson:', error);
    }
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/lessons/active', selectedLearner?.id] }),
      queryClient.invalidateQueries({ queryKey: [`/api/learner-profile/${selectedLearner?.id}`] }),
    ]);
    setRefreshing(false);
  }, [selectedLearner?.id]);

  const handleGenerateLesson = (subject?: { name: string; category: string; difficulty: 'beginner' | 'intermediate' | 'advanced' }) => {
    if (!selectedLearner || !profile) return;

    // If no subject specified, pick a random one from the learner's subjects
    let selectedSubject = subject;
    if (!selectedSubject && profile.subjects && profile.subjects.length > 0) {
      const randomSubject = profile.subjects[Math.floor(Math.random() * profile.subjects.length)];
      selectedSubject = {
        name: randomSubject,
        category: 'General', // Default category
        difficulty: 'beginner'
      };
    }

    generateLessonMutation.mutate({
      learnerId: selectedLearner.id,
      topic: selectedSubject?.name || 'Math', // Fallback to Math if no subjects available
      gradeLevel: profile.gradeLevel,
      subject: selectedSubject?.name || 'Math',
      category: selectedSubject?.category || 'General',
      difficulty: selectedSubject?.difficulty || 'beginner'
    });
  };

  const handleOpenSubjectSelector = () => {
    setSubjectSelectorVisible(true);
  };

  const handleCloseSubjectSelector = () => {
    setSubjectSelectorVisible(false);
  };

  const handleSelectSubject = (subject: { name: string; category: string; difficulty: 'beginner' | 'intermediate' | 'advanced' }) => {
    setSubjectSelectorVisible(false);
    handleGenerateLesson(subject);
  };

  const handleViewLesson = () => {
    if (activeLesson) {
      setLocation('/lesson');
    }
  };

  const isLoading = isLessonLoading || isProfileLoading || generateLessonMutation.isPending;
  const hasError = lessonError || profileError;

  return (
    <View style={[commonStyles.container, { backgroundColor: theme.colors.background }]}>
      {/* Subject Selector Modal */}
      <Modal
        visible={subjectSelectorVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCloseSubjectSelector}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose a Subject</Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={handleCloseSubjectSelector}
              >
                <X size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <SubjectSelector onSelectSubject={handleSelectSubject} />
          </View>
        </View>
      </Modal>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <View style={styles.userInfo}>
            <View style={styles.avatarContainer}>
              <User size={24} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.greeting}>Hello, {selectedLearner?.name}!</Text>
              <Text style={styles.gradeText}>
                Grade {profile?.gradeLevel || '—'}
              </Text>
            </View>
          </View>

        </View>

        {isLoading ? (
          <FunLoader
            progressMessages={
              generateLessonMutation.isPending
                ? ['Finding the best lesson for you...', 'Almost ready...', 'Here it comes!']
                : undefined
            }
            message={generateLessonMutation.isPending ? undefined : 'Getting your stuff ready...'}
          />
        ) : hasError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              Something went wrong. Please try again.
            </Text>
            {lessonError && (
              <Text style={styles.errorDetail}>
                Lesson error: {lessonError.message || String(lessonError)}
              </Text>
            )}
            {profileError && (
              <Text style={styles.errorDetail}>
                Profile error: {profileError.message || String(profileError)}
              </Text>
            )}
            <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Active Lesson Section */}
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Current Lesson</Text>
              </View>

              {activeLesson ? (
                <LessonCard
                  lesson={activeLesson}
                  onPress={handleViewLesson}
                />
              ) : (
                <View style={styles.emptyState}>
                  <Book size={48} color={colors.primaryLight} />
                  <Text style={styles.emptyStateText}>
                    You don't have an active lesson
                  </Text>
                  <View style={styles.emptyStateActions}>
                    <TouchableOpacity
                      style={styles.selectSubjectButton}
                      onPress={handleOpenSubjectSelector}
                    >
                      <Text style={styles.selectSubjectButtonText}>
                        Select a Subject
                      </Text>
                      <Book size={16} color={colors.primary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.generateButton}
                      onPress={() => handleGenerateLesson()}
                    >
                      <Text style={styles.generateButtonText}>
                        Random Lesson
                      </Text>
                      <Zap size={16} color={colors.onPrimary} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Knowledge Graph */}
            {profile?.graph && profile.graph.nodes.length > 0 && (
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>My Brain Map</Text>
                </View>
                <View style={styles.graphContainer}>
                  <KnowledgeGraph graph={profile.graph} />
                </View>
              </View>
            )}

            {/* Goals card */}
            <GoalsStrip learnerId={selectedLearner?.id} onPress={() => setLocation('/goals')} theme={theme} />

            {/* Learning Journey Card */}
            <TouchableOpacity 
              style={styles.journeyCard}
              onPress={() => setLocation('/progress')}
            >
              <View style={styles.journeyIcon}>
                <Compass size={24} color={colors.onPrimary} />
              </View>
              <View style={styles.journeyContent}>
                <Text style={styles.journeyTitle}>My Progress</Text>
                <Text style={styles.journeyText}>
                  Track your progress and see how far you've come
                </Text>
              </View>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  // Subject Selector Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    ...typography.h3,
  },
  closeButton: {
    padding: 8,
  },
  emptyStateActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  selectSubjectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceColor,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    marginHorizontal: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  selectSubjectButtonText: {
    ...typography.button,
    color: colors.primary,
    marginRight: 8,
  },
  // Learner Switcher Styles
  learnerSwitcherContainer: {
    position: 'relative',
  },
  learnerSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceColor,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  learnerSwitcherAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  learnerSwitcherName: {
    fontSize: 12,
    color: colors.textPrimary,
    marginRight: 4,
    maxWidth: 120,
  },
  learnerSwitcherLoading: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  learnerSwitcherLoadingText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 6,
  },
  learnerSwitcherDropdown: {
    position: 'absolute',
    top: 36,
    right: 0,
    width: 180,
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.divider,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 1000,
  },
  learnerSwitcherDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  learnerSwitcherDropdownItemActive: {
    backgroundColor: colors.primaryLight,
  },
  learnerSwitcherItemAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  learnerSwitcherItemName: {
    fontSize: 14,
    color: colors.textPrimary,
  },

  // Original Styles
  scrollContent: {
    flexGrow: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  greeting: {
    ...typography.h2,
    marginBottom: 0,
  },
  gradeText: {
    ...typography.body2,
    color: colors.textSecondary,
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: 0,
  },
  journeyCard: {
    ...commonStyles.card,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    marginBottom: 24,
  },
  journeyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  journeyContent: {
    flex: 1,
  },
  journeyTitle: {
    ...typography.subtitle1,
    color: colors.onPrimary,
    marginBottom: 4,
  },
  journeyText: {
    ...typography.body2,
    color: colors.onPrimary,
  },
  graphContainer: {
    height: 240,
    backgroundColor: colors.surfaceColor,
    borderRadius: 8,
    overflow: 'hidden',
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    backgroundColor: colors.surfaceColor,
    borderRadius: 8,
  },
  emptyStateText: {
    ...typography.body2,
    color: colors.textSecondary,
    marginTop: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  generateButton: {
    ...commonStyles.button,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  generateButtonText: {
    ...commonStyles.buttonText,
    marginRight: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    ...typography.body1,
    color: colors.textSecondary,
    marginTop: 16,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    ...typography.body1,
    color: colors.error,
    marginBottom: 8,
    textAlign: 'center',
  },
  errorDetail: {
    ...typography.body2,
    color: colors.error,
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  retryButton: {
    ...commonStyles.button,
  },
  retryButtonText: {
    ...commonStyles.buttonText,
  },
});

export default LearnerHome;