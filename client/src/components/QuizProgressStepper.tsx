import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors } from '../styles/theme';
import { CheckCircle } from 'react-feather';

interface QuizProgressStepperProps {
  totalQuestions: number;
  currentQuestion: number;
  answeredQuestions: (number | undefined)[];
  onStepPress?: (index: number) => void;
}

/**
 * Horizontal step indicator for quiz progress.
 * Inspired by stepper/progress-indicator patterns from component.gallery.
 */
const QuizProgressStepper: React.FC<QuizProgressStepperProps> = ({
  totalQuestions,
  currentQuestion,
  answeredQuestions,
  onStepPress,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.track}>
        {Array.from({ length: totalQuestions }).map((_, index) => {
          const isAnswered = answeredQuestions[index] !== undefined;
          const isCurrent = index === currentQuestion;
          const isPast = index < currentQuestion;

          return (
            <React.Fragment key={index}>
              {/* Connector line between steps */}
              {index > 0 && (
                <View
                  style={[
                    styles.connector,
                    (isPast || isAnswered) && styles.connectorFilled,
                  ]}
                />
              )}
              <TouchableOpacity
                onPress={() => onStepPress?.(index)}
                style={[
                  styles.step,
                  isCurrent && styles.currentStep,
                  isAnswered && !isCurrent && styles.answeredStep,
                ]}
                accessibilityLabel={`Question ${index + 1}${isAnswered ? ' answered' : ''}`}
              >
                {isAnswered && !isCurrent ? (
                  <CheckCircle size={14} color="#fff" />
                ) : (
                  <Text
                    style={[
                      styles.stepLabel,
                      isCurrent && styles.currentStepLabel,
                      isAnswered && !isCurrent && styles.answeredStepLabel,
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </TouchableOpacity>
            </React.Fragment>
          );
        })}
      </View>
      <Text style={styles.progressText}>
        {answeredQuestions.filter(a => a !== undefined).length} / {totalQuestions} answered
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  step: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.divider,
  },
  currentStep: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    transform: [{ scale: 1.15 }],
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  answeredStep: {
    backgroundColor: colors.success ?? '#6BCB77',
    borderColor: colors.success ?? '#6BCB77',
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  currentStepLabel: {
    color: '#fff',
  },
  answeredStepLabel: {
    color: '#fff',
  },
  connector: {
    flex: 1,
    height: 3,
    backgroundColor: colors.divider,
    maxWidth: 28,
  },
  connectorFilled: {
    backgroundColor: colors.success ?? '#6BCB77',
  },
  progressText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
});

export default QuizProgressStepper;
