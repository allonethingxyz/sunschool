import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { apiRequest } from '../lib/queryClient';
import { colors, typography, commonStyles } from '../styles/theme';
import { ArrowLeft } from 'react-feather';
import LessonCardCarousel from '../components/LessonCardCarousel';
import { useMode } from '../context/ModeContext';

const ActiveLessonPage = () => {
  const [, setLocation] = useLocation();
  const { selectedLearner } = useMode();
  const [isLoading, setIsLoading] = useState(true);

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
      if (!d?.spec?.images?.length) return 5000;
      const hasReal = d.spec.images.some((img: any) => img.svgData || img.base64Data || img.path);
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
      {/* Minimal header — just back arrow + title */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButtonSmall} onPress={() => setLocation('/learner')}>
          <ArrowLeft size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {lesson.spec.title}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Card carousel — takes full remaining height */}
      <LessonCardCarousel
        enhancedSpec={lesson.spec}
        onStartQuiz={handleStartQuiz}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    flex: 1,
    marginHorizontal: 8,
  },
  backButtonSmall: {
    padding: 4,
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

export default ActiveLessonPage;
