import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiRequest } from '../lib/queryClient';
import { colors, typography, commonStyles } from '../styles/theme';
import { ChevronRight, ArrowLeft } from 'react-feather';
import EnhancedLessonContent from '../components/EnhancedLessonContent';
import { useMode } from '../context/ModeContext';

const IMAGE_POLL_TIMEOUT_MS = 120_000; // 2 minutes

const ActiveLessonPage = () => {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { selectedLearner } = useMode();
  const [isLoading, setIsLoading] = useState(true);
  const [imagesFailed, setImagesFailed] = useState(false);
  const [retryingImages, setRetryingImages] = useState(false);
  const pollingStartRef = useRef<number | null>(null);

  // Use context learnerId, falling back to localStorage if context hasn't hydrated yet
  const learnerId = selectedLearner?.id ?? (() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('selectedLearnerId');
      return stored ? parseInt(stored, 10) : undefined;
    }
    return undefined;
  })();

  const {
    data: lesson,
    error,
    isLoading: queryLoading,
    fetchStatus,
  } = useQuery({
    queryKey: ['/api/lessons/active', learnerId],
    queryFn: () => apiRequest('GET', `/api/lessons/active?learnerId=${learnerId}`).then(res => res.data),
    enabled: !!learnerId,
    retry: 1,
    // Re-poll every 5s while images are still being generated in the background
    refetchInterval: (query) => {
      const d = query.state.data as any;

      // Stop polling if image generation explicitly failed
      if (d?.spec?.imageGenerationFailed) {
        setImagesFailed(true);
        pollingStartRef.current = null;
        return false;
      }

      if (!d?.spec?.images?.length) {
        // Track when polling started
        if (!pollingStartRef.current) pollingStartRef.current = Date.now();
        // Stop polling after timeout
        if (Date.now() - pollingStartRef.current > IMAGE_POLL_TIMEOUT_MS) {
          setImagesFailed(true);
          pollingStartRef.current = null;
          return false;
        }
        return 5000;
      }

      const hasReal = d.spec.images.some((img: any) => img.svgData || img.base64Data || img.path);
      if (hasReal) {
        pollingStartRef.current = null;
        setImagesFailed(false);
      }
      return hasReal ? false : 5000;
    },
  });

  useEffect(() => {
    if (!queryLoading && lesson) {
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 500);
      return () => clearTimeout(timer);
    }
    // If query is disabled (no learnerId at all) and not fetching, stop showing spinner
    if (!learnerId && fetchStatus === 'idle') {
      setIsLoading(false);
    }
  }, [queryLoading, lesson, learnerId, fetchStatus]);

  const handleRetryImages = useCallback(async () => {
    if (!lesson?.id || retryingImages) return;
    setRetryingImages(true);
    setImagesFailed(false);
    try {
      await apiRequest('POST', `/api/lessons/${lesson.id}/retry-images`);
      // Reset polling timer and re-enable polling
      pollingStartRef.current = Date.now();
      queryClient.invalidateQueries({ queryKey: ['/api/lessons/active', learnerId] });
    } catch (err) {
      console.error('Failed to retry image generation:', err);
      setImagesFailed(true);
    } finally {
      setRetryingImages(false);
    }
  }, [lesson?.id, retryingImages, learnerId, queryClient]);

  const handleStartQuiz = () => {
    if (lesson) {
      try {
        setLocation(`/quiz/${lesson.id}`);
      } catch (err) {
        console.error('Error navigating to quiz:', err);
        alert('There was a problem starting the quiz. Please try again.');
      }
    } else {
      console.error('Cannot start quiz: No active lesson found');
      alert('No active lesson found. Please return to learner home and try again.');
    }
  };

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            Error loading lesson. Please try again.
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

  if (queryLoading || isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading your personalized lesson...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!lesson) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            You don't have an active lesson. Please return to generate a new one.
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButtonSmall} onPress={() => setLocation('/learner')}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{lesson.spec.title}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {imagesFailed && (
          <View style={styles.imageFailedBanner}>
            <Text style={styles.imageFailedText}>
              Images could not be generated for this lesson. The lesson content is still available.
            </Text>
            <TouchableOpacity
              style={[styles.retryButton, retryingImages && styles.retryButtonDisabled]}
              onPress={handleRetryImages}
              disabled={retryingImages}
            >
              <Text style={styles.retryButtonText}>
                {retryingImages ? 'Retrying...' : 'Retry images'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.lessonContent}>
          <Text style={styles.lessonTitle}>{lesson.spec.title}</Text>

          <EnhancedLessonContent enhancedSpec={lesson.spec} />
        </View>

        <View style={styles.quizPrompt}>
          <Text style={styles.quizPromptTitle}>Ready to Test Your Knowledge?</Text>
          <Text style={styles.quizPromptText}>
            Now that you've learned about {lesson.spec.title.toLowerCase()}, 
            let's see what you remember with a quick quiz!
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.quizButton} onPress={handleStartQuiz}>
          <Text style={styles.quizButtonText}>Start Quiz</Text>
          <ChevronRight size={20} color={colors.onPrimary} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};



const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  lessonText: {
    ...typography.body1,
    lineHeight: 24,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: colors.surfaceColor,
  },
  headerTitle: {
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
  lessonContent: {
    backgroundColor: colors.surfaceColor,
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  lessonTitle: {
    ...typography.h2,
    marginBottom: 16,
  },
  imageContainer: {
    marginVertical: 16,
    alignItems: 'center',
  },
  quizPrompt: {
    backgroundColor: colors.primaryLight,
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  quizPromptTitle: {
    ...typography.subtitle1,
    color: colors.onPrimary,
    marginBottom: 8,
  },
  quizPromptText: {
    ...typography.body2,
    color: colors.onPrimary,
  },
  footer: {
    padding: 16,
    backgroundColor: colors.surfaceColor,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  quizButton: {
    ...commonStyles.button,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quizButtonText: {
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
    marginBottom: 16,
    textAlign: 'center',
  },
  backButton: {
    ...commonStyles.button,
  },
  backButtonText: {
    ...commonStyles.buttonText,
  },
  imageFailedBanner: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  imageFailedText: {
    ...typography.body2,
    color: '#E65100',
    marginBottom: 8,
  },
  retryButton: {
    backgroundColor: '#FF9800',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignSelf: 'flex-start' as const,
  },
  retryButtonDisabled: {
    opacity: 0.6,
  },
  retryButtonText: {
    ...typography.body2,
    color: '#FFFFFF',
    fontWeight: '600' as const,
  },
});

export default ActiveLessonPage;
