import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Switch } from 'react-native';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';
import { useAuth } from '../hooks/use-auth';
import { useToast } from '../hooks/use-toast';
import { colors, typography } from '../styles/theme';
import { ArrowLeft } from 'react-feather';

export default function PromptSettingsPage() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Extract learner ID from URL path: /learners/:id/prompt-settings
  const pathSegments = location.split('/');
  const learnerId = pathSegments[2]; // index 0='', 1='learners', 2=':id', 3='prompt-settings'

  const [guidelines, setGuidelines] = useState('');
  const [restrictions, setRestrictions] = useState('');
  const [requireApproval, setRequireApproval] = useState(false);

  // Fetch current learner profile to populate fields
  const { data: profile, isLoading } = useQuery({
    queryKey: [`/api/learner-profile/${learnerId}/prompt-settings`],
    queryFn: () =>
      apiRequest('GET', `/api/learner-profile/${learnerId}/prompt-settings`).then(
        (res: any) => res.data ?? res,
      ),
    enabled: !!learnerId,
  });

  // Fetch learner user info for displaying the name
  const { data: learners } = useQuery<any[]>({
    queryKey: ['/api/learners'],
    queryFn: () => apiRequest('GET', '/api/learners').then((res: any) => res.data ?? res),
    enabled: !!user && (user.role === 'PARENT' || user.role === 'ADMIN'),
  });

  const learner = learners?.find((l: any) => l.id.toString() === learnerId);

  useEffect(() => {
    if (profile) {
      setGuidelines(profile.parentPromptGuidelines || profile.parent_prompt_guidelines || '');
      setRestrictions(profile.contentRestrictions || profile.content_restrictions || '');
      setRequireApproval(
        profile.requireLessonApproval ?? profile.require_lesson_approval ?? false,
      );
    }
  }, [profile]);

  const mutation = useMutation({
    mutationFn: (data: {
      parentPromptGuidelines: string;
      contentRestrictions: string;
      requireLessonApproval: boolean;
    }) =>
      apiRequest('PUT', `/api/learner-profile/${learnerId}/prompt-settings`, data).then(
        (res: any) => res.data ?? res,
      ),
    onSuccess: () => {
      toast({ title: 'Saved', description: 'Prompt settings updated successfully.' });
      queryClient.invalidateQueries({ queryKey: [`/api/learner-profile/${learnerId}/prompt-settings`] });
    },
    onError: (err: any) => {
      toast({
        title: 'Error',
        description: err.message || 'Failed to save settings.',
        variant: 'destructive',
      });
    },
  });

  const handleSave = () => {
    if (guidelines.length > 500) {
      toast({
        title: 'Too long',
        description: 'Guidelines must be 500 characters or fewer.',
        variant: 'destructive',
      });
      return;
    }
    mutation.mutate({
      parentPromptGuidelines: guidelines,
      contentRestrictions: restrictions,
      requireLessonApproval: requireApproval,
    });
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content}>
        {/* Header */}
        <TouchableOpacity style={styles.backButton} onPress={() => setLocation('/dashboard')}>
          <ArrowLeft size={18} color={colors.textPrimary} />
          <Text style={styles.backText}>Dashboard</Text>
        </TouchableOpacity>

        <Text style={styles.title}>
          Prompt Settings{learner ? ` for ${learner.name}` : ''}
        </Text>
        <Text style={styles.subtitle}>
          Control what the AI includes in lessons generated for this child.
        </Text>

        {/* Guidelines */}
        <View style={styles.field}>
          <Text style={styles.label}>Custom Guidelines</Text>
          <Text style={styles.helper}>
            Provide instructions the AI should follow when generating lessons (max 500 chars).
            Example: "Use sports analogies" or "Include Spanish vocabulary".
          </Text>
          <TextInput
            style={styles.textArea}
            value={guidelines}
            onChangeText={setGuidelines}
            placeholder="e.g. Focus on visual learning. Use real-world examples."
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={500}
            numberOfLines={4}
          />
          <Text style={styles.charCount}>{guidelines.length}/500</Text>
        </View>

        {/* Content Restrictions */}
        <View style={styles.field}>
          <Text style={styles.label}>Content Restrictions</Text>
          <Text style={styles.helper}>
            Comma-separated topics the AI should avoid in lessons.
          </Text>
          <TextInput
            style={styles.input}
            value={restrictions}
            onChangeText={setRestrictions}
            placeholder="e.g. war, violence, scary animals"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        {/* Approval Toggle */}
        <View style={styles.switchRow}>
          <View style={styles.switchLabel}>
            <Text style={styles.label}>Require My Approval</Text>
            <Text style={styles.helper}>
              When enabled, new lessons will be queued for your review before the learner can access
              them.
            </Text>
          </View>
          <Switch
            value={requireApproval}
            onValueChange={setRequireApproval}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={requireApproval ? colors.onPrimary : '#f4f3f4'}
          />
        </View>

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveButton, mutation.isPending && { opacity: 0.7 }]}
          onPress={handleSave}
          disabled={mutation.isPending}
        >
          <Text style={styles.saveButtonText}>
            {mutation.isPending ? 'Saving...' : 'Save Settings'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    padding: 24,
    maxWidth: 600,
  },
  loadingText: {
    ...typography.body1,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 48,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 6,
  },
  backText: {
    ...typography.body2,
    color: colors.textPrimary,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    ...typography.body2,
    color: colors.textSecondary,
    marginBottom: 24,
  },
  field: {
    marginBottom: 24,
  },
  label: {
    ...typography.body1,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  helper: {
    ...typography.body2,
    color: colors.textSecondary,
    marginBottom: 8,
    fontSize: 13,
  },
  textArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.inputBackground,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    ...typography.body2,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: 4,
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.inputBackground,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
    gap: 16,
  },
  switchLabel: {
    flex: 1,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 48,
  },
  saveButtonText: {
    color: colors.onPrimary,
    fontWeight: '600',
    fontSize: 15,
  },
});
