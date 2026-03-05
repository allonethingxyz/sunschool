import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native';
import { useAuth } from '../hooks/use-auth';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';
import { colors, typography, commonStyles } from '../styles/theme';
import { useLocation } from 'wouter';
import { Plus, BarChart2, Download, Edit } from 'react-feather';

const LearnersPage: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [subjectsModalVisible, setSubjectsModalVisible] = useState(false); 
  const [graphModalVisible, setGraphModalVisible] = useState(false);
  const [currentEditLearner, setCurrentEditLearner] = useState<any>(null);
  const [currentProfile, setCurrentProfile] = useState<any>(null);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [recommendedSubjects, setRecommendedSubjects] = useState<string[]>([]);
  const [strugglingAreas, setStrugglingAreas] = useState<string[]>([]);
  const [graph, setGraph] = useState<{nodes: any[], edges: any[]}>({nodes: [], edges: []});
  const [editGradeLevel, setEditGradeLevel] = useState('');
  const [newNodeName, setNewNodeName] = useState('');
  const [newEdgeFrom, setNewEdgeFrom] = useState('');
  const [newEdgeTo, setNewEdgeTo] = useState('');
  const [error, setError] = useState('');
  
  // Fetch learners data
  const {
    data: learners = [],
    isLoading,
    error: fetchError
  } = useQuery({
    queryKey: ["/api/learners", user?.id, user?.role],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/learners');
      return response.data;
    },
  });

  // Fetch learner profiles
  const {
    data: learnerProfiles = {},
    isLoading: isLoadingProfiles,
  } = useQuery({
    queryKey: ['/api/learner-profiles', learners],
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

  // Update grade level mutation
  const updateGradeLevelMutation = useMutation({
    mutationFn: ({ userId, gradeLevel }: { userId: number, gradeLevel: string }) =>
      apiRequest('PUT', `/api/learner-profile/${userId}`, {
        gradeLevel
      }).then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/learner-profiles', learners] });
      setEditModalVisible(false);
      setCurrentEditLearner(null);
      setError('');
    },
    onError: (err: any) => {
      // Try to extract a meaningful error message
      let errorMessage = 'Failed to update grade level. Please try again.';
      
      if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    },
  });
  
  // Update subjects mutation
  const updateSubjectsMutation = useMutation({
    mutationFn: ({ userId, subjects, recommendedSubjects, strugglingAreas }: 
      { userId: number, subjects: string[], recommendedSubjects: string[], strugglingAreas: string[] }) =>
      apiRequest('PUT', `/api/learner-profile/${userId}`, {
        subjects,
        recommendedSubjects,
        strugglingAreas
      }).then(res => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/learner-profiles', learners] });
      setSubjectsModalVisible(false);
      setCurrentProfile(null);
      setError('');
    },
    onError: (err: any) => {
      // Try to extract a meaningful error message
      let errorMessage = 'Failed to update subjects. Please try again.';
      
      if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    },
  });
  
  // Update knowledge graph mutation
  const updateGraphMutation = useMutation({
    mutationFn: ({ userId, graph }: { userId: number, graph: any }) =>
      apiRequest('PUT', `/api/learner-profile/${userId}`, {
        graph
      }).then(res => res.data),
    onSuccess: () => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/learner-profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/learners'] });
      // Provide user feedback and close modal
      alert('Knowledge graph updated successfully!');
      setGraphModalVisible(false);
      setCurrentProfile(null);
      setError('');
    },
    onError: (err: any) => {
      console.error('Error updating graph:', err);
      // Try to extract a meaningful error message
      let errorMessage = 'Failed to update knowledge graph. Please try again.';
      
      if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    },
  });
  
  const handleUpdateGradeLevel = () => {
    if (!currentEditLearner) {
      setError('No learner selected for editing');
      return;
    }
    
    let gradeLevelNum: number;
    if (editGradeLevel === 'K') {
      gradeLevelNum = 0; // Kindergarten
    } else {
      gradeLevelNum = parseInt(editGradeLevel);
      if (isNaN(gradeLevelNum) || gradeLevelNum < 0 || gradeLevelNum > 12) {
        setError('Please enter a valid grade level (K or 1-12)');
        return;
      }
    }
    
    updateGradeLevelMutation.mutate({
      userId: currentEditLearner.id,
      gradeLevel: gradeLevelNum.toString(),
    });
  };
  
  const handleUpdateSubjects = () => {
    if (!currentProfile || !currentEditLearner) {
      setError('No learner selected for editing');
      return;
    }
    
    // Make sure all subjects are correctly included
    updateSubjectsMutation.mutate({
      userId: currentEditLearner.id,
      subjects: subjects, // Explicitly use the current subjects state
      recommendedSubjects,
      strugglingAreas
    }, {
      onSuccess: () => {
        // Add successful update confirmation
        alert("Subjects updated successfully!");

        // Close modal and update state as before
        queryClient.invalidateQueries({ queryKey: ['/api/learner-profile'] });
        queryClient.invalidateQueries({ queryKey: ['/api/learners'] });
        setSubjectsModalVisible(false);
        setCurrentProfile(null);
        setError('');
      },
      onError: (error) => {
        console.error("Error updating subjects:", error);
        alert("Error saving subjects. Please try again.");
      }
    });
  };
  
  const handleAddNode = () => {
    if (!newNodeName.trim()) {
      setError('Please enter a node name');
      return;
    }
    
    const newNode = {
      id: newNodeName.toLowerCase().replace(/\s+/g, '_'),
      label: newNodeName.trim(),
    };
    
    // Check if node with same id already exists
    if (graph.nodes.find(node => node.id === newNode.id)) {
      setError(`A node with the id '${newNode.id}' already exists`);
      return;
    }
    
    setGraph({
      ...graph,
      nodes: [...graph.nodes, newNode],
    });
    
    setNewNodeName('');
    setError('');
  };
  
  const handleAddEdge = () => {
    if (!newEdgeFrom || !newEdgeTo) {
      setError('Please select both source and target nodes');
      return;
    }
    
    if (newEdgeFrom === newEdgeTo) {
      setError('Source and target nodes must be different');
      return;
    }
    
    // Check if this edge already exists
    if (graph.edges.find(edge => edge.source === newEdgeFrom && edge.target === newEdgeTo)) {
      setError('This connection already exists');
      return;
    }
    
    const newEdge = {
      source: newEdgeFrom,
      target: newEdgeTo,
    };
    
    setGraph({
      ...graph,
      edges: [...graph.edges, newEdge],
    });
    
    setNewEdgeFrom('');
    setNewEdgeTo('');
    setError('');
  };
  
  const handleDeleteNode = (nodeId: string) => {
    // Remove the node
    const updatedNodes = graph.nodes.filter(node => node.id !== nodeId);
    
    // Remove any edges connected to this node
    const updatedEdges = graph.edges.filter(
      edge => edge.source !== nodeId && edge.target !== nodeId
    );
    
    setGraph({
      nodes: updatedNodes,
      edges: updatedEdges,
    });
  };
  
  const handleDeleteEdge = (source: string, target: string) => {
    const updatedEdges = graph.edges.filter(
      edge => !(edge.source === source && edge.target === target)
    );
    
    setGraph({
      ...graph,
      edges: updatedEdges,
    });
  };
  
  const openEditModal = (learner: any) => {
    setCurrentEditLearner(learner);
    const profile = learnerProfiles[learner.id];
    const currentGradeLevel = profile && profile.gradeLevel !== undefined
      ? profile.gradeLevel
      : '5';
    
    setEditGradeLevel(currentGradeLevel.toString());
    setEditModalVisible(true);
  };
  
  const handleUpdateGraph = () => {
    if (!currentEditLearner) {
      setError('No learner selected for editing');
      return;
    }
    
    // Use the current graph state
    updateGraphMutation.mutate({
      userId: currentEditLearner.id,
      graph
    });
  };
  
  const openSubjectsModal = (learner: any, profile: any) => {
    setCurrentEditLearner(learner);
    setCurrentProfile(profile);
    // Initialize state with current values
    setSubjects(profile.subjects || ['Math', 'Reading', 'Science']);
    setRecommendedSubjects(profile.recommendedSubjects || []);
    setStrugglingAreas(profile.strugglingAreas || []);
    setSubjectsModalVisible(true);
  };
  
  const openGraphModal = (learner: any, profile: any) => {
    setCurrentEditLearner(learner);
    setCurrentProfile(profile);
    // Initialize with existing graph or default
    if (profile && profile.graph) {
      setGraph(profile.graph);
    } else {
      setGraph({
        nodes: [
          { id: 'math', label: 'Mathematics' },
          { id: 'algebra', label: 'Algebra' },
          { id: 'geometry', label: 'Geometry' },
          { id: 'reading', label: 'Reading' }
        ],
        edges: [
          { source: 'math', target: 'algebra' },
          { source: 'math', target: 'geometry' },
        ]
      });
    }
    setGraphModalVisible(true);
  };

  const renderLearnerItem = ({ item }: { item: any }) => {
    // Get the learner profile to display grade level
    const profile = learnerProfiles?.[item.id];
    const gradeLevel = profile?.gradeLevel !== undefined ? profile.gradeLevel : null;
    
    return (
      <TouchableOpacity style={styles.learnerCard}>
        <View style={styles.learnerInfo}>
          <Text style={styles.learnerName}>{item.name}</Text>
          <Text style={styles.learnerEmail}>{item.email}</Text>
          {gradeLevel !== null && (
            <View style={styles.gradeBadge}>
              <Text style={styles.gradeBadgeText}>
                {gradeLevel === 0 ? 'K' : `Grade ${gradeLevel}`}
              </Text>
            </View>
          )}
        </View>
        
        <View style={styles.learnerActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => openEditModal(item)}
          >
            <Edit size={18} color={colors.primary} />
            <Text style={styles.actionButtonText}>Edit</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => openSubjectsModal(item, profile)}
          >
            <BarChart2 size={18} color={colors.primary} />
            <Text style={styles.actionButtonText}>Subjects</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => openGraphModal(item, profile)}
          >
            <Download size={18} color={colors.primary} />
            <Text style={styles.actionButtonText}>Graph</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setLocation(`/change-learner-subjects/${item.id}`)}
          >
            <Edit size={18} color={colors.primary} />
            <Text style={styles.actionButtonText}>Customize</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Learners</Text>
        <Text style={styles.headerSubtitle}>
          {user?.role === 'ADMIN' 
            ? 'Manage all learner accounts' 
            : 'Manage your children\'s learning profiles'}
        </Text>
      </View>
      
      <View style={styles.contentContainer}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>{user?.role === 'PARENT' ? 'Your Children' : 'Learners'}</Text>
          {(user?.role === 'PARENT' || user?.role === 'ADMIN') && (
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setLocation('/add-learner')}
            >
              <Plus size={20} color={colors.onPrimary} />
              <Text style={styles.addButtonText}>{user?.role === 'ADMIN' ? 'Add Learner' : 'Add Child'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
        ) : fetchError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              Error loading learner accounts. Please try again.
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => queryClient.invalidateQueries({ queryKey: ["/api/learners", user?.id, user?.role] })}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={learners}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderLearnerItem}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {user?.role === 'PARENT'
                    ? "You haven't added any children yet. Create an account for your child to get started!"
                    : "No learners found. Add a learner to get started."}
                </Text>
                {(user?.role === 'PARENT' || user?.role === 'ADMIN') && (
                  <TouchableOpacity
                    style={styles.emptyAddButton}
                    onPress={() => setLocation('/add-learner')}
                  >
                    <Text style={styles.emptyAddButtonText}>
                      {user?.role === 'ADMIN' ? 'Add Learner Account' : 'Add Child Account'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            }
          />
        )}
      </View>

      {/* Edit Grade Level Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={editModalVisible}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>
              Update Grade Level
            </Text>

            <View style={styles.modalContent}>
              <Text style={styles.editLearnerName}>
                {currentEditLearner?.name}
              </Text>
              
              <Text style={styles.inputLabel}>Grade Level</Text>
              <View style={styles.gradeLevelContainer}>
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
                        editGradeLevel === grade.value && styles.gradeLevelButtonActive,
                      ]}
                      onPress={() => setEditGradeLevel(grade.value)}
                    >
                      <Text style={[
                        styles.gradeLevelButtonText,
                        editGradeLevel === grade.value && styles.gradeLevelButtonTextActive,
                      ]}>
                        {grade.value === 'K' ? 'K' : grade.value}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setEditModalVisible(false);
                    setCurrentEditLearner(null);
                    setError('');
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleUpdateGradeLevel}
                >
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Subjects Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={subjectsModalVisible}
        onRequestClose={() => setSubjectsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>
              Manage Subjects
            </Text>

            <ScrollView style={styles.modalContent}>
              <Text style={styles.editLearnerName}>
                {currentEditLearner?.name}
              </Text>
              
              <View style={styles.subjectsSection}>
                <Text style={styles.sectionTitle}>Active Subjects</Text>
                <View style={styles.chipContainer}>
                  {subjects.map((subject, index) => (
                    <View key={`subject-${index}`} style={styles.chip}>
                      <Text style={styles.chipText}>{subject}</Text>
                      <TouchableOpacity
                        onPress={() => setSubjects(subjects.filter((_, i) => i !== index))}
                        style={styles.chipRemove}
                      >
                        <Text style={styles.chipRemoveText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
                <View style={styles.addSubjectContainer}>
                  <TextInput
                    style={styles.addSubjectInput}
                    placeholder="Add a subject..."
                    onSubmitEditing={(e) => {
                      const newSubject = e.nativeEvent.text.trim();
                      if (newSubject && !subjects.includes(newSubject)) {
                        setSubjects([...subjects, newSubject]);
                      }
                    }}
                  />
                </View>
              </View>
              
              <View style={styles.subjectsSection}>
                <Text style={styles.sectionTitle}>Recommended Subjects</Text>
                <View style={styles.chipContainer}>
                  {recommendedSubjects.map((subject, index) => (
                    <View key={`recommended-${index}`} style={styles.recommendedChip}>
                      <Text style={styles.chipText}>{subject}</Text>
                      <TouchableOpacity
                        onPress={() => setRecommendedSubjects(recommendedSubjects.filter((_, i) => i !== index))}
                        style={styles.chipRemove}
                      >
                        <Text style={styles.chipRemoveText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
                <View style={styles.addSubjectContainer}>
                  <TextInput
                    style={styles.addSubjectInput}
                    placeholder="Add a recommended subject..."
                    onSubmitEditing={(e) => {
                      const newSubject = e.nativeEvent.text.trim();
                      if (newSubject && !recommendedSubjects.includes(newSubject)) {
                        setRecommendedSubjects([...recommendedSubjects, newSubject]);
                      }
                    }}
                  />
                </View>
              </View>
              
              <View style={styles.subjectsSection}>
                <Text style={styles.sectionTitle}>Areas Needing Improvement</Text>
                <View style={styles.chipContainer}>
                  {strugglingAreas.map((subject, index) => (
                    <View key={`struggling-${index}`} style={styles.strugglingChip}>
                      <Text style={styles.chipText}>{subject}</Text>
                      <TouchableOpacity
                        onPress={() => setStrugglingAreas(strugglingAreas.filter((_, i) => i !== index))}
                        style={styles.chipRemove}
                      >
                        <Text style={styles.chipRemoveText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
                <View style={styles.addSubjectContainer}>
                  <TextInput
                    style={styles.addSubjectInput}
                    placeholder="Add a struggling area..."
                    onSubmitEditing={(e) => {
                      const newSubject = e.nativeEvent.text.trim();
                      if (newSubject && !strugglingAreas.includes(newSubject)) {
                        setStrugglingAreas([...strugglingAreas, newSubject]);
                      }
                    }}
                  />
                </View>
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setSubjectsModalVisible(false);
                    setCurrentProfile(null);
                    setError('');
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleUpdateSubjects}
                >
                  <Text style={styles.saveButtonText}>Save Changes</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Knowledge Graph Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={graphModalVisible}
        onRequestClose={() => setGraphModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>
              Knowledge Graph
            </Text>

            <ScrollView style={styles.modalContent}>
              <Text style={styles.editLearnerName}>
                {currentEditLearner?.name}
              </Text>
              
              <View style={styles.graphSection}>
                <Text style={styles.sectionTitle}>Knowledge Nodes</Text>
                <View style={styles.chipContainer}>
                  {graph.nodes.map((node) => (
                    <View key={node.id} style={styles.nodeChip}>
                      <Text style={styles.chipText}>{node.label}</Text>
                      <TouchableOpacity
                        onPress={() => handleDeleteNode(node.id)}
                        style={styles.chipRemove}
                      >
                        <Text style={styles.chipRemoveText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
                <View style={styles.graphInputContainer}>
                  <TextInput
                    style={styles.graphInput}
                    placeholder="New node name..."
                    value={newNodeName}
                    onChangeText={setNewNodeName}
                  />
                  <TouchableOpacity 
                    style={styles.graphAddButton}
                    onPress={handleAddNode}
                  >
                    <Text style={styles.graphAddButtonText}>Add Node</Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              <View style={styles.graphSection}>
                <Text style={styles.sectionTitle}>Knowledge Connections</Text>
                <View style={styles.graphInputContainer}>
                  <View style={styles.edgeSelectors}>
                    <View style={styles.edgeSelector}>
                      <Text style={styles.edgeSelectorLabel}>From:</Text>
                      <ScrollView 
                        horizontal 
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.edgeSelectorScroll}
                      >
                        {graph.nodes.map((node) => (
                          <TouchableOpacity
                            key={`from-${node.id}`}
                            style={[
                              styles.edgeNodeButton,
                              newEdgeFrom === node.id && styles.edgeNodeButtonActive,
                            ]}
                            onPress={() => setNewEdgeFrom(node.id)}
                          >
                            <Text style={[
                              styles.edgeNodeButtonText,
                              newEdgeFrom === node.id && styles.edgeNodeButtonTextActive,
                            ]}>
                              {node.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                    
                    <View style={styles.edgeSelector}>
                      <Text style={styles.edgeSelectorLabel}>To:</Text>
                      <ScrollView 
                        horizontal 
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.edgeSelectorScroll}
                      >
                        {graph.nodes.map((node) => (
                          <TouchableOpacity
                            key={`to-${node.id}`}
                            style={[
                              styles.edgeNodeButton,
                              newEdgeTo === node.id && styles.edgeNodeButtonActive,
                              newEdgeFrom === node.id && styles.edgeNodeButtonDisabled, // Disable to self
                            ]}
                            onPress={() => setNewEdgeTo(node.id)}
                            disabled={newEdgeFrom === node.id}
                          >
                            <Text style={[
                              styles.edgeNodeButtonText,
                              newEdgeTo === node.id && styles.edgeNodeButtonTextActive,
                              newEdgeFrom === node.id && styles.edgeNodeButtonTextDisabled,
                            ]}>
                              {node.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  </View>
                  
                  <TouchableOpacity 
                    style={styles.graphAddButton}
                    onPress={handleAddEdge}
                  >
                    <Text style={styles.graphAddButtonText}>Add Connection</Text>
                  </TouchableOpacity>
                </View>
                
                <View style={styles.edgeList}>
                  <Text style={styles.sectionSubtitle}>Current Connections:</Text>
                  {graph.edges.map((edge, i) => {
                    const sourceNode = graph.nodes.find(n => n.id === edge.source);
                    const targetNode = graph.nodes.find(n => n.id === edge.target);
                    
                    if (!sourceNode || !targetNode) return null;
                    
                    return (
                      <View key={`edge-${i}`} style={styles.edgeItem}>
                        <Text style={styles.edgeText}>
                          {sourceNode.label} → {targetNode.label}
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleDeleteEdge(edge.source, edge.target)}
                          style={{
                            marginLeft: 8,
                            backgroundColor: colors.error,
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ color: 'white', fontSize: 12, fontWeight: 'bold' }}>×</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setGraphModalVisible(false);
                    setCurrentProfile(null);
                    setError('');
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleUpdateGraph}
                >
                  <Text style={styles.saveButtonText}>Save Graph</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primary,
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: {
    ...typography.h1,
    color: colors.onPrimary,
    marginBottom: 8,
  },
  headerSubtitle: {
    ...typography.body1,
    color: colors.onPrimary,
    opacity: 0.8,
  },
  contentContainer: {
    flex: 1,
    padding: 20,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  listTitle: {
    ...typography.h2,
    color: colors.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    ...typography.button,
    color: colors.onPrimary,
    marginLeft: 6,
  },
  list: {
    paddingBottom: 20,
  },
  learnerCard: {
    backgroundColor: colors.surfaceColor,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  learnerInfo: {
    marginBottom: 12,
  },
  learnerName: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 4,
  },
  learnerEmail: {
    ...typography.body1,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  gradeBadge: {
    backgroundColor: colors.primaryLight,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    marginTop: 4,
  },
  gradeBadgeText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  learnerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    marginBottom: 8,
  },
  actionButtonText: {
    ...typography.button,
    color: colors.primary,
    marginLeft: 6,
  },
  loader: {
    marginTop: 40,
  },
  errorContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  errorText: {
    ...typography.body1,
    color: colors.error,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    ...typography.button,
    color: colors.onPrimary,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  emptyText: {
    ...typography.body1,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyAddButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyAddButtonText: {
    ...typography.button,
    color: colors.onPrimary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    backgroundColor: colors.surfaceColor || colors.background,
    borderRadius: 16,
    width: '95%',
    maxWidth: 500,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
    overflow: 'hidden',
  },
  modalTitle: {
    ...typography.h2,
    color: colors.onPrimary,
    textAlign: 'center',
    paddingVertical: 16,
    backgroundColor: colors.primary,
    marginBottom: 0,
  },
  modalContent: {
    padding: 16,
    maxHeight: '80%',
    paddingBottom: 24,
  },
  editLearnerName: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 16,
  },
  inputLabel: {
    ...typography.subtitle2,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.inputBackground,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.body1,
    color: colors.text,
  },
  gradeLevelContainer: {
    marginBottom: 16,
  },
  gradeLevelPicker: {
    paddingVertical: 8,
  },
  gradeLevelButton: {
    backgroundColor: colors.surfaceColor,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  gradeLevelButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  gradeLevelButtonText: {
    ...typography.body1,
    color: colors.text,
    fontWeight: '600',
  },
  gradeLevelButtonTextActive: {
    color: colors.onPrimary,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.surfaceColor,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 12,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    ...typography.button,
    color: colors.textSecondary,
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    ...typography.button,
    color: colors.onPrimary,
  },
  createButtonText: {
    ...typography.button,
    color: colors.onPrimary,
  },
  subjectsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: 12,
  },
  sectionSubtitle: {
    ...typography.body1,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '20', // Adding transparency
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    margin: 4,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  recommendedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4caf5020', // Green with transparency
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    margin: 4,
    borderWidth: 1,
    borderColor: '#4caf50',
  },
  strugglingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4433620', // Red with transparency
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    margin: 4,
    borderWidth: 1,
    borderColor: '#f44336',
  },
  nodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '20', // Adding transparency
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    margin: 4,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.caption,
    color: colors.text,
    marginRight: 6,
    fontWeight: '500',
  },
  chipRemove: {
    width: 20,
    height: 20,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRemoveText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text,
    lineHeight: 18,
  },
  addSubjectContainer: {
    marginTop: 8,
  },
  addSubjectInput: {
    backgroundColor: colors.inputBackground,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.body1,
    color: colors.text,
  },
  graphSection: {
    marginBottom: 24,
  },
  graphInputContainer: {
    marginBottom: 16,
  },
  graphInput: {
    backgroundColor: colors.inputBackground,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    ...typography.body1,
    color: colors.text,
  },
  graphAddButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  graphAddButtonText: {
    ...typography.button,
    color: colors.onPrimary,
  },
  edgeSelectors: {
    marginBottom: 16,
  },
  edgeSelector: {
    marginBottom: 12,
  },
  edgeSelectorLabel: {
    ...typography.subtitle2,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  edgeSelectorScroll: {
    paddingVertical: 4,
  },
  edgeNodeButton: {
    backgroundColor: colors.surfaceColor,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  edgeNodeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  edgeNodeButtonDisabled: {
    backgroundColor: colors.divider,
    borderColor: colors.divider,
    opacity: 0.6,
  },
  edgeNodeButtonText: {
    ...typography.caption,
    color: colors.text,
  },
  edgeNodeButtonTextActive: {
    color: colors.onPrimary,
  },
  edgeNodeButtonTextDisabled: {
    color: colors.textSecondary,
  },
  edgeList: {
    marginTop: 8,
  },
  edgeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceColor,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  edgeText: {
    ...typography.body1,
    color: colors.text,
    flex: 1,
  },
});

export default LearnersPage;