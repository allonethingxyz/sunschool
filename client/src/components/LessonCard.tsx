import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import { colors, typography, commonStyles } from '../styles/theme';
import { BookOpen, Check, Clock, Play } from 'react-feather';
import MediaLessonCard from './MediaLessonCard';

interface LessonCardProps {
  lesson: any;
  onPress?: () => void;
  isHistory?: boolean;
  style?: ViewStyle;
}

const LessonCard: React.FC<LessonCardProps> = ({
  lesson,
  onPress,
  isHistory = false,
  style,
}) => {
  const isActive = lesson.status === 'ACTIVE';
  const isDone = lesson.status === 'DONE';
  const isQueued = lesson.status === 'QUEUED';

  // Use rich MediaLessonCard when the lesson has an enhanced spec with media
  if (lesson.enhancedSpec && (lesson.enhancedSpec.images?.length > 0 || lesson.enhancedSpec.diagrams?.length > 0)) {
    return (
      <MediaLessonCard
        title={lesson.enhancedSpec.title ?? lesson.spec?.title ?? ''}
        subtitle={lesson.enhancedSpec.subtitle}
        subject={lesson.subject}
        gradeLevel={lesson.enhancedSpec.targetGradeLevel}
        estimatedDuration={lesson.enhancedSpec.estimatedDuration}
        difficultyLevel={lesson.enhancedSpec.difficultyLevel ?? lesson.difficulty}
        featuredImage={lesson.enhancedSpec.featuredImage}
        images={lesson.enhancedSpec.images ?? []}
        onPress={onPress}
        status={lesson.status}
      />
    );
  }
  
  // Format date
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };
  
  // Get status icon
  const getStatusIcon = () => {
    if (isDone) return <Check size={20} color={colors.success} />;
    if (isActive) return <Play size={20} color={colors.primary} />;
    return <Clock size={20} color={colors.textSecondary} />;
  };
  
  // Get status text (kid-friendly)
  const getStatusText = () => {
    if (isDone) return 'Done!';
    if (isActive) return "Let's Go!";
    return 'Coming Up';
  };
  
  // Get status color
  const getStatusColor = () => {
    if (isDone) return colors.success;
    if (isActive) return colors.primary;
    return colors.textSecondary;
  };
  
  return (
    <TouchableOpacity
      style={[
        styles.container,
        isActive && styles.activeContainer,
        isHistory && isDone && styles.completedContainer,
        style,
      ]}
      onPress={onPress}
      disabled={!onPress || (isHistory && !isActive)}
    >
      <View style={styles.iconContainer}>
        <BookOpen size={24} color={isActive ? colors.onPrimary : colors.primary} />
      </View>
      
      <View style={styles.content}>
        <Text 
          style={[
            styles.title,
            isActive && styles.activeTitle,
          ]}
          numberOfLines={2}
        >
          {lesson.spec.title}
        </Text>
        
        <View style={styles.metaContainer}>
          <View style={styles.statusContainer}>
            {getStatusIcon()}
            <Text 
              style={[
                styles.statusText,
                { color: getStatusColor() },
                isActive && styles.activeStatusText,
              ]}
            >
              {getStatusText()}
            </Text>
          </View>
          
          {isDone && lesson.score !== undefined && (
            <View style={styles.scoreContainer}>
              <Text style={[
                styles.scoreText,
                isActive && styles.activeScoreText,
              ]}>
                Score: {lesson.score}%
              </Text>
            </View>
          )}
          
          {isHistory && lesson.createdAt && (
            <Text style={[
              styles.dateText,
              isActive && styles.activeDateText,
            ]}>
              {formatDate(isDone ? lesson.completedAt : lesson.createdAt)}
            </Text>
          )}
        </View>
      </View>
      
      {isActive && !isHistory && (
        <View style={styles.actionContainer}>
          <Text style={styles.actionText}>Continue</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    ...commonStyles.card,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceColor,
    marginVertical: 8,
    marginHorizontal: 0,
  },
  activeContainer: {
    backgroundColor: colors.primary,
  },
  completedContainer: {
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  content: {
    flex: 1,
  },
  title: {
    ...typography.subtitle1,
    marginBottom: 4,
  },
  activeTitle: {
    color: colors.onPrimary,
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  statusText: {
    ...typography.caption,
    marginLeft: 4,
  },
  activeStatusText: {
    color: colors.onPrimary,
  },
  scoreContainer: {
    marginRight: 16,
  },
  scoreText: {
    ...typography.caption,
  },
  activeScoreText: {
    color: colors.onPrimary,
  },
  dateText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  activeDateText: {
    color: colors.onPrimary,
  },
  actionContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  actionText: {
    ...typography.caption,
    color: colors.onPrimary,
    fontWeight: '600',
  },
});

export default LessonCard;
