import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '../lib/queryClient';
import { colors, typography } from '../styles/theme';
import { BarChart2, BookOpen, Award, FileText, Download, Users } from 'react-feather';

const ReportsPage: React.FC = () => {
  const { user } = useAuth();
  const [selectedLearnerId, setSelectedLearnerId] = useState<number | null>(null);
  const [selectedReportType, setSelectedReportType] = useState<string>('progress');

  // Fetch learners
  const {
    data: learners,
    isLoading: learnersLoading,
    error: learnersError,
  } = useQuery({
    queryKey: ["/api/learners", user?.id, user?.role],
    queryFn: () => {
      if (user?.role === 'ADMIN') {
        // For admin users, we need to provide a parentId
        // As this is just for testing, we'll use the admin's own ID to avoid the 400 error
        return apiRequest('GET', `/api/learners?parentId=${user.id}`).then(res => res.data);
      } else if (user?.role === 'PARENT') {
        // Parent users automatically use their own ID
        return apiRequest('GET', "/api/learners").then(res => res.data);
      }
      return Promise.resolve([]);
    },
    enabled: (user?.role === 'PARENT' || user?.role === 'ADMIN') && !!user?.id,
  });

  // Auto-select first learner when data loads
  useEffect(() => {
    if (learners && learners.length > 0 && selectedLearnerId === null) {
      setSelectedLearnerId(learners[0].id);
    }
  }, [learners, selectedLearnerId]);

  // Fetch report data
  const {
    data: reportData,
    isLoading: reportLoading,
    error: reportError,
  } = useQuery({
    queryKey: [`/api/reports`, selectedLearnerId, selectedReportType],
    queryFn: () => apiRequest('GET', `/api/reports?learnerId=${selectedLearnerId}&type=${selectedReportType}`).then(res => res.data),
    enabled: !!selectedLearnerId,
  });

  // Extract data based on report type
  const learnerProfile = reportData?.profile;
  const lessons = selectedReportType === 'lessons' ? reportData?.lessons : 
                 (reportData?.analytics ? [] : []);
  const achievements = selectedReportType === 'achievements' ? reportData?.achievements : [];
  const analytics = reportData?.analytics;

  const isLoading = learnersLoading || (selectedLearnerId && reportLoading);
  const hasError = learnersError || reportError;

  const handleDownloadReport = () => {
    if (!selectedLearnerId) return;
    window.open(`/api/export?learnerId=${selectedLearnerId}`, '_blank');
  };

  const getLearnerName = () => {
    if (!selectedLearnerId || !learners) return 'Select a learner';
    const learner = learners.find((l: any) => l.id === selectedLearnerId);
    return learner ? learner.name : 'Unknown Learner';
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Learning Reports</Text>
        <Text style={styles.headerSubtitle}>View and export detailed learning analytics</Text>
      </View>

      <View style={styles.contentContainer}>
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
        ) : hasError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Error loading data. Please try again.</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/learners", user?.id, user?.role] });
                if (selectedLearnerId) {
                  queryClient.invalidateQueries({ queryKey: [`/api/reports`, selectedLearnerId, selectedReportType] });
                }
              }}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : !learners || learners.length === 0 ? (
          <View style={styles.emptySelection}>
            <Users size={48} color={colors.textSecondary} />
            <Text style={styles.emptySelectionTitle}>No Learners Yet</Text>
            <Text style={styles.emptySelectionText}>
              Add a child from your dashboard to start viewing reports.
            </Text>
          </View>
        ) : (
          <ScrollView>
            <View style={styles.controlsContainer}>
              {learners && learners.length > 1 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Select Learner</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.learnersScroll}>
                    {learners.map((learner: any) => (
                      <TouchableOpacity
                        key={learner.id}
                        style={[styles.learnerButton, selectedLearnerId === learner.id && styles.selectedLearnerButton]}
                        onPress={() => setSelectedLearnerId(learner.id)}
                      >
                        <Text
                          style={[styles.learnerButtonText, selectedLearnerId === learner.id && styles.selectedLearnerButtonText]}
                        >
                          {learner.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {selectedLearnerId && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Report Type</Text>
                  <View style={styles.reportTypeContainer}>
                    <TouchableOpacity 
                      style={[styles.reportTypeButton, selectedReportType === 'progress' && styles.selectedReportTypeButton]}
                      onPress={() => setSelectedReportType('progress')}
                    >
                      <BarChart2 size={20} color={selectedReportType === 'progress' ? colors.onPrimary : colors.primary} />
                      <Text style={[styles.reportTypeText, selectedReportType === 'progress' && styles.selectedReportTypeText]}>Progress</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.reportTypeButton, selectedReportType === 'lessons' && styles.selectedReportTypeButton]}
                      onPress={() => setSelectedReportType('lessons')}
                    >
                      <BookOpen size={20} color={selectedReportType === 'lessons' ? colors.onPrimary : colors.primary} />
                      <Text style={[styles.reportTypeText, selectedReportType === 'lessons' && styles.selectedReportTypeText]}>Lessons</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.reportTypeButton, selectedReportType === 'achievements' && styles.selectedReportTypeButton]}
                      onPress={() => setSelectedReportType('achievements')}
                    >
                      <Award size={20} color={selectedReportType === 'achievements' ? colors.onPrimary : colors.primary} />
                      <Text style={[styles.reportTypeText, selectedReportType === 'achievements' && styles.selectedReportTypeText]}>Achievements</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {selectedLearnerId && (
              <View style={styles.reportContainer}>
                <View style={styles.reportHeader}>
                  <View>
                    <Text style={styles.reportTitle}>{getLearnerName()}'s {selectedReportType.charAt(0).toUpperCase() + selectedReportType.slice(1)} Report</Text>
                    <Text style={styles.reportDate}>Generated on {new Date().toLocaleDateString()}</Text>
                  </View>
                  <TouchableOpacity 
                    style={styles.downloadButton}
                    onPress={handleDownloadReport}
                  >
                    <Download size={16} color={colors.onPrimary} />
                    <Text style={styles.downloadButtonText}>Download Full Report</Text>
                  </TouchableOpacity>
                </View>

                {selectedReportType === 'progress' && (
                  <View style={styles.reportContent}>
                    <View style={styles.statsContainer}>
                      <View style={styles.statCard}>
                        <Text style={styles.statValue}>{analytics?.conceptsLearned || 0}</Text>
                        <Text style={styles.statLabel}>Concepts Learned</Text>
                      </View>
                      <View style={styles.statCard}>
                        <Text style={styles.statValue}>{analytics?.lessonsCompleted || 0}</Text>
                        <Text style={styles.statLabel}>Lessons Completed</Text>
                      </View>
                      <View style={styles.statCard}>
                        <Text style={styles.statValue}>{analytics?.achievementsCount || 0}</Text>
                        <Text style={styles.statLabel}>Achievements</Text>
                      </View>
                    </View>

                    <Text style={styles.reportSectionTitle}>Learning Progress</Text>
                    <View style={styles.progressContainer}>
                      <View style={styles.progressBarContainer}>
                        <View 
                          style={[
                            styles.progressBar, 
                            { width: `${analytics?.progressRate || 0}%` }
                          ]} 
                        />
                      </View>
                      <Text style={styles.progressText}>
                        {Math.round(analytics?.progressRate || 0)}% Complete
                      </Text>
                    </View>

                    <Text style={styles.reportSectionTitle}>Subject Distribution</Text>
                    <View style={styles.subjectDistribution}>
                      {analytics?.subjectDistribution && Object.keys(analytics.subjectDistribution).length > 0 ? (
                        Object.entries(analytics.subjectDistribution).map(([subject, count], index) => (
                          <View key={index} style={styles.subjectItem}>
                            <View style={styles.subjectItemHeader}>
                              <Text style={styles.subjectName}>{subject}</Text>
                              <Text style={styles.subjectCount}>{count as number} lessons</Text>
                            </View>
                            <View style={styles.subjectBarContainer}>
                              <View 
                                style={[
                                  styles.subjectBar, 
                                  { 
                                    width: `${(count as number / analytics.totalLessons) * 100}%`,
                                    backgroundColor: 
                                      index % 4 === 0 ? colors.primary : 
                                      index % 4 === 1 ? colors.secondary : 
                                      index % 4 === 2 ? colors.accent1 : 
                                      colors.accent2
                                  }
                                ]} 
                              />
                            </View>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.emptyStateText}>No subjects recorded yet.</Text>
                      )}
                    </View>

                    <Text style={styles.reportSectionTitle}>Knowledge Areas</Text>
                    <View style={styles.knowledgeAreas}>
                      {learnerProfile?.graph?.nodes ? (
                        learnerProfile.graph.nodes.slice(0, 5).map((node: any, index: number) => (
                          <View key={index} style={styles.knowledgeArea}>
                            <Text style={styles.knowledgeAreaName}>{node.label}</Text>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.emptyStateText}>No knowledge areas recorded yet.</Text>
                      )}
                    </View>
                  </View>
                )}

                {selectedReportType === 'lessons' && (
                  <View style={styles.reportContent}>
                    <Text style={styles.reportSectionTitle}>Recent Lessons</Text>
                    {lessons && lessons.length > 0 ? (
                      lessons.slice(0, 5).map((lesson: any, index: number) => (
                        <View key={index} style={styles.lessonItem}>
                          <View style={styles.lessonItemContent}>
                            <Text style={styles.lessonTitle}>{lesson.spec?.title || 'Untitled Lesson'}</Text>
                            <Text style={styles.lessonDate}>
                              {new Date(lesson.createdAt).toLocaleDateString()}
                            </Text>
                          </View>
                          <View style={[styles.lessonStatus, {
                            backgroundColor: lesson.status === 'DONE' 
                              ? colors.success + '33' 
                              : lesson.status === 'ACTIVE' 
                                ? colors.warning + '33' 
                                : colors.textSecondary + '33'
                          }]}>
                            <Text style={[styles.lessonStatusText, {
                              color: lesson.status === 'DONE' 
                                ? colors.success 
                                : lesson.status === 'ACTIVE' 
                                  ? colors.warning 
                                  : colors.textSecondary
                            }]}>
                              {lesson.status}
                            </Text>
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.emptyStateText}>No lessons recorded yet.</Text>
                    )}
                  </View>
                )}

                {selectedReportType === 'achievements' && (
                  <View style={styles.reportContent}>
                    <Text style={styles.reportSectionTitle}>Achievements Earned</Text>
                    {achievements && achievements.length > 0 ? (
                      achievements.map((achievement: any, index: number) => (
                        <View key={index} style={styles.achievementItem}>
                          <Award size={24} color={colors.warning} />
                          <View style={styles.achievementContent}>
                            <Text style={styles.achievementTitle}>{achievement.title}</Text>
                            <Text style={styles.achievementDescription}>{achievement.description}</Text>
                            <Text style={styles.achievementDate}>
                              Earned on {(achievement.awardedAt ? new Date(achievement.awardedAt).toLocaleDateString() : 'Unknown date')}
                            </Text>
                          </View>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.emptyStateText}>No achievements earned yet.</Text>
                    )}
                  </View>
                )}
              </View>
            )}

            {!selectedLearnerId && (
              <View style={styles.emptySelection}>
                <FileText size={48} color={colors.textSecondary} />
                <Text style={styles.emptySelectionTitle}>Select a Learner</Text>
                <Text style={styles.emptySelectionText}>Choose a learner from the list above to view their reports.</Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Progress bar styles
  progressContainer: {
    marginBottom: 24,
  },
  progressBarContainer: {
    height: 12,
    backgroundColor: colors.background,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.success,
    borderRadius: 6,
  },
  progressText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'right',
  },
  // Subject distribution styles
  subjectDistribution: {
    marginBottom: 24,
  },
  subjectItem: {
    marginBottom: 12,
  },
  subjectItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  subjectName: {
    ...typography.body2,
    color: colors.text,
    fontWeight: 'bold',
  },
  subjectCount: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  subjectBarContainer: {
    height: 8,
    backgroundColor: colors.background,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  subjectBar: {
    height: '100%',
    borderRadius: 4,
  },
  
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primary,
    paddingVertical: 24,
    paddingHorizontal: 24,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.onPrimary,
    marginBottom: 8,
  },
  headerSubtitle: {
    ...typography.subtitle1,
    color: colors.onPrimary,
    opacity: 0.9,
  },
  contentContainer: {
    flex: 1,
    padding: 24,
  },
  loader: {
    marginTop: 32,
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    ...typography.body2,
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
  controlsContainer: {
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    ...typography.h6,
    color: colors.text,
    marginBottom: 16,
  },
  learnersScroll: {
    flexDirection: 'row',
  },
  learnerButton: {
    backgroundColor: colors.surfaceColor,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedLearnerButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  learnerButtonText: {
    ...typography.body2,
    color: colors.text,
  },
  selectedLearnerButtonText: {
    color: colors.onPrimary,
  },
  reportTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  reportTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceColor,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginRight: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectedReportTypeButton: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  reportTypeText: {
    ...typography.button,
    color: colors.primary,
    marginLeft: 8,
  },
  selectedReportTypeText: {
    color: colors.onPrimary,
  },
  reportContainer: {
    backgroundColor: colors.surfaceColor,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.1)',
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceColor,
  },
  reportTitle: {
    ...typography.h6,
    color: colors.text,
  },
  reportDate: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  downloadButtonText: {
    ...typography.caption,
    color: colors.onPrimary,
    marginLeft: 4,
  },
  reportContent: {
    padding: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 16,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
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
  reportSectionTitle: {
    ...typography.subtitle1,
    color: colors.text,
    marginBottom: 16,
    marginTop: 8,
  },
  knowledgeAreas: {
    marginBottom: 16,
  },
  knowledgeArea: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  knowledgeAreaName: {
    ...typography.body2,
    color: colors.text,
  },
  lessonItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lessonItemContent: {
    flex: 1,
  },
  lessonTitle: {
    ...typography.subtitle2,
    color: colors.text,
    marginBottom: 4,
  },
  lessonDate: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  lessonStatus: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  lessonStatusText: {
    ...typography.caption,
    fontWeight: 'bold',
  },
  achievementItem: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'flex-start',
  },
  achievementContent: {
    marginLeft: 12,
    flex: 1,
  },
  achievementTitle: {
    ...typography.subtitle2,
    color: colors.text,
    marginBottom: 4,
  },
  achievementDescription: {
    ...typography.body2,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  achievementDate: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  emptyStateText: {
    ...typography.body2,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 16,
  },
  emptySelection: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    backgroundColor: colors.surfaceColor,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  emptySelectionTitle: {
    ...typography.h6,
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySelectionText: {
    ...typography.body2,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },
});

export default ReportsPage;