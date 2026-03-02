import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
} from 'react-native';
import DOMPurify from 'isomorphic-dompurify';
import { colors, typography, useTheme } from '../styles/theme';
import SimpleMarkdownRenderer from './SimpleMarkdownRenderer';
import AccordionSection from './AccordionSection';

interface LessonImage {
  id: string;
  description: string;
  alt: string;
  base64Data?: string;
  svgData?: string;
  path?: string;
  promptUsed: string;
}

interface LessonDiagram {
  id: string;
  type: string;
  title: string;
  svgData: string;
  description: string;
}

interface LessonSection {
  title: string;
  content: string;
  type: string;
  imageIds?: string[];
}

interface EnhancedLessonSpec {
  title: string;
  targetGradeLevel: number;
  subtitle?: string;
  summary: string;
  sections: LessonSection[];
  featuredImage?: string;
  images: LessonImage[];
  diagrams: LessonDiagram[];
  questions: any[];
  graph?: any;
  keywords: string[];
  relatedTopics: string[];
  estimatedDuration: number;
  difficultyLevel: string;
}

interface EnhancedLessonContentProps {
  enhancedSpec: EnhancedLessonSpec;
}

/**
 * Returns a kid-friendly emoji for the difficulty level.
 */
function getLevelEmoji(level: string): string {
  const lower = level.toLowerCase();
  if (lower === 'easy' || lower === 'beginner') return '\u2B50 Easy';
  if (lower === 'medium' || lower === 'intermediate') return '\u2B50\u2B50 Medium';
  if (lower === 'hard' || lower === 'advanced') return '\u2B50\u2B50\u2B50 Hard';
  return `\u2B50 ${level}`;
}

/**
 * Map section type to a display icon.
 */
function getSectionIcon(type: string): string {
  switch (type) {
    case 'introduction': return '👋';
    case 'key_concepts': return '🔑';
    case 'examples': return '💡';
    case 'practice': return '✏️';
    case 'summary': return '📝';
    case 'fun_facts': return '🌟';
    default: return '📖';
  }
}

const EnhancedLessonContent: React.FC<EnhancedLessonContentProps> = ({ enhancedSpec }) => {
  const theme = useTheme();

  // Helper function to find an image by ID
  const findImageById = (id: string) => {
    return enhancedSpec.images.find(img => img.id === id);
  };

  // Helper function to render an image
  const renderImage = (image: LessonImage) => {
    if (image.base64Data) {
      return (
        <View style={[styles.imageContainer, { borderColor: theme.colors.primary + '30' }]}>
          <Image
            source={{ uri: `data:image/png;base64,${image.base64Data}` }}
            style={styles.image}
            resizeMode="contain"
          />
          <Text style={[styles.imageCaption, { color: theme.colors.textSecondary }]}>
            {image.description}
          </Text>
        </View>
      );
    } else if (image.svgData) {
      return (
        <View style={[styles.imageContainer, { borderColor: theme.colors.primary + '30' }]}>
          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(image.svgData, { USE_PROFILES: { svg: true, svgFilters: true } }) }} />
          <Text style={[styles.imageCaption, { color: theme.colors.textSecondary }]}>
            {image.description}
          </Text>
        </View>
      );
    } else if (image.path) {
      return (
        <View style={[styles.imageContainer, { borderColor: theme.colors.primary + '30' }]}>
          <Image
            source={{ uri: image.path }}
            style={styles.image}
            resizeMode="contain"
          />
          <Text style={[styles.imageCaption, { color: theme.colors.textSecondary }]}>
            {image.description}
          </Text>
        </View>
      );
    }
    return null;
  };

  // Render featured image
  const renderFeaturedImage = () => {
    if (enhancedSpec.featuredImage) {
      const image = findImageById(enhancedSpec.featuredImage);
      if (image) {
        return renderImage(image);
      }
    }
    return null;
  };

  // Section divider: a centered row of colored dots
  const renderSectionDivider = () => (
    <View style={styles.sectionDivider}>
      <View style={[styles.dividerDot, { backgroundColor: theme.colors.primary }]} />
      <View style={[styles.dividerDot, { backgroundColor: theme.colors.secondary }]} />
      <View style={[styles.dividerDot, { backgroundColor: theme.colors.accent3 }]} />
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Subtitle */}
      {enhancedSpec.subtitle && (
        <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
          {enhancedSpec.subtitle}
        </Text>
      )}

      {/* Summary Callout Box */}
      <View
        style={[
          styles.summaryBox,
          {
            backgroundColor: theme.colors.primary + '15',
            borderLeftColor: theme.colors.primary,
          },
        ]}
      >
        <Text style={[styles.summaryIcon]}>
          {'\uD83D\uDCA1'}
        </Text>
        <Text style={[styles.summaryText, { color: theme.colors.textPrimary }]}>
          {enhancedSpec.summary}
        </Text>
      </View>

      {/* Featured Image */}
      {renderFeaturedImage()}

      {/* Metadata Bar */}
      <View style={[styles.metadataBar, { backgroundColor: theme.colors.background }]}>
        <Text style={[styles.metadata, { color: theme.colors.textPrimary }]}>
          {'\u23F1\uFE0F'} {enhancedSpec.estimatedDuration} minutes
        </Text>
        <Text style={[styles.metadata, { color: theme.colors.textPrimary }]}>
          {getLevelEmoji(enhancedSpec.difficultyLevel)}
        </Text>
        <Text style={[styles.metadata, { color: theme.colors.textPrimary }]}>
          {'\uD83D\uDCDA'} Grade {enhancedSpec.targetGradeLevel}
        </Text>
      </View>

      {/* Content Sections — rendered as accordion panels */}
      {enhancedSpec.sections.map((section, index) => (
        <AccordionSection
          key={index}
          title={section.title}
          icon={getSectionIcon(section.type)}
          defaultExpanded={index === 0}
          accentColor={theme.colors.primary}
        >
          {/* Section Images */}
          {section.imageIds && section.imageIds.map(imageId => {
            const image = findImageById(imageId);
            if (image) {
              return <React.Fragment key={imageId}>{renderImage(image)}</React.Fragment>;
            }
            return null;
          })}

          {/* Section Content */}
          <SimpleMarkdownRenderer content={section.content} />
        </AccordionSection>
      ))}

      {/* Diagrams */}
      {enhancedSpec.diagrams.length > 0 && (
        <View style={styles.diagramsSection}>
          <Text style={[styles.diagramsTitle, { color: theme.colors.primary }]}>
            {"\uD83D\uDD0D Let's Look at This!"}
          </Text>
          {enhancedSpec.diagrams.map((diagram, index) => (
            <View
              key={index}
              style={[styles.diagram, { backgroundColor: theme.colors.surfaceColor }]}
            >
              <Text style={[styles.diagramTitle, { color: theme.colors.textPrimary }]}>
                {diagram.title}
              </Text>
              <View style={styles.diagramContainer}>
                <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(diagram.svgData, { USE_PROFILES: { svg: true, svgFilters: true } }) }} />
              </View>
              <Text style={[styles.diagramDescription, { color: theme.colors.textSecondary }]}>
                {diagram.description}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Keywords */}
      <View style={styles.tagsContainer}>
        <Text style={[styles.tagsTitle, { color: theme.colors.textPrimary }]}>
          {'\uD83D\uDCD6'} Words to Know
        </Text>
        <View style={styles.tagsList}>
          {enhancedSpec.keywords.map((keyword, index) => (
            <View
              key={index}
              style={[styles.keywordTag, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={styles.keywordTagText}>{keyword}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Related Topics */}
      {enhancedSpec.relatedTopics.length > 0 && (
        <View style={styles.tagsContainer}>
          <Text style={[styles.tagsTitle, { color: theme.colors.textPrimary }]}>
            {'\uD83C\uDF1F'} Want to Learn More?
          </Text>
          <View style={styles.tagsList}>
            {enhancedSpec.relatedTopics.map((topic, index) => (
              <View
                key={index}
                style={[styles.relatedTag, { backgroundColor: theme.colors.accent3 }]}
              >
                <Text style={styles.relatedTagText}>{topic}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
  },
  subtitle: {
    ...typography.h3,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  // Summary callout box
  summaryBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    marginBottom: 16,
  },
  summaryIcon: {
    fontSize: 24,
    marginRight: 12,
    marginTop: 2,
  },
  summaryText: {
    ...typography.body1,
    fontWeight: 'bold',
    flex: 1,
    fontSize: 20,
    lineHeight: 30,
  },
  // Metadata bar
  metadataBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  metadata: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Sections
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    ...typography.h2,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 2,
  },
  // Section divider dots
  sectionDivider: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 6,
  },
  // Images
  imageContainer: {
    marginVertical: 16,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    padding: 8,
    borderWidth: 2,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: 8,
  },
  imageCaption: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  // Diagrams
  diagramsSection: {
    marginVertical: 16,
  },
  diagramsTitle: {
    ...typography.h2,
    marginBottom: 12,
  },
  diagram: {
    marginBottom: 16,
    borderRadius: 12,
    padding: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  diagramTitle: {
    ...typography.h3,
    marginBottom: 8,
  },
  diagramContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 150,
    marginVertical: 8,
  },
  diagramDescription: {
    ...typography.body2,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  // Tags
  tagsContainer: {
    marginVertical: 12,
  },
  tagsTitle: {
    ...typography.subtitle1,
    marginBottom: 10,
    fontWeight: '700',
  },
  tagsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  // Keyword chips: primary bg, white text, pill shape
  keywordTag: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  keywordTagText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Related topic chips: accent3 bg, white text
  relatedTag: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  relatedTagText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default EnhancedLessonContent;
