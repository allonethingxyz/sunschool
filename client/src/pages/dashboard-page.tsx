import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image, Linking } from 'react-native';
import { useAuth } from '../hooks/use-auth';
import { colors, typography, commonStyles } from '../styles/theme';
import { Link, useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';
import KnowledgeGraph from '../components/KnowledgeGraph';
import { BookOpen, Target, Award, BarChart2, Plus, ArrowRight, User } from 'react-feather';
import { useMode } from '../context/ModeContext';
import ModeToggle from '../components/ModeToggle';

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

      {/* View button */}
      <TouchableOpacity style={styles.childViewButton} onPress={onView}>
        <User size={14} color={colors.onPrimary} />
        <Text style={styles.childViewButtonText}>View</Text>
        <ArrowRight size={14} color={colors.onPrimary} />
      </TouchableOpacity>
    </View>
  );
};

const DashboardPage: React.FC = () => {
  const { user, logoutMutation } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toggleMode, isLearnerMode, selectLearner, availableLearners } = useMode();
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'create', 'progress', 'active'
  const learnerId = user?.role === 'LEARNER' ? user.id : null;

  // Onboarding dismiss state
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const seen = window.localStorage.getItem('hasSeenOnboarding');
      if (!seen && (user?.role === 'PARENT' || user?.role === 'ADMIN')) {
        setShowOnboarding(true);
      }
    }
  }, [user]);

  const dismissOnboarding = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('hasSeenOnboarding', 'true');
    }
    setShowOnboarding(false);
  };

  // Fetch learners for the children overview (parents / admins)
  const {
    data: learners,
    isLoading: learnersLoading,
  } = useQuery<any[]>({
    queryKey: ['/api/learners'],
    queryFn: () => apiRequest('GET', '/api/learners').then((res: any) => res.data ?? res),
    enabled: user?.role === 'PARENT' || user?.role === 'ADMIN',
  });

  // Fetch active lesson
  const {
    data: activeLesson,
    isLoading: lessonLoading,
    error: lessonError,
  } = useQuery({
    queryKey: [`/api/lessons/active`],
    queryFn: () => apiRequest('GET', `/api/lessons/active`).then(res => res.data),
    enabled: user?.role === 'LEARNER',
  });

  // Fetch learner profile for knowledge graph
  const {
    data: profile,
    isLoading: profileLoading,
  } = useQuery({
    queryKey: [`/api/learner-profile/${learnerId}`],
    queryFn: () => apiRequest('GET', `/api/learner-profile/${learnerId}`).then(res => res.data),
    enabled: !!learnerId,
  });

  // Fetch achievements
  const {
    data: achievements,
    isLoading: achievementsLoading,
  } = useQuery({
    queryKey: [`/api/achievements?learnerId=${learnerId}`],
    queryFn: () => apiRequest('GET', `/api/achievements?learnerId=${learnerId}`).then(res => res.data),
    enabled: !!learnerId,
  });

  // Fetch lesson history
  const {
    data: lessons,
    isLoading: lessonsHistoryLoading,
  } = useQuery({
    queryKey: [`/api/lessons?learnerId=${learnerId}`],
    queryFn: () => apiRequest('GET', `/api/lessons?learnerId=${learnerId}`).then(res => res.data),
    enabled: !!learnerId,
  });

  // For creating a new lesson
  const [topic, setTopic] = useState('');
  const [gradeLevel, setGradeLevel] = useState('5');
  const [isGenerating, setIsGenerating] = useState(false);

  // Navigate to create lesson page
  const handleCreateLesson = () => {
    setLocation('/create-lesson');
  };

  // Navigate to active lesson
  const handleContinueLesson = () => {
    if (activeLesson?.id) {
      setLocation(`/lesson/${activeLesson.id}`);
    }
  };

  // Navigate to progress page
  const handleViewProgress = () => {
    setLocation('/progress');
  };

  // Handle "View" on a child card -- switch into that learner's mode
  const handleViewChild = (learner: { id: number; name: string; email: string; role: string }) => {
    selectLearner(learner);
  };

  return (
    <View style={styles.container}>
      <View style={styles.pageTitle}>
        <Text style={styles.welcomeText}>Welcome, {user?.name || 'User'}!</Text>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'overview' && styles.activeTab]}
          onPress={() => setActiveTab('overview')}
        >
          <BookOpen size={20} color={activeTab === 'overview' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.tabText, activeTab === 'overview' && styles.activeTabText]}>Overview</Text>
        </TouchableOpacity>

        {user?.role === 'LEARNER' && (
          <TouchableOpacity
            style={[styles.tab, activeTab === 'create' && styles.activeTab]}
            onPress={() => setActiveTab('create')}
          >
            <Plus size={20} color={activeTab === 'create' ? colors.primary : colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'create' && styles.activeTabText]}>Create Lesson</Text>
          </TouchableOpacity>
        )}

        {user?.role === 'LEARNER' && (
          <TouchableOpacity
            style={[styles.tab, activeTab === 'progress' && styles.activeTab]}
            onPress={() => setActiveTab('progress')}
          >
            <BarChart2 size={20} color={activeTab === 'progress' ? colors.primary : colors.textSecondary} />
            <Text style={[styles.tabText, activeTab === 'progress' && styles.activeTabText]}>My Progress</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content}>
        {activeTab === 'overview' && (
          <View>
            {user?.role === 'ADMIN' && (
              <View style={styles.adminSection}>
                <Text style={styles.sectionTitle}>Admin Tools</Text>
                <Link href="/admin">
                  <View style={styles.linkButton}>
                    <Text style={styles.linkButtonText}>Go to Admin Panel</Text>
                  </View>
                </Link>
              </View>
            )}

            {user?.role === 'LEARNER' && (
              <View>
                <View style={styles.featureCard}>
                  <View style={styles.featureIconContainer}>
                    <BookOpen size={32} color={colors.primary} />
                  </View>
                  <View style={styles.featureContent}>
                    <Text style={styles.featureTitle}>AI-Generated Lessons</Text>
                    <Text style={styles.featureDescription}>
                      Create personalized lessons on any topic using our AI tutor
                    </Text>
                    <TouchableOpacity
                      style={styles.featureButton}
                      onPress={handleCreateLesson}
                    >
                      <Text style={styles.featureButtonText}>Create New Lesson</Text>
                      <ArrowRight size={16} color={colors.onPrimary} />
                    </TouchableOpacity>
                  </View>
                </View>

                {activeLesson && (
                  <View style={styles.featureCard}>
                    <View style={styles.featureIconContainer}>
                      <Target size={32} color={colors.primary} />
                    </View>
                    <View style={styles.featureContent}>
                      <Text style={styles.featureTitle}>Continue Learning</Text>
                      <Text style={styles.featureDescription}>
                        You have an active lesson on {activeLesson.spec?.title || 'a topic'}
                      </Text>
                      <TouchableOpacity
                        style={styles.featureButton}
                        onPress={handleContinueLesson}
                      >
                        <Text style={styles.featureButtonText}>Continue Lesson</Text>
                        <ArrowRight size={16} color={colors.onPrimary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <View style={styles.featureCard}>
                  <View style={styles.featureIconContainer}>
                    <Award size={32} color={colors.primary} />
                  </View>
                  <View style={styles.featureContent}>
                    <Text style={styles.featureTitle}>Learning Progress</Text>
                    <Text style={styles.featureDescription}>
                      Track your learning journey with visualizations and achievements
                    </Text>
                    <TouchableOpacity
                      style={styles.featureButton}
                      onPress={handleViewProgress}
                    >
                      <Text style={styles.featureButtonText}>View Progress</Text>
                      <ArrowRight size={16} color={colors.onPrimary} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {(user?.role === 'PARENT' || user?.role === 'ADMIN') && (
              <>
                {/* One-time onboarding welcome */}
                {showOnboarding && (
                  <View style={styles.onboardingBanner}>
                    <Text style={styles.onboardingBannerTitle}>
                      Welcome to Sunschool AI Tutor!
                    </Text>
                    <Text style={styles.onboardingBannerText}>
                      Add your children below, then tap "View" on any child to experience
                      personalized AI lessons from their perspective. You can track their
                      progress, achievements, and knowledge growth right from this dashboard.
                    </Text>
                    <TouchableOpacity
                      style={styles.onboardingDismissButton}
                      onPress={dismissOnboarding}
                    >
                      <Text style={styles.onboardingDismissButtonText}>Got it!</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Children Overview Section */}
                <View style={styles.childrenSection}>
                  <Text style={styles.sectionTitle}>Children Overview</Text>

                  {learnersLoading ? (
                    <ActivityIndicator
                      size="large"
                      color={colors.primary}
                      style={{ marginVertical: 24 }}
                    />
                  ) : learners && learners.length > 0 ? (
                    learners.map((learner: any) => (
                      <ChildCard
                        key={learner.id}
                        learner={learner}
                        onView={() => handleViewChild(learner)}
                      />
                    ))
                  ) : (
                    <View style={styles.emptyChildrenState}>
                      <User size={36} color={colors.textSecondary} />
                      <Text style={styles.emptyChildrenText}>
                        No children added yet. Add a child to get started with personalized learning.
                      </Text>
                    </View>
                  )}

                  {/* + Add Child button */}
                  <TouchableOpacity
                    style={styles.addChildButton}
                    onPress={() => setLocation('/learners')}
                  >
                    <Plus size={18} color={colors.onPrimary} />
                    <Text style={styles.addChildButtonText}>Add Child</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.contentSection}>
                  <Text style={styles.sectionTitle}>Learner Management</Text>
                  <Link href="/learners">
                    <Text style={styles.linkText}>Manage Learners</Text>
                  </Link>
                  <Link href="/reports">
                    <Text style={styles.linkText}>View Reports</Text>
                  </Link>
                  <Link href="/database-sync">
                    <Text style={styles.linkText}>Database Synchronization</Text>
                  </Link>
                  <Link href="/rewards">
                    <Text style={styles.linkText}>🎁 Rewards Center</Text>
                  </Link>
                </View>

                <View style={styles.modeToggleSection}>
                  <View style={styles.modeToggleContent}>
                    <View style={styles.modeToggleHeader}>
                      <Text style={styles.sectionTitle}>Switch to Sunschool Learner Mode</Text>
                      <View style={styles.modeToggleIcon}>
                        <ModeToggle />
                      </View>
                    </View>

                    <Text style={styles.modeToggleDescription}>
                      Click the toggle button in the top-right corner to switch to Sunschool Learner Mode and see the app from a learner's perspective.
                    </Text>

                    <TouchableOpacity
                      style={styles.modeToggleButton}
                      onPress={toggleMode}
                    >
                      <User size={16} color={colors.onPrimary} />
                      <Text style={styles.modeToggleButtonText}>Go to Sunschool Learner Mode</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}
          </View>
        )}

        {activeTab === 'create' && user?.role === 'LEARNER' && (
          <View style={styles.createLessonContainer}>
            <Text style={styles.sectionTitle}>Create a New AI Lesson</Text>
            <Text style={styles.sectionDescription}>
              Our AI will generate a personalized educational lesson on any topic you choose!
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleCreateLesson}
            >
              <Text style={styles.primaryButtonText}>Start Creating</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTab === 'progress' && user?.role === 'LEARNER' && (
          <View>
            <View style={styles.statsContainer}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {profile?.graph?.nodes?.length || 0}
                </Text>
                <Text style={styles.statLabel}>Concepts Learned</Text>
              </View>

              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {lessons?.filter((l: any) => l.status === 'DONE').length || 0}
                </Text>
                <Text style={styles.statLabel}>Lessons Completed</Text>
              </View>

              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {achievements?.length || 0}
                </Text>
                <Text style={styles.statLabel}>Achievements</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Knowledge Graph</Text>
            <View style={styles.graphContainer}>
              {profile?.graph?.nodes && profile.graph.nodes.length > 0 ? (
                <KnowledgeGraph graph={profile.graph} />
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>
                    No knowledge graph data available yet. Complete lessons to build your knowledge graph.
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.viewMoreButton}
              onPress={handleViewProgress}
            >
              <Text style={styles.viewMoreButtonText}>View Detailed Progress</Text>
              <ArrowRight size={16} color={colors.primary} />
            </TouchableOpacity>
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
  },
  pageTitle: {
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 24,
  },
  trademark: {
    ...typography.h4,
    color: colors.onPrimary,
    marginLeft: 4,
    fontWeight: 'bold',
  },
  welcomeText: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
  },
  tab: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    ...typography.button,
    color: colors.textSecondary,
    marginLeft: 8,
  },
  activeTabText: {
    color: colors.primary,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  adminSection: {
    backgroundColor: colors.warning + '33',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  contentSection: {
    backgroundColor: colors.surfaceColor,
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    ...typography.h6,
    marginBottom: 16,
    color: colors.text,
  },
  sectionDescription: {
    ...typography.body2,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  linkButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 4,
    alignItems: 'center',
  },
  linkButtonText: {
    ...typography.button,
    color: colors.onPrimary,
  },
  linkText: {
    ...typography.body1,
    color: colors.primary,
    marginBottom: 12,
  },
  featureCard: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceColor,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
  },
  featureIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    ...typography.h6,
    marginBottom: 4,
    color: colors.text,
  },
  featureDescription: {
    ...typography.body2,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  featureButton: {
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
  },
  featureButtonText: {
    ...typography.button,
    color: colors.onPrimary,
    marginRight: 8,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 4,
    alignItems: 'center',
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.onPrimary,
  },
  createLessonContainer: {
    backgroundColor: colors.surfaceColor,
    padding: 24,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 3,
    alignItems: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceColor,
    borderRadius: 8,
    padding: 16,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 1,
  },
  statValue: {
    ...typography.h3,
    color: colors.primary,
    marginBottom: 4,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  graphContainer: {
    height: 300,
    backgroundColor: colors.surfaceColor,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyStateText: {
    ...typography.body2,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  viewMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignSelf: 'center',
  },
  viewMoreButtonText: {
    ...typography.button,
    color: colors.primary,
    marginRight: 8,
  },
  modeToggleSection: {
    backgroundColor: colors.surfaceColor,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
    overflow: 'hidden',
  },
  modeToggleContent: {
    padding: 16,
  },
  modeToggleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modeToggleIcon: {
    marginRight: 8,
  },
  modeToggleDescription: {
    ...typography.body2,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  modeToggleButton: {
    backgroundColor: colors.secondary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 4,
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
  },
  modeToggleButtonText: {
    ...typography.button,
    color: colors.onPrimary,
    marginLeft: 8,
  },

  // ------------------------------------------------------------------
  // One-time onboarding banner
  // ------------------------------------------------------------------
  onboardingBanner: {
    backgroundColor: colors.surfaceColor,
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.primary + '40',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  onboardingBannerTitle: {
    ...typography.h4,
    color: colors.primary,
    marginBottom: 12,
    fontWeight: '700',
  },
  onboardingBannerText: {
    ...typography.body2,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 16,
  },
  onboardingDismissButton: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  onboardingDismissButtonText: {
    ...typography.button,
    color: colors.onPrimary,
  },

  // ------------------------------------------------------------------
  // Children Overview
  // ------------------------------------------------------------------
  childrenSection: {
    marginBottom: 24,
  },
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

  emptyChildrenState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  emptyChildrenText: {
    ...typography.body2,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },

  addChildButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  addChildButtonText: {
    ...typography.button,
    color: colors.onPrimary,
    marginLeft: 8,
  },
});

export default DashboardPage;
