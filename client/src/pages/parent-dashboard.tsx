import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '../lib/queryClient';
import { useAuth } from '../hooks/use-auth';
import { useToast } from '../hooks/use-toast';
import { colors, typography, commonStyles } from '../styles/theme';
import { User, Book, Plus, X, Award, BarChart2, Download } from 'react-feather';
import { getGradeDisplayTextWithAge } from '../utils/gradeHelpers';

const ParentDashboard = ({ navigation }: any) => {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const [modalVisible, setModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [currentEditLearner, setCurrentEditLearner] = useState<any>(null);
  
  // Form state
  const [childName, setChildName] = useState('');
  const [childUsername, setChildUsername] = useState('');
  const [childEmail, setChildEmail] = useState('');
  const [childPassword, setChildPassword] = useState('');
  const [gradeLevel, setGradeLevel] = useState('3');
  
  // Fetch learner accounts for this parent
  const {
    data: learners,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['/api/learners'],
    queryFn: () => apiRequest('GET', '/api/learners').then(res => res.data),
  });
  
  // Fetch learner profiles to get grade level info
  const {
    data: learnerProfiles,
    isLoading: profilesLoading,
  } = useQuery({
    queryKey: ['/api/learner-profiles'],
    queryFn: async () => {
      if (!learners || learners.length === 0) return {};
      
      // Create an object mapping userId to profile
      const profiles = {};
      
      // Fetch profiles for each learner
      await Promise.all(
        learners.map(async (learner) => {
          try {
            const response = await apiRequest('GET', `/api/learner-profile/${learner.id}`);
            profiles[learner.id] = response.data;
          } catch (err) {
            console.error(`Failed to fetch profile for learner ${learner.id}`, err);
          }
        })
      );
      
      return profiles;
    },
    enabled: !!learners && learners.length > 0,
  });
  
  // Create child account mutation
  const createChildMutation = useMutation({
    mutationFn: (childData: any) =>
      apiRequest('POST', '/api/register', {
        ...childData,
        role: 'LEARNER',
        parentId: user?.id,
      }).then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/learners'] });
      queryClient.invalidateQueries({ queryKey: ['/api/learner-profiles'] });
      setModalVisible(false);
      clearForm();
      toast({
        title: 'Success',
        description: 'Child account created successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  
  // Update learner grade level mutation
  const updateGradeLevelMutation = useMutation({
    mutationFn: ({ userId, gradeLevel }: { userId: number, gradeLevel: string }) =>
      apiRequest('PUT', `/api/learner-profile/${userId}`, {
        gradeLevel
      }).then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/learner-profiles'] });
      setEditModalVisible(false);
      setCurrentEditLearner(null);
      toast({
        title: 'Success',
        description: 'Grade level updated successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update grade level',
        variant: 'destructive',
      });
    },
  });
  
  const clearForm = () => {
    setChildName('');
    setChildUsername('');
    setChildEmail('');
    setChildPassword('');
    setGradeLevel('3');
  };
  
  const handleCreateChild = () => {
    if (!childName || !childUsername || !childEmail || !childPassword || !gradeLevel) {
      toast({
        title: 'Error',
        description: 'Please fill in all fields',
        variant: 'destructive',
      });
      return;
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(childEmail)) {
      toast({
        title: 'Error',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }
    
    // Handle Kindergarten (K) and validate grade level (1-12)
    let gradeLevelNum: number;
    
    if (gradeLevel === 'K') {
      gradeLevelNum = 0; // Kindergarten is grade 0
    } else {
      gradeLevelNum = parseInt(gradeLevel);
      if (isNaN(gradeLevelNum) || gradeLevelNum < 1 || gradeLevelNum > 12) {
        toast({
          title: 'Error',
          description: 'Grade level must be between K and 12',
          variant: 'destructive',
        });
        return;
      }
    }
    
    createChildMutation.mutate({
      username: childUsername,
      email: childEmail,
      name: childName,
      password: childPassword,
      gradeLevel: gradeLevelNum,
    });
  };
  
  const renderLearnerItem = ({ item }: { item: any }) => {
    // Get learner profile if available
    const profile = learnerProfiles?.[item.id];
    const gradeLevel = profile?.gradeLevel !== undefined ? profile.gradeLevel : null;

    return (
      <TouchableOpacity
        style={styles.learnerCard}
        onPress={() => navigation.navigate('ProgressPage', { learnerId: item.id })}
      >
        <View style={styles.avatarContainer}>
          <User size={24} color={colors.primary} />
        </View>
        <View style={styles.learnerInfo}>
          <Text style={styles.learnerName}>{item.name}</Text>
          <Text style={styles.learnerEmail}>{item.email}</Text>
          {gradeLevel !== null && (
            <View style={styles.gradeBadge}>
              <Text style={styles.gradeBadgeText}>
                {getGradeDisplayTextWithAge(gradeLevel)}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.editButton]}
            onPress={() => {
              setCurrentEditLearner(item);
              // Set initial grade level for edit
              setGradeLevel(gradeLevel === 0 ? 'K' : gradeLevel?.toString() || '5');
              setEditModalVisible(true);
            }}
          >
            <Text style={styles.actionButtonText}>Edit Grade</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.progressButton]}
            onPress={() => navigation.navigate('ProgressPage', { learnerId: item.id })}
          >
            <BarChart2 size={16} color={colors.onPrimary} />
            <Text style={styles.actionButtonText}>Progress</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.exportButton]}
            onPress={() => {
              // Open export endpoint in new window for download
              window.open(`/api/export?learnerId=${item.id}`, '_blank');
            }}
          >
            <Download size={16} color={colors.onPrimary} />
            <Text style={styles.actionButtonText}>Export</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };
  
  if (error) {
    return (
      <View style={[commonStyles.container, commonStyles.center]}>
        <Text style={styles.errorText}>
          Error loading learner accounts. Please try again.
        </Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => queryClient.invalidateQueries({ queryKey: ['/api/learners'] })}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  return (
    <View style={commonStyles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Hello, {user?.name}</Text>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => logoutMutation.mutate()}
        >
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Your Children</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <Plus size={20} color={colors.onPrimary} />
          <Text style={styles.addButtonText}>Add Child</Text>
        </TouchableOpacity>
      </View>
      
      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
      ) : (
        <FlatList
          data={learners}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderLearnerItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                You haven't added any children yet. Create an account for your child to get started!
              </Text>
              <TouchableOpacity
                style={styles.emptyAddButton}
                onPress={() => setModalVisible(true)}
              >
                <Text style={styles.emptyAddButtonText}>Add Child Account</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
      
      {/* Information section */}
      <View style={styles.infoContainer}>
        <Text style={styles.infoTitle}>How It Works</Text>
        
        <View style={styles.infoCard}>
          <View style={styles.infoIconContainer}>
            <User size={24} color={colors.primary} />
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoCardTitle}>Create Child Account</Text>
            <Text style={styles.infoCardText}>
              Create personalized accounts for each of your children
            </Text>
          </View>
        </View>
        
        <View style={styles.infoCard}>
          <View style={styles.infoIconContainer}>
            <Book size={24} color={colors.primary} />
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoCardTitle}>Personalized Learning</Text>
            <Text style={styles.infoCardText}>
              AI adapts to your child's learning style and pace
            </Text>
          </View>
        </View>
        
        <View style={styles.infoCard}>
          <View style={styles.infoIconContainer}>
            <Award size={24} color={colors.primary} />
          </View>
          <View style={styles.infoContent}>
            <Text style={styles.infoCardTitle}>Track Progress</Text>
            <Text style={styles.infoCardText}>
              Monitor your child's learning journey and achievements
            </Text>
          </View>
        </View>
      </View>
      
      {/* Modal for creating child account */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Child Account</Text>
              <TouchableOpacity
                onPress={() => {
                  setModalVisible(false);
                  clearForm();
                }}
              >
                <X size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Child's Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter child's name"
                  value={childName}
                  onChangeText={setChildName}
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Username</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Create username for child"
                  value={childUsername}
                  onChangeText={setChildUsername}
                  autoCapitalize="none"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter email for child"
                  keyboardType="email-address"
                  value={childEmail}
                  onChangeText={setChildEmail}
                  autoCapitalize="none"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Create password for child"
                  secureTextEntry
                  value={childPassword}
                  onChangeText={setChildPassword}
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Grade Level</Text>
                <View style={styles.gradeLevelPickerContainer}>
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.gradeLevelPicker}
                  >
                    {[
                      { value: 'K', label: 'Kindergarten' },
                      { value: '1', label: 'Grade 1' },
                      { value: '2', label: 'Grade 2' },
                      { value: '3', label: 'Grade 3' },
                      { value: '4', label: 'Grade 4' },
                      { value: '5', label: 'Grade 5' },
                      { value: '6', label: 'Grade 6' },
                      { value: '7', label: 'Grade 7' },
                      { value: '8', label: 'Grade 8' },
                      { value: '9', label: 'Grade 9' },
                      { value: '10', label: 'Grade 10' },
                      { value: '11', label: 'Grade 11' },
                      { value: '12', label: 'Grade 12' },
                    ].map((grade) => (
                      <TouchableOpacity
                        key={grade.value}
                        style={[
                          styles.gradeLevelButton,
                          gradeLevel === grade.value && styles.gradeLevelButtonActive,
                        ]}
                        onPress={() => setGradeLevel(grade.value)}
                      >
                        <Text style={[
                          styles.gradeLevelButtonText,
                          gradeLevel === grade.value && styles.gradeLevelButtonTextActive,
                        ]}>
                          {grade.value === 'K' ? 'K' : grade.value}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </ScrollView>
            
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setModalVisible(false);
                  clearForm();
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.createButton}
                onPress={handleCreateChild}
                disabled={createChildMutation.isPending}
              >
                <Text style={styles.createButtonText}>
                  {createChildMutation.isPending ? 'Creating...' : 'Create Account'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Edit Grade Level Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={editModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Update Grade Level
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setEditModalVisible(false);
                  setCurrentEditLearner(null);
                }}
              >
                <X size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <Text style={styles.editLearnerName}>
                {currentEditLearner?.name}
              </Text>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Grade Level</Text>
                <View style={styles.gradeLevelPickerContainer}>
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.gradeLevelPicker}
                  >
                    {[
                      { value: 'K', label: 'Kindergarten' },
                      { value: '1', label: 'Grade 1' },
                      { value: '2', label: 'Grade 2' },
                      { value: '3', label: 'Grade 3' },
                      { value: '4', label: 'Grade 4' },
                      { value: '5', label: 'Grade 5' },
                      { value: '6', label: 'Grade 6' },
                      { value: '7', label: 'Grade 7' },
                      { value: '8', label: 'Grade 8' },
                      { value: '9', label: 'Grade 9' },
                      { value: '10', label: 'Grade 10' },
                      { value: '11', label: 'Grade 11' },
                      { value: '12', label: 'Grade 12' },
                    ].map((grade) => (
                      <TouchableOpacity
                        key={grade.value}
                        style={[
                          styles.gradeLevelButton,
                          gradeLevel === grade.value && styles.gradeLevelButtonActive,
                        ]}
                        onPress={() => setGradeLevel(grade.value)}
                      >
                        <Text style={[
                          styles.gradeLevelButtonText,
                          gradeLevel === grade.value && styles.gradeLevelButtonTextActive,
                        ]}>
                          {grade.value === 'K' ? 'K' : grade.value}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>
            </ScrollView>
            
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setEditModalVisible(false);
                  setCurrentEditLearner(null);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.createButton}
                onPress={() => {
                  if (currentEditLearner?.id) {
                    updateGradeLevelMutation.mutate({
                      userId: currentEditLearner.id,
                      gradeLevel
                    });
                  }
                }}
                disabled={updateGradeLevelMutation.isPending}
              >
                <Text style={styles.createButtonText}>
                  {updateGradeLevelMutation.isPending ? 'Updating...' : 'Update Grade'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  gradeLevelPickerContainer: {
    marginTop: 8,
  },
  gradeLevelPicker: {
    paddingVertical: 8,
  },
  gradeLevelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  gradeLevelButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  gradeLevelButtonText: {
    ...typography.button,
    color: colors.textPrimary,
  },
  gradeLevelButtonTextActive: {
    color: colors.onPrimary,
  },
  gradeBadge: {
    marginTop: 4,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  gradeBadgeText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '500',
  },
  editButton: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  editLearnerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: 15,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  greeting: {
    ...typography.h2,
    marginBottom: 0,
  },
  logoutButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  logoutButtonText: {
    color: colors.onError,
    fontWeight: '600',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  listTitle: {
    ...typography.h3,
    marginBottom: 0,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
  },
  addButtonText: {
    color: colors.onPrimary,
    marginLeft: 4,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  learnerCard: {
    ...commonStyles.card,
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
    marginHorizontal: 0,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  learnerInfo: {
    flex: 1,
  },
  learnerName: {
    ...typography.subtitle1,
  },
  learnerEmail: {
    ...typography.body2,
  },
  actionButtons: {
    flexDirection: 'row',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginLeft: 8,
  },
  progressButton: {
    backgroundColor: colors.primary,
  },
  exportButton: {
    backgroundColor: colors.secondary,
  },
  actionButtonText: {
    color: colors.onPrimary,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  emptyText: {
    ...typography.body1,
    textAlign: 'center',
    color: colors.textSecondary,
    marginBottom: 16,
  },
  emptyAddButton: {
    ...commonStyles.button,
    marginTop: 8,
  },
  emptyAddButtonText: {
    ...commonStyles.buttonText,
  },
  loader: {
    marginTop: 40,
  },
  errorText: {
    ...typography.body1,
    color: colors.error,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 24,
  },
  retryButton: {
    ...commonStyles.button,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  retryButtonText: {
    ...commonStyles.buttonText,
    fontSize: 14,
  },
  infoContainer: {
    padding: 16,
    backgroundColor: colors.surfaceColor,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  infoTitle: {
    ...typography.h3,
    marginBottom: 16,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoCardTitle: {
    ...typography.subtitle1,
    marginBottom: 4,
  },
  infoCardText: {
    ...typography.body2,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '90%',
    maxWidth: 500,
    backgroundColor: colors.surfaceColor,
    borderRadius: 8,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  modalTitle: {
    ...typography.h3,
    marginBottom: 0,
  },
  modalBody: {
    padding: 16,
    maxHeight: 400,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    ...typography.subtitle2,
    marginBottom: 8,
  },
  input: {
    ...commonStyles.input,
    marginBottom: 0,
  },
  cancelButton: {
    ...commonStyles.outlineButton,
    marginRight: 12,
  },
  cancelButtonText: {
    ...commonStyles.outlineButtonText,
  },
  createButton: {
    ...commonStyles.button,
  },
  createButtonText: {
    ...commonStyles.buttonText,
  },
});

export default ParentDashboard;
