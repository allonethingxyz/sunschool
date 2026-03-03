import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import DOMPurify from 'isomorphic-dompurify';
import { colors, typography } from '../styles/theme';

/** Pick an emoji icon from description keywords (mirrors server-side logic). */
function pickIcon(desc: string): string {
  const d = desc.toLowerCase();
  if (d.includes('sun') || d.includes('solar')) return '☀️';
  if (d.includes('water') || d.includes('ocean') || d.includes('rain') || d.includes('cloud') || d.includes('vapor')) return '🌊';
  if (d.includes('plant') || d.includes('leaf') || d.includes('tree')) return '🌿';
  if (d.includes('animal') || d.includes('bird') || d.includes('fish')) return '🦋';
  if (d.includes('cell') || d.includes('atom') || d.includes('molecule')) return '🔬';
  if (d.includes('planet') || d.includes('space') || d.includes('orbit')) return '🪐';
  if (d.includes('volcano') || d.includes('mountain') || d.includes('earth')) return '🌋';
  return '🖼️';
}

/** Generate a descriptive placeholder SVG when no image data is available. */
function makePlaceholderSVG(description: string, color: string): string {
  const icon = pickIcon(description);
  const short = description.length > 75 ? description.substring(0, 72) + '...' : description;
  const words = short.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 38 && cur) { lines.push(cur.trim()); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  const lineEls = lines.slice(0, 3).map((l, i) =>
    `<text x="200" y="${148 + i * 20}" font-family="Arial" font-size="11" text-anchor="middle" fill="#546E7A">${
      l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    }</text>`
  ).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220" width="400" height="220">
    <rect width="400" height="220" fill="#F8F9FA" rx="10"/>
    <rect width="400" height="220" fill="${color}" opacity="0.07" rx="10"/>
    <rect x="2" y="2" width="396" height="216" fill="none" stroke="${color}" stroke-width="1.5" rx="9" opacity="0.25" stroke-dasharray="5,4"/>
    <circle cx="200" cy="80" r="42" fill="${color}" opacity="0.12"/>
    <circle cx="200" cy="80" r="32" fill="${color}" opacity="0.18"/>
    <text x="200" y="94" font-family="Arial" font-size="30" text-anchor="middle">${icon}</text>
    ${lineEls}
    <rect x="150" y="200" width="100" height="16" rx="8" fill="${color}" opacity="0.15"/>
    <text x="200" y="212" font-family="Arial" font-size="9" text-anchor="middle" fill="${color}" font-weight="bold">ILLUSTRATION</text>
  </svg>`;
}
import { CheckCircle, Circle } from 'react-feather';

export interface LessonImageRef {
  id: string;
  description: string;
  alt: string;
  base64Data?: string;
  svgData?: string;
  path?: string;
}

export interface QuizQuestion {
  text: string;
  options: string[];
  /** Parallel SVG strings for each answer option */
  optionSvgs?: string[];
  correctIndex?: number;
  explanation?: string;
  type?: string;
  /** ID of a lesson image to display above the question stem */
  imageId?: string;
  /** Inline SVG to display above the question stem */
  imageSvg?: string;
}

interface QuizComponentProps {
  question: QuizQuestion;
  selectedAnswer?: number;
  showAnswers?: boolean;
  onSelectAnswer: (index: number) => void;
  /** Images from the enhanced lesson spec for resolving imageId references */
  lessonImages?: LessonImageRef[];
}

function sanitizeSVG(svg: string): string {
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
}

function renderSVGInline(svgData: string, style?: React.CSSProperties) {
  return (
    <div
      style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', ...style }}
      dangerouslySetInnerHTML={{ __html: sanitizeSVG(svgData) }}
    />
  );
}

const QuizComponent: React.FC<QuizComponentProps> = ({
  question,
  selectedAnswer,
  showAnswers = false,
  onSelectAnswer,
  lessonImages = [],
}) => {
  const isAnswered = selectedAnswer !== undefined;
  const isCorrect = showAnswers && selectedAnswer === question.correctIndex;

  // Resolve question stem image
  const stemImage = question.imageId
    ? lessonImages.find(img => img.id === question.imageId)
    : null;

  const hasVisualOptions =
    question.optionSvgs && question.optionSvgs.length === question.options.length;

  // Build stem image content — always show something when an imageId is referenced
  const renderStemImage = () => {
    if (!stemImage && !question.imageSvg) return null;
    let content: React.ReactNode = null;
    if (question.imageSvg) {
      content = renderSVGInline(question.imageSvg, { width: '100%', maxHeight: 220 });
    } else if (stemImage?.svgData) {
      content = renderSVGInline(stemImage.svgData, { width: '100%', maxHeight: 220 });
    } else if (stemImage?.base64Data) {
      content = (
        <Image
          source={{ uri: `data:image/png;base64,${stemImage.base64Data}` }}
          style={styles.stemImage}
          resizeMode="contain"
        />
      );
    } else if (stemImage?.path) {
      content = (
        <Image source={{ uri: stemImage.path }} style={styles.stemImage} resizeMode="contain" />
      );
    } else if (stemImage?.description) {
      // No data but we have a description — show descriptive placeholder
      content = renderSVGInline(
        makePlaceholderSVG(stemImage.description, colors.primary),
        { width: '100%', maxHeight: 220 }
      );
    }
    if (!content) return null;
    return (
      <View style={styles.stemImageContainer}>
        {content}
        {stemImage?.description && (
          <Text style={styles.stemImageCaption}>{stemImage.description}</Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Question stem image */}
      {renderStemImage()}

      <View style={styles.questionContainer}>
        <Text style={styles.questionText}>{question.text}</Text>
      </View>

      {/* Answer options — visual (SVG grid) or text list */}
      {hasVisualOptions ? (
        <View style={styles.visualGrid}>
          {question.options.map((option, index) => {
            const isSelected = selectedAnswer === index;
            const isCorrectAnswer = showAnswers && index === question.correctIndex;
            const svgData = question.optionSvgs![index];

            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.visualOption,
                  isSelected && styles.selectedVisualOption,
                  showAnswers && isCorrectAnswer && styles.correctVisualOption,
                  showAnswers && isSelected && !isCorrectAnswer && styles.incorrectVisualOption,
                ]}
                onPress={() => onSelectAnswer(index)}
                disabled={isAnswered && showAnswers}
              >
                {svgData ? (
                  renderSVGInline(svgData, { width: '100%', height: 120 })
                ) : null}
                <Text
                  style={[
                    styles.visualOptionLabel,
                    isSelected && styles.selectedOptionText,
                    showAnswers && isCorrectAnswer && styles.correctOptionText,
                    showAnswers && isSelected && !isCorrectAnswer && styles.incorrectOptionText,
                  ]}
                  numberOfLines={2}
                >
                  {option}
                </Text>
                {showAnswers && isCorrectAnswer && (
                  <View style={styles.visualCheckBadge}>
                    <CheckCircle size={16} color={colors.success} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <ScrollView style={styles.optionsContainer}>
          {question.options.map((option, index) => {
            const isSelected = selectedAnswer === index;
            const isCorrectAnswer = showAnswers && index === question.correctIndex;

            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.optionItem,
                  isSelected && styles.selectedOption,
                  showAnswers && isCorrectAnswer && styles.correctOption,
                  showAnswers && isSelected && !isCorrectAnswer && styles.incorrectOption,
                ]}
                onPress={() => onSelectAnswer(index)}
                disabled={isAnswered && showAnswers}
              >
                <View style={styles.optionContent}>
                  {isSelected ? (
                    <CheckCircle
                      size={20}
                      color={
                        showAnswers
                          ? isCorrectAnswer
                            ? colors.success
                            : colors.error
                          : colors.primary
                      }
                    />
                  ) : (
                    <Circle
                      size={20}
                      color={showAnswers && isCorrectAnswer ? colors.success : colors.textSecondary}
                    />
                  )}
                  <Text
                    style={[
                      styles.optionText,
                      isSelected && styles.selectedOptionText,
                      showAnswers && isCorrectAnswer && styles.correctOptionText,
                      showAnswers && isSelected && !isCorrectAnswer && styles.incorrectOptionText,
                    ]}
                  >
                    {option}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {showAnswers && isAnswered && question.explanation && (
        <View style={styles.explanationContainer}>
          <Text style={styles.explanationTitle}>
            {isCorrect ? 'You got it!' : "Good try! Here's why:"}
          </Text>
          <Text style={styles.explanationText}>{question.explanation}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceColor,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  stemImageContainer: {
    marginBottom: 16,
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    overflow: 'hidden',
    padding: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  stemImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
  },
  stemImageCaption: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    fontStyle: 'italic',
  },
  questionContainer: {
    marginBottom: 24,
  },
  questionText: {
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 32,
    color: colors.textPrimary,
  },
  optionsContainer: {
    marginBottom: 16,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.divider,
    marginBottom: 14,
    minHeight: 60,
  },
  selectedOption: {
    borderColor: '#4A90D9',
    backgroundColor: '#EBF5FF',
  },
  correctOption: {
    borderColor: '#6BCB77',
    backgroundColor: '#E8F5E9',
  },
  incorrectOption: {
    borderColor: '#FF6B6B',
    backgroundColor: '#FFEBEE',
  },
  optionContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionText: {
    fontSize: 20,
    lineHeight: 28,
    color: colors.textPrimary,
    marginLeft: 14,
    flex: 1,
  },
  selectedOptionText: {
    color: '#2E6BB5',
    fontWeight: '600',
  },
  correctOptionText: {
    color: '#2E7D32',
    fontWeight: '600',
  },
  incorrectOptionText: {
    color: '#C62828',
    fontWeight: '600',
  },
  explanationContainer: {
    backgroundColor: '#EBF5FF',
    borderRadius: 12,
    padding: 18,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4A90D9',
  },
  explanationTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3436',
    marginBottom: 8,
  },
  explanationText: {
    fontSize: 18,
    lineHeight: 26,
    color: '#2D3436',
  },
  // Visual (SVG grid) option styles
  visualGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
    marginBottom: 16,
  },
  visualOption: {
    width: '48%',
    marginHorizontal: '1%',
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.divider,
    backgroundColor: '#FAFAFA',
    overflow: 'hidden',
    alignItems: 'center',
    padding: 8,
    position: 'relative',
  },
  selectedVisualOption: {
    borderColor: '#4A90D9',
    backgroundColor: '#EBF5FF',
  },
  correctVisualOption: {
    borderColor: '#6BCB77',
    backgroundColor: '#E8F5E9',
  },
  incorrectVisualOption: {
    borderColor: '#FF6B6B',
    backgroundColor: '#FFEBEE',
  },
  visualOptionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: 6,
  },
  visualCheckBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 2,
  },
});

export default QuizComponent;
