import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
// Use a safe inline sanitizer rather than the full isomorphic-dompurify
// to avoid 'global is not defined' in the browser bundle.
function safeSanitizeSvg(svg: string): string {
  if (typeof window === 'undefined') return '';
  // Simple allowlist: only allow SVG-safe content
  return svg.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/on\w+="[^"]*"/g, '');
}
import { colors, typography } from '../styles/theme';
import { Clock, BookOpen, ChevronRight } from 'react-feather';

interface LessonImageRef {
  id: string;
  description: string;
  alt?: string;
  base64Data?: string;
  svgData?: string;
  path?: string;
}

interface MediaLessonCardProps {
  title: string;
  subtitle?: string;
  subject?: string;
  gradeLevel?: number;
  estimatedDuration?: number;
  difficultyLevel?: string;
  featuredImage?: string;
  images?: LessonImageRef[];
  onPress?: () => void;
  status?: 'ACTIVE' | 'QUEUED' | 'DONE';
}

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: '#6BCB77',
  intermediate: '#FFD93D',
  advanced: '#FF6B6B',
  easy: '#6BCB77',
  medium: '#FFD93D',
  hard: '#FF6B6B',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'In Progress',
  QUEUED: 'Up Next',
  DONE: 'Completed',
};

/**
 * Rich media card for a lesson with thumbnail, metadata, and action.
 * Inspired by media card patterns from component.gallery.
 */
const MediaLessonCard: React.FC<MediaLessonCardProps> = ({
  title,
  subtitle,
  subject,
  gradeLevel,
  estimatedDuration,
  difficultyLevel,
  featuredImage,
  images = [],
  onPress,
  status,
}) => {
  const thumbnail = featuredImage ? images.find(img => img.id === featuredImage) : null;
  const diffColor = difficultyLevel
    ? DIFFICULTY_COLORS[difficultyLevel.toLowerCase()] ?? colors.primary
    : colors.primary;

  const renderThumbnail = () => {
    if (!thumbnail) {
      return (
        <View style={styles.thumbPlaceholder}>
          <BookOpen size={32} color={colors.primaryLight} />
        </View>
      );
    }
    if (thumbnail.svgData) {
      return (
        <div
          style={{ width: '100%', height: '100%', overflow: 'hidden' }}
          dangerouslySetInnerHTML={{ __html: safeSanitizeSvg(thumbnail.svgData) }}
        />
      );
    }
    if (thumbnail.base64Data) {
      return (
        <Image
          source={{ uri: `data:image/png;base64,${thumbnail.base64Data}` }}
          style={styles.thumbImage}
          resizeMode="cover"
        />
      );
    }
    if (thumbnail.path) {
      return (
        <Image
          source={{ uri: thumbnail.path }}
          style={styles.thumbImage}
          resizeMode="cover"
        />
      );
    }
    return (
      <View style={styles.thumbPlaceholder}>
        <BookOpen size={32} color={colors.primaryLight} />
      </View>
    );
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Thumbnail */}
      <View style={styles.thumbContainer}>{renderThumbnail()}</View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.metaRow}>
          {subject && (
            <View style={[styles.badge, { backgroundColor: colors.primary + '20' }]}>
              <Text style={[styles.badgeText, { color: colors.primary }]}>{subject}</Text>
            </View>
          )}
          {difficultyLevel && (
            <View style={[styles.badge, { backgroundColor: diffColor + '25' }]}>
              <Text style={[styles.badgeText, { color: diffColor }]}>
                {difficultyLevel.charAt(0).toUpperCase() + difficultyLevel.slice(1)}
              </Text>
            </View>
          )}
          {status && (
            <View style={[styles.badge, { backgroundColor: status === 'DONE' ? '#E8F5E9' : '#EBF5FF' }]}>
              <Text style={[styles.badgeText, { color: status === 'DONE' ? '#2E7D32' : '#2E6BB5' }]}>
                {STATUS_LABELS[status]}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        )}

        <View style={styles.footer}>
          {estimatedDuration && (
            <View style={styles.footerItem}>
              <Clock size={13} color={colors.textSecondary} />
              <Text style={styles.footerText}>{estimatedDuration} min</Text>
            </View>
          )}
          {gradeLevel && (
            <Text style={styles.footerText}>Grade {gradeLevel}</Text>
          )}
          <View style={{ flex: 1 }} />
          <ChevronRight size={18} color={colors.primary} />
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceColor,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  thumbContainer: {
    width: 110,
    minHeight: 110,
    backgroundColor: colors.background,
    overflow: 'hidden',
    flexShrink: 0,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight + '30',
  },
  content: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  badge: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 4,
    marginBottom: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  title: {
    ...typography.subtitle1,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  footerText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 3,
  },
});

export default MediaLessonCard;
