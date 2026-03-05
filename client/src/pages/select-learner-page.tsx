import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { ArrowLeft, User, Plus } from 'react-feather';
import { useLocation } from 'wouter';
import { useMode } from '../context/ModeContext';
import { useAuth } from '../hooks/use-auth';
import { colors, typography } from '../styles/theme';

export default function SelectLearnerPage() {
  const [, setLocation] = useLocation();
  const { selectedLearner, selectLearner, availableLearners, isLoadingLearners } = useMode();
  const { user } = useAuth();

  const canCreateLearners = user?.role === 'PARENT' || user?.role === 'ADMIN';

  const handleSelectLearner = (learner: any) => {
    selectLearner(learner);
    // Navigate back to learner view after selection
    setLocation('/learner');
  };

  const handleAddLearner = () => {
    setLocation('/add-learner');
  };

  const handleGoBack = () => {
    setLocation('/learner');
  };

  if (isLoadingLearners) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
            <ArrowLeft size={20} color={colors.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>Select Learner</Text>
        </View>
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading learners...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
          <ArrowLeft size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Select Learner</Text>
      </View>

      {/* Content */}
      <ScrollView style={styles.content}>
        {/* Current Selection */}
        {selectedLearner && (
          <View style={styles.currentSection}>
            <Text style={styles.sectionTitle}>Current Learner</Text>
            <View style={styles.currentLearner}>
              <View style={styles.learnerAvatar}>
                <User size={24} color={colors.primary} />
              </View>
              <Text style={styles.currentLearnerName}>{selectedLearner.name}</Text>
            </View>
          </View>
        )}

        {/* Available Learners */}
        <View style={styles.learnersSection}>
          <Text style={styles.sectionTitle}>Available Learners</Text>
          
          {availableLearners && availableLearners.length > 0 ? (
            <View style={styles.learnersList}>
              {availableLearners.map((learner) => (
                <TouchableOpacity
                  key={learner.id.toString()}
                  style={[
                    styles.learnerButton,
                    selectedLearner?.id === learner.id && styles.selectedLearnerButton,
                  ]}
                  onPress={() => handleSelectLearner(learner)}
                >
                  <View style={styles.learnerButtonContent}>
                    <View style={styles.learnerAvatar}>
                      <User size={20} color={selectedLearner?.id === learner.id ? 'white' : colors.primary} />
                    </View>
                    <Text 
                      style={[
                        styles.learnerButtonText,
                        selectedLearner?.id === learner.id && styles.selectedLearnerButtonText,
                      ]}
                    >
                      {learner.name}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No learners available</Text>
            </View>
          )}

          {/* Add Learner Button */}
          {canCreateLearners && (
            <TouchableOpacity style={styles.addButton} onPress={handleAddLearner}>
              <Plus size={20} color="white" />
              <Text style={styles.addButtonText}>Add New Learner</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingTop: 40,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    ...typography.body1,
    color: colors.textSecondary,
  },
  currentSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  currentLearner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    padding: 16,
    borderRadius: 12,
  },
  currentLearnerName: {
    ...typography.h4,
    color: colors.primary,
    marginLeft: 12,
  },
  learnersSection: {
    flex: 1,
  },
  learnersList: {
    marginBottom: 24,
  },
  learnerButton: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  selectedLearnerButton: {
    backgroundColor: colors.primary,
  },
  learnerButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  learnerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  learnerButtonText: {
    ...typography.h4,
    color: colors.textPrimary,
    flex: 1,
  },
  selectedLearnerButtonText: {
    color: 'white',
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    ...typography.body1,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  addButtonText: {
    ...typography.button,
    color: 'white',
    marginLeft: 8,
  },
});