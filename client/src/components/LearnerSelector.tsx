import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { ChevronDown, ChevronUp, Plus, User, Check } from 'react-feather';
import { useLocation } from 'wouter';
import { useMode } from '../context/ModeContext';
import { useAuth } from '../hooks/use-auth';

interface LearnerSelectorProps {
  /** When true, renders a subtle "View as:" prefix for parent/grown-up mode */
  subtle?: boolean;
}

export function LearnerSelector({ subtle = false }: LearnerSelectorProps) {
  const {
    selectedLearner,
    availableLearners,
    isLoadingLearners,
    isSwitching,
    selectLearner,
  } = useMode();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const canCreateLearners = user?.role === 'PARENT' || user?.role === 'ADMIN';

  const handleSelectorPress = useCallback(() => {
    setDropdownOpen((prev) => !prev);
  }, []);

  const handleSelectLearner = useCallback(
    (learner: typeof selectedLearner) => {
      if (!learner) return;
      setDropdownOpen(false);
      // Don't re-select the already selected learner
      if (selectedLearner?.id === learner.id) return;
      selectLearner(learner);
    },
    [selectLearner, selectedLearner],
  );

  const handleAddChild = useCallback(() => {
    setDropdownOpen(false);
    setLocation('/add-learner');
  }, [setLocation]);

  const handleOverlayPress = useCallback(() => {
    setDropdownOpen(false);
  }, []);

  // If loading, show a spinner
  if (isLoadingLearners) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#6366F1" />
        <Text style={styles.loadingText}>Loading learners...</Text>
      </View>
    );
  }

  // If no learners available, show create button for parents/admins
  if (!availableLearners || availableLearners.length === 0) {
    if (canCreateLearners) {
      return (
        <View style={styles.container}>
          <TouchableOpacity
            style={styles.createButton}
            onPress={handleAddChild}
            accessibilityRole="button"
            accessibilityLabel="Add child"
          >
            <Plus size={16} color="#ffffff" aria-hidden="true" />
            <Text style={styles.createButtonText}>Add Child</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <Text style={styles.noLearnersText}>No learners available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Subtle "View as:" prefix for parent mode */}
      {subtle && (
        <Text style={styles.viewAsLabel}>View as:</Text>
      )}

      {/* Selector button */}
      <TouchableOpacity
        style={[styles.selector, subtle && styles.selectorSubtle]}
        onPress={handleSelectorPress}
        disabled={isSwitching}
        accessibilityRole="button"
        accessibilityLabel={`Select learner. Current: ${selectedLearner?.name || 'none'}`}
        accessibilityState={{ expanded: dropdownOpen }}
      >
        {isSwitching ? (
          <ActivityIndicator size="small" color="#6366F1" style={styles.switchingSpinner} />
        ) : (
          <View style={styles.avatarContainer} aria-hidden="true">
            <User size={18} color="#6366F1" aria-hidden="true" />
          </View>
        )}
        <Text style={styles.learnerName} numberOfLines={1}>
          {selectedLearner?.name || 'Select Learner'}
        </Text>
        {dropdownOpen ? (
          <ChevronUp size={16} color="#6366F1" aria-hidden="true" />
        ) : (
          <ChevronDown size={16} color="#6366F1" aria-hidden="true" />
        )}
      </TouchableOpacity>

      {/* Dropdown overlay + menu */}
      {dropdownOpen && (
        <>
          {/* Transparent overlay to close on outside press */}
          <TouchableOpacity
            style={styles.overlay}
            activeOpacity={1}
            onPress={handleOverlayPress}
          />

          {/* Dropdown menu */}
          <View style={styles.dropdown} accessibilityRole="list" accessibilityLabel="Learner options">
            <ScrollView
              style={styles.dropdownScroll}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {availableLearners.map((learner) => {
                const isSelected = selectedLearner?.id === learner.id;
                return (
                  <TouchableOpacity
                    key={learner.id}
                    style={[
                      styles.dropdownItem,
                      isSelected && styles.dropdownItemSelected,
                    ]}
                    onPress={() => handleSelectLearner(learner)}
                    accessibilityRole="button"
                    accessibilityLabel={`${learner.name}${(learner as any).gradeLevel != null ? `, Grade ${(learner as any).gradeLevel}` : ''}`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View style={styles.dropdownItemLeft}>
                      <View
                        style={[
                          styles.dropdownAvatar,
                          isSelected && styles.dropdownAvatarSelected,
                        ]}
                        aria-hidden="true"
                      >
                        <User size={14} color={isSelected ? '#FFFFFF' : '#6366F1'} aria-hidden="true" />
                      </View>
                      <View style={styles.dropdownItemInfo}>
                        <Text
                          style={[
                            styles.dropdownItemName,
                            isSelected && styles.dropdownItemNameSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {learner.name}
                        </Text>
                        {(learner as any).gradeLevel != null && (
                          <View style={styles.gradeBadge}>
                            <Text style={styles.gradeBadgeText}>
                              Grade {(learner as any).gradeLevel}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    {isSelected && (
                      <Check size={16} color="#6366F1" aria-hidden="true" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Divider */}
            {canCreateLearners && (
              <>
                <View style={styles.dropdownDivider} />
                <TouchableOpacity
                  style={styles.addChildButton}
                  onPress={handleAddChild}
                  accessibilityRole="button"
                  accessibilityLabel="Add child"
                >
                  <Plus size={16} color="#6366F1" aria-hidden="true" />
                  <Text style={styles.addChildText}>Add Child</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1000,
  },
  viewAsLabel: {
    fontSize: 12,
    color: '#FFFFFFAA',
    marginRight: 6,
    fontWeight: '500',
  },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    maxWidth: 200,
    cursor: 'pointer',
  },
  selectorSubtle: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  avatarContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  switchingSpinner: {
    marginRight: 8,
  },
  learnerName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
    marginRight: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
  },
  noLearnersText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366F1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  },

  // Overlay
  overlay: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },

  // Dropdown
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 4,
    minWidth: 220,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    zIndex: 1000,
    // Shadow for web (react-native-web supports boxShadow)
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.12)',
    overflow: 'hidden',
  },
  dropdownScroll: {
    maxHeight: 240,
  },

  // Dropdown items
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    cursor: 'pointer',
  },
  dropdownItemSelected: {
    backgroundColor: '#EEF2FF',
  },
  dropdownItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  dropdownAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  dropdownAvatarSelected: {
    backgroundColor: '#6366F1',
  },
  dropdownItemInfo: {
    flexDirection: 'column',
    flex: 1,
  },
  dropdownItemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  dropdownItemNameSelected: {
    fontWeight: '600',
    color: '#4338CA',
  },
  gradeBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  gradeBadgeText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },

  // Divider + Add child
  dropdownDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  addChildButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    cursor: 'pointer',
  },
  addChildText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6366F1',
    marginLeft: 8,
  },
});
