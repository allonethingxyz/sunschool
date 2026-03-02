import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
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
import { ArrowLeft, CheckCircle, AlertCircle } from 'react-feather';

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
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [quizScore, setQuizScore] = useState<{
    score: number;
    correctCount: number;
    totalQuestions: number;
    newAchievements: any[];
  } | null>(null);

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

  // Submit answers mutation
  const submitAnswersMutation = useMutation({
    mutationFn: (answers: number[]) => {
      return apiRequest('POST', `/api/lessons/${lessonId}/answer`, { answers }).then(res => res.data);
    },
    onSuccess: (data) => {
      setQuizSubmitted(true);
      setQuizScore(data);
      // Celebrate good scores
      if (data.score >= 70) {
        setShowConfetti(true);
      }
      // Show achievement unlock if any
      if (data.newAchievements && data.newAchievements.length > 0) {
        setTimeout(() => setShowAchievements(true), 1500);
      }
      // Invalidate related queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/lessons/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/achievements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons/history'] });
      queryClient.invalidateQueries({ queryKey: ['/api/points'] });
      queryClient.invalidateQueries({ queryKey: ['/api/mastery'] });
      if (lesson?.learnerId) {
        queryClient.invalidateQueries({
          queryKey: ['/api/learner-profile', lesson.learnerId],
        });
      }
    },
  });

  const handleSelectAnswer = (questionIndex: number, answerIndex: number) => {
    if (quizSubmitted) return; // Don't allow changes after submission
    
    const newAnswers = [...selectedAnswers];
    newAnswers[questionIndex] = answerIndex;
    setSelectedAnswers(newAnswers);
  };

  // Use enhancedSpec questions for richer rendering (with imageId, optionSvgs, etc.)
  // but always score against spec.questions since that's what's persisted for scoring
  const displayQuestions: QuizQuestion[] = (() => {
    if (!lesson) return [];
    if (lesson.enhancedSpec?.questions?.length) return lesson.enhancedSpec.questions;
    return lesson.spec?.questions ?? [];
  })();

  const lessonImages = lesson?.enhancedSpec?.images ?? [];

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

      <View style={[styles.subheader, { backgroundColor: theme.colors.surfaceColor, borderBottomColor: theme.colors.divider }]}>
        {!quizSubmitted && (
          <TouchableOpacity style={styles.backButtonSmall} onPress={() => setLocation('/lesson')}>
            <ArrowLeft size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        )}
        <Text style={[styles.subheaderTitle, { color: theme.colors.textPrimary }]}>
          {quizSubmitted ? 'Your Results' : 'Quick Challenge'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Progress stepper shown while answering questions */}
      {!quizSubmitted && displayQuestions.length > 0 && (
        <QuizProgressStepper
          totalQuestions={displayQuestions.length}
          currentQuestion={selectedAnswers.length > 0
            ? Math.min(selectedAnswers.filter(a => a !== undefined).length, displayQuestions.length - 1)
            : 0}
          answeredQuestions={selectedAnswers}
        />
      )}

      <ScrollView contentContainerStyle={styles.scrollContent}>
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
                  lessonImages={lessonImages}
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
                  lessonImages={lessonImages}
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
      </ScrollView>
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
});

export default QuizPage;
