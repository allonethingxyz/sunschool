import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { colors, typography } from '../styles/theme';
import { CheckCircle, Circle } from 'react-feather';

export interface QuizQuestion {
  text: string;
  options: string[];
  correctIndex?: number;
  explanation?: string;
  type?: string;
}

interface QuizComponentProps {
  question: QuizQuestion;
  selectedAnswer?: number;
  showAnswers?: boolean;
  onSelectAnswer: (index: number) => void;
}

const QuizComponent: React.FC<QuizComponentProps> = ({
  question,
  selectedAnswer,
  showAnswers = false,
  onSelectAnswer,
}) => {
  const isAnswered = selectedAnswer !== undefined;
  const isCorrect = showAnswers && selectedAnswer === question.correctIndex;

  return (
    <View style={styles.container}>
      <View style={styles.questionContainer}>
        <Text style={styles.questionText}>{question.text}</Text>
      </View>

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
});

export default QuizComponent;
