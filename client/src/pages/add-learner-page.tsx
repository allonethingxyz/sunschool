import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, SafeAreaView } from 'react-native';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';
import { useAuth } from '../hooks/use-auth';
import SunschoolHeader from '../components/SunschoolHeader';
import GradePicker from '../components/GradePicker';
import { useToast } from '../hooks/use-toast';
import { useTheme } from '../styles/theme';

const AddLearnerPage = () => {
  const [newLearner, setNewLearner] = useState({
    name: '',
    gradeLevel: '',   // "K", "1", "2", ... "12"
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { colors } = useTheme();

  /**
   * Convert the display grade string to the numeric value the backend expects.
   * "K" -> 0, "1" -> 1, ... "12" -> 12
   */
  const gradeToNumber = (grade: string): number | null => {
    if (grade === 'K') return 0;
    const num = parseInt(grade, 10);
    if (isNaN(num) || num < 1 || num > 12) return null;
    return num;
  };

  const handleSubmit = async () => {
    // Validation
    if (!newLearner.name.trim()) {
      setError('Please enter a name');
      return;
    }
    if (newLearner.name.trim().length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }

    const gradeLevel = gradeToNumber(newLearner.gradeLevel);
    if (gradeLevel === null) {
      setError('Please select a grade level');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      // Create learner account
      await apiRequest('POST', '/api/learners', {
        ...newLearner,
        gradeLevel,
        role: 'LEARNER',
        parentId: user?.id,
      });

      // Show success toast
      toast({
        title: 'Success',
        description: 'Child account created successfully',
      });

      // Refresh learners list
      queryClient.invalidateQueries({ queryKey: ['/api/learners', user?.id, user?.role] });

      // Navigate back to learners page
      setLocation('/learners');
    } catch (err: any) {
      setIsSubmitting(false);
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError('Failed to create account. Please try again.');
      }
      console.error('Create learner error:', err);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <SunschoolHeader subtitle="Add Child" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.formContainer, { backgroundColor: colors.surfaceColor }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {user?.role === 'ADMIN' ? 'Add New Learner Account' : 'Add Child'}
          </Text>

          {error ? (
            <View style={[styles.errorContainer, { backgroundColor: colors.error + '18' }]}>
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>
              {user?.role === 'ADMIN' ? 'Learner Name' : 'Child\'s Name'}
            </Text>
            <TextInput
              style={[styles.input, {
                borderColor: colors.divider,
                color: colors.textPrimary,
                backgroundColor: colors.inputBackground,
              }]}
              value={newLearner.name}
              onChangeText={(text) => setNewLearner({ ...newLearner, name: text })}
              placeholder={user?.role === 'ADMIN' ? "Enter learner's name" : "Enter child's name"}
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <View style={styles.formGroup}>
            <GradePicker
              value={newLearner.gradeLevel}
              onChange={(grade) => setNewLearner({ ...newLearner, gradeLevel: grade })}
            />
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.cancelButton, { backgroundColor: colors.divider }]}
              onPress={() => setLocation('/learners')}
            >
              <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: colors.primary }, isSubmitting && styles.disabledButton]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Text style={[styles.submitButtonText, { color: colors.onPrimary }]}>
                  {user?.role === 'ADMIN' ? 'Create Learner' : 'Add Child'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  formContainer: {
    borderRadius: 8,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 24,
    textAlign: 'center',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  cancelButton: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    flex: 1,
    marginRight: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontWeight: '500',
    fontSize: 16,
  },
  submitButton: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    flex: 1,
    marginLeft: 8,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontWeight: '500',
    fontSize: 16,
  },
  errorContainer: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
  },
});

export default AddLearnerPage;
