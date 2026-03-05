import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Switch,
} from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiRequest, queryClient } from '../lib/queryClient';
import { useTheme, colors, typography, commonStyles } from '../styles/theme';
import QuizComponent, { QuizQuestion } from '../components/QuizComponent';
import Confetti from '../components/Confetti';
import AchievementUnlock from '../components/AchievementUnlock';
import FunLoader from '../components/FunLoader';
import QuizProgressStepper from '../components/QuizProgressStepper';
import { ArrowLeft, CheckCircle, AlertCircle, Zap } from 'react-feather';
import { useMode } from '../context/ModeContext';

const QuizPage = ({ params }: { params?: { lessonId?: string } }) => {
  const lessonId = params?.lessonId;
  
  if (!lessonId) {
    const [, setLocation] = useLocation();
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            Missing lesson ID. Please return to your active lesson.
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setLocation('/lesson')}
          >
            <Text style={styles.backButtonText}>Go Back to Lesson</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  const [, setLocation] = useLocation();
  const theme = useTheme();
  const { selectedLearner } = useMode();
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [quizStarted, setQuizStarted] = useState(false);
  const [doubleOrLoss, setDoubleOrLoss] = useState(false);
  const [showDelegation, setShowDelegation] = useState(false);
  const [quizScore, setQuizScore] = useState<{
    score: number;
    correctCount: number;
    totalQuestions: number;
    wrongCount: number;
    pointsAwarded: number;
    pointsDeducted: number;
    doubleOrLoss: boolean;
    newBalance: number;
    newAchievements: any[];
  } | null>(null);

  const learnerId = selectedLearner?.id;

  // Fetch the specific lesson
  const {
    data: lesson,
    error,
    isLoading,
  } = useQuery({
    queryKey: [`/api/lessons/${lessonId}`],
    queryFn: () => apiRequest('GET', `/api/lessons/${lessonId}`).then(res => res.data),
    retry: 1,
  });

  // Fetch learner's double-or-loss setting from parent
  const { data: learnerSettings } = useQuery({
    queryKey: [`/api/learner-settings/${learnerId}`],
    queryFn: () => apiRequest('GET', `/api/learner-settings/${learnerId}`).then(r => r.data),
    enabled: !!learnerId,
  });
  const dolAllowedByParent = learnerSettings?.doubleOrLossEnabled ?? false;

  // Fetch available reward goals for delegation
  const { data: rewardGoals = [] } = useQuery<any[]>({
    queryKey: ['/api/rewards', learnerId],
    queryFn: () => apiRequest('GET', `/api/rewards?learnerId=${learnerId}`).then(r => r.data),
    enabled: !!learnerId,
    retry: false,
  });

  // Submit answers mutation
  const submitAnswersMutation = useMutation({
    mutationFn: (answers: number[]) => {
      return apiRequest('POST', `/api/lessons/${lessonId}/answer`, { answers, doubleOrLoss }).then(res => res.data);
    },
    onSuccess: (data) => {
      setQuizSubmitted(true);
      setQuizScore(data);
      if (data.score >= 70) setShowConfetti(true);
      if (data.newAchievements && data.newAchievements.length > 0) {
        setTimeout(() => setShowAchievements(true), 1500);
      }
      // Show delegation screen if points were earned and goals exist
      if (data.pointsAwarded > 0 && rewardGoals.length > 0) {
        setTimeout(() => setShowDelegation(true), 2500);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/lessons/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/achievements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons/history'] });
      queryClient.invalidateQueries({ queryKey: ['/api/points'] });
      queryClient.invalidateQueries({ queryKey: ['/api/points/balance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/mastery'] });
      if (lesson?.learnerId) {
        queryClient.invalidateQueries({ queryKey: ['/api/learner-profile', lesson.learnerId] });
      }
    },
  });

  const handleSelectAnswer = (questionIndex: number, answerIndex: number) => {
    if (quizSubmitted) return; // Don't allow changes after submission
    
    const newAnswers = [...selectedAnswers];
    newAnswers[questionIndex] = answerIndex;
    setSelectedAnswers(newAnswers);
  };

  // Use enhancedSpec questions when available, fall back to spec.questions
  const displayQuestions: QuizQuestion[] = (() => {
    if (!lesson) return [];
    if (lesson.enhancedSpec?.questions?.length) return lesson.enhancedSpec.questions;
    return lesson.spec?.questions ?? [];
  })();

  const handleStartQuiz = () => setQuizStarted(true);

  const handleSubmitQuiz = () => {
    if (lesson && selectedAnswers.length === displayQuestions.length) {
      const hasAllAnswers = selectedAnswers.every(ans => ans !== undefined);
      if (hasAllAnswers) {
        submitAnswersMutation.mutate(selectedAnswers);
      } else {
        alert('Please answer all questions before submitting.');
      }
    } else {
      alert('Please answer all questions before submitting.');
    }
  };

  const handleContinue = () => {
    // Redirect to learner home to see the new auto-generated lesson
    setLocation('/learner');
  };

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            Error loading quiz. Please try again.
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setLocation('/learner')}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading || submitAnswersMutation.isPending) {
    return (
      <SafeAreaView style={styles.container}>
        <FunLoader
          message={submitAnswersMutation.isPending ? undefined : undefined}
          progressMessages={
            submitAnswersMutation.isPending
              ? ['Checking your answers...', 'Almost done...', 'Calculating your score!']
              : ['Getting your challenge ready...', 'Almost there...', 'Here it comes!']
          }
        />
      </SafeAreaView>
    );
  }

  if (!lesson || (!lesson.spec?.questions && !lesson.enhancedSpec?.questions)) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            Quiz not found. Please return to the lesson.
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setLocation('/lesson')}
          >
            <Text style={styles.backButtonText}>Go Back to Lesson</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Point delegation save helper ──
  const saveDelegation = (rewardId: string, pts: number) => {
    if (pts <= 0 || !learnerId) return;
    apiRequest('POST', `/api/rewards/${rewardId}/save?learnerId=${learnerId}`, { points: pts })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/rewards', learnerId] });
        queryClient.invalidateQueries({ queryKey: ['/api/points/balance'] });
      })
      .catch(e => console.error('Delegation error:', e));
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Confetti for good scores */}
      <Confetti active={showConfetti} onComplete={() => setShowConfetti(false)} />

      {/* Achievement unlock modal */}
      {quizScore?.newAchievements && quizScore.newAchievements.length > 0 && (
        <AchievementUnlock
          achievements={quizScore.newAchievements.map(a => ({
            title: a.title || a.payload?.title || 'Achievement Unlocked!',
            description: a.description || a.payload?.description,
            type: a.type,
          }))}
          visible={showAchievements}
          onDismiss={() => setShowAchievements(false)}
        />
      )}

      {/* ── Point delegation overlay ── */}
      {showDelegation && quizScore && rewardGoals.length > 0 && (
        <View style={styles.delegationOverlay}>
          <View style={[styles.delegationBox, { backgroundColor: theme.colors.surfaceColor }]}>
            <Text style={[styles.delegationTitle, { color: theme.colors.textPrimary }]}>
              🎉 You earned {quizScore.pointsAwarded} pts!
            </Text>
            <Text style={[styles.delegationSub, { color: theme.colors.textSecondary }]}>
              Save them toward a reward goal:
            </Text>
            <ScrollView style={{ maxHeight: 240 }}>
              {rewardGoals.filter((g: any) => g.isActive).map((g: any) => {
                const pct = Math.min(100, Math.round(((g.savedPoints ?? 0) / g.tokenCost) * 100));
                return (
                  <TouchableOpacity key={g.id} style={[styles.delegationGoalRow, { borderColor: g.color }]}
                    onPress={() => { saveDelegation(g.id, quizScore.pointsAwarded); setShowDelegation(false); }}>
                    <Text style={{ fontSize: 24 }}>{g.imageEmoji}</Text>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[styles.delegationGoalTitle, { color: theme.colors.textPrimary }]}>{g.title}</Text>
                      <View style={[styles.delegationTrack, { backgroundColor: theme.colors.divider }]}>
                        <View style={[styles.delegationFill, { width: `${pct}%` as any, backgroundColor: g.color }]} />
                      </View>
                      <Text style={[{ fontSize: 11, color: theme.colors.textSecondary }]}>{g.savedPoints}/{g.tokenCost}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={[styles.skipDelegation, { borderColor: theme.colors.divider }]}
              onPress={() => setShowDelegation(false)}>
              <Text style={[{ color: theme.colors.textSecondary, fontWeight: '600' }]}>Keep in Balance</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={[styles.subheader, { backgroundColor: theme.colors.surfaceColor, borderBottomColor: theme.colors.divider }]}>
        {!quizSubmitted && (
          <TouchableOpacity style={styles.backButtonSmall} onPress={() => setLocation('/lesson')}>
            <ArrowLeft size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        )}
        <Text style={[styles.subheaderTitle, { color: theme.colors.textPrimary }]}>
          {quizSubmitted ? 'Your Results' : !quizStarted ? 'Get Ready!' : 'Quick Challenge'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* ── Pre-quiz screen (double-or-loss toggle) ── */}
      {!quizStarted && !quizSubmitted && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={[styles.preQuizCard, { backgroundColor: theme.colors.surfaceColor }]}>
            <Text style={[styles.preQuizTitle, { color: theme.colors.textPrimary }]}>
              Ready for your challenge?
            </Text>
            <Text style={[styles.preQuizSub, { color: theme.colors.textSecondary }]}>
              {displayQuestions.length} question{displayQuestions.length !== 1 ? 's' : ''} · take your time!
            </Text>

            {dolAllowedByParent && (
              <View style={[styles.dolCard, { borderColor: doubleOrLoss ? '#FF8F00' : theme.colors.divider }]}>
                <View style={styles.dolHeader}>
                  <Zap size={20} color="#FF8F00" />
                  <Text style={[styles.dolTitle, { color: theme.colors.textPrimary }]}>Double-or-Loss Mode</Text>
                  <Switch value={doubleOrLoss} onValueChange={setDoubleOrLoss} trackColor={{ true: '#FF8F00' }} />
                </View>
                <Text style={[styles.dolDesc, { color: theme.colors.textSecondary }]}>
                  {doubleOrLoss
                    ? '⚡ ON — 2× points for correct, −1 point for wrong!'
                    : 'OFF — Standard scoring (1 point per correct answer)'}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.startBtn, { backgroundColor: doubleOrLoss ? '#FF8F00' : theme.colors.primary }]}
              onPress={handleStartQuiz}>
              <Text style={styles.startBtnText}>
                {doubleOrLoss ? '⚡ Start Double-or-Loss!' : 'Start Quiz →'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Progress stepper shown while answering questions */}
      {quizStarted && !quizSubmitted && displayQuestions.length > 0 && (
        <QuizProgressStepper
          totalQuestions={displayQuestions.length}
          currentQuestion={selectedAnswers.length > 0
            ? Math.min(selectedAnswers.filter(a => a !== undefined).length, displayQuestions.length - 1)
            : 0}
          answeredQuestions={selectedAnswers}
        />
      )}

      {quizStarted && <ScrollView contentContainerStyle={styles.scrollContent}>
        {quizSubmitted && quizScore ? (
          // Quiz Results View
          <View>
            <View style={[styles.scoreCard, { backgroundColor: theme.colors.surfaceColor }]}>
              <View style={styles.scoreIconContainer}>
                {quizScore.score >= 70 ? (
                  <CheckCircle size={56} color={theme.colors.success} />
                ) : (
                  <AlertCircle size={56} color={theme.colors.warning} />
                )}
              </View>
              <Text style={[styles.scoreTitle, { color: theme.colors.textPrimary }]}>
                {quizScore.score >= 90 ? 'Amazing!' : quizScore.score >= 70 ? 'Great job!' : 'Almost there! Keep going!'}
              </Text>
              <Text style={[styles.scoreText, { color: theme.colors.textSecondary }]}>
                You got {quizScore.correctCount} out of {quizScore.totalQuestions} right
              </Text>
              <View style={[styles.scoreBarContainer, { backgroundColor: theme.colors.divider }]}>
                <View
                  style={[styles.scoreBar, {
                    width: `${quizScore.score}%`,
                    backgroundColor: quizScore.score >= 70 ? theme.colors.success : theme.colors.warning,
                  }]}
                />
              </View>
              <Text style={[styles.scorePercentage, { color: quizScore.score >= 70 ? theme.colors.success : theme.colors.warning }]}>
                {quizScore.score}%
              </Text>

              {/* Points summary */}
              <View style={[styles.pointsSummary, { backgroundColor: theme.colors.background }]}>
                <View style={styles.pointsRow}>
                  <Text style={styles.pointsEmoji}>⭐</Text>
                  <Text style={[styles.pointsLabel, { color: theme.colors.textPrimary }]}>
                    +{quizScore.pointsAwarded ?? 0} pts earned{quizScore.doubleOrLoss ? ' (×2!)' : ''}
                  </Text>
                </View>
                {quizScore.pointsDeducted > 0 && (
                  <View style={styles.pointsRow}>
                    <Text style={styles.pointsEmoji}>⚡</Text>
                    <Text style={[styles.pointsLabel, { color: '#EF5350' }]}>
                      -{quizScore.pointsDeducted} pts (double-or-loss penalty)
                    </Text>
                  </View>
                )}
                <View style={styles.pointsRow}>
                  <Text style={styles.pointsEmoji}>💰</Text>
                  <Text style={[styles.pointsLabel, { color: theme.colors.textSecondary }]}>
                    Balance: {quizScore.newBalance} pts
                  </Text>
                </View>
                {rewardGoals.length > 0 && (
                  <TouchableOpacity style={[styles.goToGoalsBtn, { borderColor: theme.colors.primary }]}
                    onPress={() => setShowDelegation(true)}>
                    <Text style={[styles.goToGoalsBtnText, { color: theme.colors.primary }]}>
                      🎯 Save points to a goal
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {quizScore.newAchievements && quizScore.newAchievements.length > 0 && (
              <View style={[styles.achievementsContainer, { backgroundColor: '#C084FC' }]}>
                <Text style={styles.achievementsTitle}>Trophies Unlocked!</Text>
                {quizScore.newAchievements.map((achievement, index) => (
                  <View key={index} style={styles.achievementItem}>
                    <View style={styles.achievementIcon}>
                      <CheckCircle size={24} color="#FFD93D" />
                    </View>
                    <Text style={styles.achievementText}>{achievement.title}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.reviewSection}>
              <Text style={[styles.reviewTitle, { color: theme.colors.textPrimary }]}>Let's Review</Text>
              {displayQuestions.map((question, index) => (
                <QuizComponent
                  key={index}
                  question={question}
                  selectedAnswer={selectedAnswers[index]}
                  showAnswers={true}
                  onSelectAnswer={() => {}}

                />
              ))}
            </View>

            <TouchableOpacity style={[styles.continueButton, { backgroundColor: theme.colors.success }]} onPress={handleContinue}>
              <Text style={styles.continueButtonText}>Keep Going!</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // Quiz Questions View
          <View>
            <Text style={[styles.quizTitle, { color: theme.colors.textPrimary }]}>
              {(lesson.enhancedSpec?.title ?? lesson.spec?.title ?? '')} Challenge
            </Text>
            <Text style={[styles.quizDescription, { color: theme.colors.textSecondary }]}>
              Let's see what you learned! Answer each question below.
            </Text>

            {displayQuestions.map((question, index) => (
              <View key={index} style={styles.questionContainer}>
                <Text style={[styles.questionNumber, { color: theme.colors.textSecondary }]}>
                  Question {index + 1} of {displayQuestions.length}
                </Text>
                <QuizComponent
                  question={question}
                  selectedAnswer={selectedAnswers[index]}
                  showAnswers={false}
                  onSelectAnswer={(answerIndex) => handleSelectAnswer(index, answerIndex)}

                />
              </View>
            ))}

            <TouchableOpacity
              style={[styles.submitButton, {
                backgroundColor: theme.colors.primary,
                opacity: selectedAnswers.length === displayQuestions.length &&
                         selectedAnswers.every(ans => ans !== undefined) ? 1 : 0.5
              }]}
              onPress={handleSubmitQuiz}
              disabled={selectedAnswers.length !== displayQuestions.length ||
                       !selectedAnswers.every(ans => ans !== undefined)}
            >
              <Text style={[styles.submitButtonText, { color: theme.colors.onPrimary }]}>I'm Done!</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  subheader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: colors.surfaceColor,
  },
  subheaderTitle: {
    ...typography.subtitle1,
    textAlign: 'center',
  },
  backButtonSmall: {
    padding: 4,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
  },
  quizTitle: {
    ...typography.h2,
    marginBottom: 8,
  },
  quizDescription: {
    ...typography.body1,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  questionContainer: {
    marginBottom: 24,
  },
  questionNumber: {
    ...typography.subtitle2,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  submitButton: {
    ...commonStyles.button,
    marginTop: 16,
    marginBottom: 32,
  },
  submitButtonText: {
    ...commonStyles.buttonText,
  },
  scoreCard: {
    backgroundColor: colors.surfaceColor,
    borderRadius: 8,
    padding: 24,
    marginBottom: 24,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  scoreIconContainer: {
    marginBottom: 16,
  },
  scoreTitle: {
    ...typography.h2,
    marginBottom: 8,
    textAlign: 'center',
  },
  scoreText: {
    ...typography.body1,
    color: colors.textSecondary,
    marginBottom: 16,
    textAlign: 'center',
  },
  scoreBarContainer: {
    width: '100%',
    height: 16,
    backgroundColor: colors.divider,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
  },
  scoreBar: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  scorePercentage: {
    ...typography.h3,
    color: colors.primary,
  },
  achievementsContainer: {
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  achievementsTitle: {
    ...typography.h3,
    color: colors.onPrimary,
    marginBottom: 16,
    textAlign: 'center',
  },
  achievementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    padding: 12,
  },
  achievementIcon: {
    marginRight: 12,
  },
  achievementText: {
    ...typography.subtitle1,
    color: colors.onPrimary,
  },
  reviewSection: {
    marginBottom: 24,
  },
  reviewTitle: {
    ...typography.h3,
    marginBottom: 16,
  },
  continueButton: {
    ...commonStyles.button,
    marginTop: 16,
    marginBottom: 32,
    backgroundColor: colors.success,
  },
  continueButtonText: {
    ...commonStyles.buttonText,
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
    marginBottom: 16,
    textAlign: 'center',
  },
  backButton: {
    ...commonStyles.button,
  },
  backButtonText: {
    ...commonStyles.buttonText,
  },
  // Pre-quiz screen
  preQuizCard: {
    margin: 16,
    borderRadius: 16,
    padding: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  preQuizTitle: { fontSize: 22, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  preQuizSub: { fontSize: 14, textAlign: 'center', marginBottom: 20 },
  dolCard: {
    borderWidth: 2, borderRadius: 12, padding: 14, marginBottom: 20,
  },
  dolHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  dolTitle: { flex: 1, fontWeight: '700', fontSize: 15 },
  dolDesc: { fontSize: 13, lineHeight: 18 },
  startBtn: {
    paddingVertical: 16, borderRadius: 12, alignItems: 'center',
  },
  startBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  // Points summary
  pointsSummary: { borderRadius: 12, padding: 14, marginTop: 12 },
  pointsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  pointsEmoji: { fontSize: 18 },
  pointsLabel: { fontSize: 14, fontWeight: '600' },
  goToGoalsBtn: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
  goToGoalsBtnText: { fontWeight: '700', fontSize: 14 },
  // Delegation overlay
  delegationOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center',
    padding: 20, zIndex: 9999,
  },
  delegationBox: { width: '100%', maxWidth: 420, borderRadius: 20, padding: 20 },
  delegationTitle: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  delegationSub: { fontSize: 13, marginBottom: 14 },
  delegationGoalRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 12,
    padding: 12, marginBottom: 10,
  },
  delegationGoalTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  delegationTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 2 },
  delegationFill: { height: '100%', borderRadius: 4 },
  skipDelegation: {
    borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8,
  },
});

export default QuizPage;
