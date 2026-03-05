import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../utils/api';
import { useMutation, useQuery } from '@tanstack/react-query';

export default function ChangeLearnerSubjects() {
  const [_, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  // Extract learner ID from URL path
  const [path] = useLocation();
  
  // Since wouter doesn't directly expose params in functional components,
  // we need to extract the ID from the path manually
  const pathSegments = path.split('/');
  const learnerId = pathSegments[pathSegments.length - 1];

  // State for subject management
  const [subjects, setSubjects] = useState<string[]>([]);
  const [newSubject, setNewSubject] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [confirmationMessage, setConfirmationMessage] = useState<string>('');
  
  // Fetch the current learner profile
  const { data: learnerProfile, isLoading, isError } = useQuery({
    queryKey: ['/api/learner-profile', learnerId],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', `/api/learner-profile/${learnerId}`);
        return response.data;
      } catch (error) {
        console.error("Error fetching learner profile:", error);
        throw error;
      }
    },
    enabled: !!learnerId,
    retry: 2, // Retry failed requests
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
  });
  
  // Update the local subjects state when the profile is loaded
  useEffect(() => {
    if (learnerProfile && Array.isArray(learnerProfile.subjects)) {
      setSubjects(learnerProfile.subjects);
    }
  }, [learnerProfile]);
  
  // Fetch the learner details to display the name
  const { data: learnerDetails } = useQuery({
    queryKey: ['/api/learner', learnerId],
    queryFn: () => apiRequest('GET', `/api/learners/${learnerId}`).then(res => res.data),
    enabled: !!learnerId,
  });
  
  // Mutation for updating subjects
  const updateSubjectsMutation = useMutation({
    mutationFn: (updatedSubjects: string[]) => 
      apiRequest('PUT', `/api/learner-profile/${learnerId}`, {
        subjects: updatedSubjects
      }).then(res => res.data),
    onMutate: () => {
      setSaveStatus('saving');
      setErrorMessage('');
    },
    onSuccess: (data: any) => {
      setSaveStatus('success');
      setConfirmationMessage('Subjects updated successfully!');

      if (data.subjects && JSON.stringify(data.subjects) !== JSON.stringify(subjects)) {
        setErrorMessage('Warning: There may be a discrepancy between local and server data.');
      }

      // Invalidate relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/learner-profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/learners'] });
    },
    onError: (error: any) => {
      setSaveStatus('error');
      console.error("Error updating subjects:", error);
      setErrorMessage(error.message || 'An error occurred while saving subjects');
    }
  });
  
  // Add a new subject to the list
  const handleAddSubject = () => {
    const subjectToAdd = newSubject.trim();
    
    if (!subjectToAdd) {
      return;
    }
    
    if (subjects.includes(subjectToAdd)) {
      // Use standard alert for web compatibility
      alert(`"${subjectToAdd}" is already in your subjects list.`);
      return;
    }
    
    // Update local state with the new subject
    const updatedSubjects = [...subjects, subjectToAdd];

    // Update state
    setSubjects(updatedSubjects);
    setNewSubject(''); // Clear input
    setConfirmationMessage(`Added "${subjectToAdd}" to subjects list`);
  };
  
  // Remove a subject from the list
  const handleRemoveSubject = (index: number) => {
    const subjectToRemove = subjects[index];
    const updatedSubjects = subjects.filter((_, i) => i !== index);
    setSubjects(updatedSubjects);
    setConfirmationMessage(`Removed "${subjectToRemove}" from subjects list`);
  };
  
  // Save changes to the server
  const handleSaveChanges = async () => {
    if (subjects.length === 0) {
      setErrorMessage('Please add at least one subject');
      return;
    }
    
    try {
      // Save the subjects to the database
      await updateSubjectsMutation.mutateAsync(subjects);

      // After saving, fetch the profile again to verify subjects were saved
      const response = await apiRequest('GET', `/api/learner-profile/${learnerId}`);
      const refreshedProfile = response.data;

      // Deep comparison of the arrays
      const sortedOriginal = [...subjects].sort();
      const sortedFromDB = [...(refreshedProfile.subjects || [])].sort();
      const arraysMatch = JSON.stringify(sortedOriginal) === JSON.stringify(sortedFromDB);

      if (!arraysMatch) {
        setErrorMessage('Warning: Database verification failed. Some subjects may not have been saved correctly.');
      }
    } catch (error) {
      console.error("Error during save or verification:", error);
    }
  };
  
  // Go back to the main learners page
  const handleCancel = () => {
    setLocation('/learners');
  };
  
  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Loading learner data...</Text>
      </View>
    );
  }
  
  if (isError || !learnerId) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Error loading learner data. Please try again.</Text>
        <TouchableOpacity style={styles.button} onPress={handleCancel}>
          <Text style={styles.buttonText}>Back to Learners</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Manage Subjects</Text>
        <Text style={styles.subtitle}>
          {learnerDetails ? `For: ${learnerDetails.name}` : `Learner ID: ${learnerId}`}
        </Text>
      </View>
      
      <View style={styles.formContainer}>
        <View style={styles.currentSubjectsContainer}>
          <Text style={styles.sectionTitle}>Current Subjects</Text>
          <ScrollView style={styles.subjectsList}>
            {subjects.length === 0 ? (
              <Text style={styles.emptyText}>No subjects added yet</Text>
            ) : (
              subjects.map((subject, index) => (
                <View key={index} style={styles.subjectItem}>
                  <Text style={styles.subjectText}>{subject}</Text>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveSubject(index)}
                  >
                    <Text style={styles.removeButtonText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        </View>
        
        <View style={styles.addSubjectContainer}>
          <Text style={styles.sectionTitle}>Add New Subject</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Enter subject name"
              value={newSubject}
              onChangeText={setNewSubject}
            />
            <TouchableOpacity 
              style={styles.addButton}
              onPress={handleAddSubject}
              disabled={!newSubject.trim()}
            >
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {confirmationMessage ? (
          <Text style={styles.confirmationText}>{confirmationMessage}</Text>
        ) : null}
        
        {errorMessage ? (
          <Text style={styles.errorText}>{errorMessage}</Text>
        ) : null}
        
        {saveStatus === 'success' && (
          <View style={styles.successContainer}>
            <Text style={styles.successText}>
              ✓ Changes successfully saved to database
            </Text>
          </View>
        )}
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={[styles.button, styles.cancelButton]} 
            onPress={handleCancel}
          >
            <Text style={styles.buttonText}>Cancel</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, styles.saveButton, saveStatus === 'saving' && styles.savingButton]} 
            onPress={handleSaveChanges}
            disabled={saveStatus === 'saving'}
          >
            <Text style={styles.buttonText}>
              {saveStatus === 'saving' ? 'Saving...' : 'Save Changes'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
  },
  formContainer: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#444',
  },
  currentSubjectsContainer: {
    marginBottom: 20,
  },
  subjectsList: {
    maxHeight: 200,
    marginBottom: 10,
  },
  subjectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f0f0ff',
    padding: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  subjectText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  removeButton: {
    backgroundColor: '#ff6b6b',
    borderRadius: 15,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  addSubjectContainer: {
    marginBottom: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 12,
    marginRight: 10,
    fontSize: 16,
  },
  addButton: {
    backgroundColor: '#4c6ef5',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 6,
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 6,
    minWidth: 120,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#6c757d',
    marginRight: 10,
  },
  saveButton: {
    backgroundColor: '#228B22',
  },
  savingButton: {
    backgroundColor: '#64ad64',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorText: {
    color: '#e74c3c',
    marginVertical: 10,
  },
  confirmationText: {
    color: '#2ecc71',
    marginVertical: 10,
  },
  emptyText: {
    color: '#aaa',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
  successContainer: {
    backgroundColor: '#d4edda',
    borderColor: '#c3e6cb',
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    marginVertical: 10,
  },
  successText: {
    color: '#155724',
    fontSize: 16,
  },
});