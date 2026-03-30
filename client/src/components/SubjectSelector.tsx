import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';
import { Book, Activity, Award, AlertTriangle } from 'react-feather';
import { colors } from '../styles/theme';
import { useAuth } from '../hooks/use-auth';

// Category icons mapping
const categoryIcons: Record<string, React.ReactNode> = {
  'Language Arts': <Book size={22} color={colors.primary} />,
  'Mathematics': <Activity size={22} color={colors.primary} />,
  'Science': <Award size={22} color={colors.primary} />,
  'Social Studies': <Book size={22} color={colors.primary} />,
  'Arts': <Book size={22} color={colors.primary} />,
  'Life Skills': <Book size={22} color={colors.primary} />,
  'World Languages': <Book size={22} color={colors.primary} />,
  'Technology': <Book size={22} color={colors.primary} />,
  'Other': <Book size={22} color={colors.primary} />
};

interface Subject {
  name: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

interface SubjectSelectorProps {
  onSelectSubject: (subject: Subject) => void;
}

const SubjectSelector: React.FC<SubjectSelectorProps> = ({ onSelectSubject }) => {
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [categorySubjects, setCategorySubjects] = useState<Record<string, Subject[]>>({});
  
  // Fetch learner profile
  const { data: learnerProfile, isLoading: profileLoading, error: profileError } = useQuery({
    queryKey: ['/api/learner-profile', user?.id],
    queryFn: () => apiRequest('GET', `/api/learner-profile/${user?.id}`).then(res => res.data),
    enabled: !!user,
    retry: 1,
  });
  
  useEffect(() => {
    // Load categories from server or hardcoded list
    const defaultCategories = [
      'Language Arts', 'Mathematics', 'Science', 'Social Studies', 
      'Arts', 'Life Skills', 'World Languages', 'Technology'
    ];
    setAllCategories(defaultCategories);
    setActiveCategory(defaultCategories[0]);
    
    // Create sample subjects for each category
    const sampleSubjects: Record<string, Subject[]> = {};
    defaultCategories.forEach(category => {
      switch (category) {
        case 'Language Arts':
          sampleSubjects[category] = [
            { name: 'Reading', category, difficulty: 'beginner' },
            { name: 'Writing', category, difficulty: 'beginner' },
            { name: 'Literature', category, difficulty: 'intermediate' },
            { name: 'Composition', category, difficulty: 'advanced' }
          ];
          break;
        case 'Mathematics':
          sampleSubjects[category] = [
            { name: 'Numbers', category, difficulty: 'beginner' },
            { name: 'Basic Math', category, difficulty: 'beginner' },
            { name: 'Algebra', category, difficulty: 'intermediate' },
            { name: 'Geometry', category, difficulty: 'intermediate' }
          ];
          break;
        case 'Science':
          sampleSubjects[category] = [
            { name: 'Animals', category, difficulty: 'beginner' },
            { name: 'Plants', category, difficulty: 'beginner' },
            { name: 'Earth Science', category, difficulty: 'intermediate' },
            { name: 'Human Body', category, difficulty: 'intermediate' }
          ];
          break;
        default:
          sampleSubjects[category] = [
            { name: `${category} Topic 1`, category, difficulty: 'beginner' },
            { name: `${category} Topic 2`, category, difficulty: 'intermediate' },
          ];
      }
    });
    setCategorySubjects(sampleSubjects);
  }, []);
  
  // Update categories based on learner profile
  useEffect(() => {
    if (learnerProfile && learnerProfile.subjects && learnerProfile.subjects.length > 0) {
      // If we have subjects in the profile, we should use them
      // This is where we'd update the subjects based on learner profile
      // For now, we'll keep using the default subjects
    }
  }, [learnerProfile]);
  
  const handleCategorySelect = (category: string) => {
    setActiveCategory(category);
  };
  
  const handleSubjectSelect = (subject: Subject) => {
    onSelectSubject(subject);
  };
  
  if (profileLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Loading subjects...</Text>
      </View>
    );
  }

  // Profile fetch failed — still show subjects (they're locally defined), just skip recommendations
  if (profileError) {
    console.warn('SubjectSelector: failed to load learner profile, showing default subjects');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose a subject to learn</Text>
      
      {/* Category Selector */}
      <ScrollView 
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryScroll}
      >
        {allCategories.map(category => (
          <TouchableOpacity
            key={category}
            style={[
              styles.categoryButton,
              activeCategory === category && styles.activeCategoryButton
            ]}
            onPress={() => handleCategorySelect(category)}
          >
            {categoryIcons[category] || <Book size={22} color={colors.primary} />}
            <Text
              style={[
                styles.categoryText,
                activeCategory === category && styles.activeCategoryText
              ]}
            >
              {category}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      
      {/* Subject Cards */}
      <ScrollView contentContainerStyle={styles.subjectsContainer}>
        {categorySubjects[activeCategory]?.map((subject, index) => (
          <TouchableOpacity
            key={`${subject.name}-${index}`}
            style={styles.subjectCard}
            onPress={() => handleSubjectSelect(subject)}
          >
            <View style={styles.subjectContent}>
              <Text style={styles.subjectName}>{subject.name}</Text>
              <Text style={styles.difficultyLabel}>
                {subject.difficulty === 'beginner' ? 'Beginner' : 
                 subject.difficulty === 'intermediate' ? 'Intermediate' : 'Advanced'}
              </Text>
            </View>
            
            {/* Difficulty indicator */}
            <View style={[
              styles.difficultyIndicator,
              subject.difficulty === 'beginner' ? styles.beginnerDifficulty :
              subject.difficulty === 'intermediate' ? styles.intermediateDifficulty :
              styles.advancedDifficulty
            ]} />
          </TouchableOpacity>
        ))}
        
        {(!categorySubjects[activeCategory] || categorySubjects[activeCategory].length === 0) && (
          <View style={styles.emptyStateContainer}>
            <AlertTriangle size={40} color={colors.textSecondary} />
            <Text style={styles.emptyStateText}>No subjects available in this category</Text>
          </View>
        )}
      </ScrollView>
      
      {(learnerProfile?.recommendedSubjects?.length > 0) && (
        <View style={styles.recommendationsContainer}>
          <Text style={styles.recommendationsTitle}>Recommended for you</Text>
          <ScrollView 
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recommendationsScroll}
          >
            {learnerProfile.recommendedSubjects.map(subjectName => (
              <TouchableOpacity
                key={subjectName}
                style={styles.recommendationButton}
                onPress={() => handleSubjectSelect({
                  name: subjectName,
                  category: 'Recommended',
                  difficulty: 'beginner'
                })}
              >
                <Text style={styles.recommendationText}>{subjectName}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
      
      {(learnerProfile?.strugglingAreas?.length > 0) && (
        <View style={styles.recommendationsContainer}>
          <Text style={styles.needsWorkTitle}>Needs more practice</Text>
          <ScrollView 
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recommendationsScroll}
          >
            {learnerProfile.strugglingAreas.map(subjectName => (
              <TouchableOpacity
                key={subjectName}
                style={styles.needsWorkButton}
                onPress={() => handleSubjectSelect({
                  name: subjectName,
                  category: 'Practice Needed',
                  difficulty: 'beginner'
                })}
              >
                <Text style={styles.needsWorkText}>{subjectName}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: colors.textPrimary,
  },
  categoryScroll: {
    paddingVertical: 8,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceColor,
    borderRadius: 16,
    padding: 12,
    marginRight: 12,
    minWidth: 100,
  },
  activeCategoryButton: {
    backgroundColor: colors.primary,
  },
  categoryText: {
    marginLeft: 8,
    fontWeight: '500',
    color: colors.textPrimary,
    fontSize: 14,
  },
  activeCategoryText: {
    color: 'white',
  },
  subjectsContainer: {
    paddingVertical: 16,
  },
  subjectCard: {
    backgroundColor: colors.surfaceColor,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  subjectContent: {
    flex: 1,
  },
  subjectName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  difficultyLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  difficultyIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: 12,
  },
  beginnerDifficulty: {
    backgroundColor: colors.success,
  },
  intermediateDifficulty: {
    backgroundColor: colors.warning,
  },
  advancedDifficulty: {
    backgroundColor: colors.error,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyStateText: {
    marginTop: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  recommendationsContainer: {
    marginTop: 20,
    marginBottom: 16,
  },
  recommendationsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 12,
  },
  needsWorkTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.warning,
    marginBottom: 12,
  },
  recommendationsScroll: {
    paddingVertical: 4,
  },
  recommendationButton: {
    backgroundColor: colors.primaryLight,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
  },
  recommendationText: {
    color: colors.primary,
    fontWeight: '500',
  },
  needsWorkButton: {
    backgroundColor: 'rgba(255, 171, 0, 0.2)', // Light warning color
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
  },
  needsWorkText: {
    color: colors.warning,
    fontWeight: '500',
  },
});

export default SubjectSelector;