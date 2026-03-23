import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../hooks/use-auth';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '../lib/queryClient';

export type UserMode = 'LEARNER' | 'GROWN_UP';

interface LearnerUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface ModeContextType {
  mode: UserMode;
  toggleMode: () => void;
  isLearnerMode: boolean;
  selectedLearner: LearnerUser | null;
  selectLearner: (learner: LearnerUser) => void;
  availableLearners: LearnerUser[];
  isLoadingLearners: boolean;
  isSwitching: boolean;
  registerDirtyForm: (formId: string) => void;
  unregisterDirtyForm: (formId: string) => void;
  hasDirtyForms: () => boolean;
}

const ModeContext = createContext<ModeContextType | undefined>(undefined);

export const ModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedLearner, setSelectedLearner] = useState<LearnerUser | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  // Safe localStorage helpers — can throw in private browsing or when storage is full
  const safeGetItem = (key: string): string | null => {
    try {
      if (typeof window !== 'undefined') {
        return window.localStorage.getItem(key);
      }
    } catch (e) {
      console.error(`Failed to read localStorage key "${key}":`, e);
    }
    return null;
  };

  const safeSetItem = (key: string, value: string): void => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, value);
      }
    } catch (e) {
      console.error(`Failed to write localStorage key "${key}":`, e);
    }
  };

  // Default to the user's actual role, or to stored preference
  const initialMode = (): UserMode => {
    const storedPreference = safeGetItem('preferredMode');
    if (storedPreference === 'LEARNER' || storedPreference === 'GROWN_UP') {
      return storedPreference as UserMode;
    }
    if (user?.role === 'LEARNER') {
      return 'LEARNER';
    }
    return 'GROWN_UP';
  };

  const [mode, setMode] = useState<UserMode>(initialMode());

  // Pending navigation target: set by state changes, consumed by useEffect
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  // Dirty forms registry for unsaved changes guard
  const dirtyFormsRef = useRef<Set<string>>(new Set());

  const registerDirtyForm = useCallback((formId: string) => {
    dirtyFormsRef.current.add(formId);
  }, []);

  const unregisterDirtyForm = useCallback((formId: string) => {
    dirtyFormsRef.current.delete(formId);
  }, []);

  const hasDirtyForms = useCallback((): boolean => {
    return dirtyFormsRef.current.size > 0;
  }, []);

  // Reset mode and selected learner when auth session expires
  useEffect(() => {
    const handleSessionExpired = () => {
      setMode('GROWN_UP');
      setSelectedLearner(null);
      setIsSwitching(false);
      dirtyFormsRef.current.clear();
    };

    window.addEventListener('auth-session-expired', handleSessionExpired);
    return () => {
      window.removeEventListener('auth-session-expired', handleSessionExpired);
    };
  }, []);

  // Navigation side effect: fires after React commits state updates
  useEffect(() => {
    if (pendingNavigation) {
      const target = pendingNavigation;
      setPendingNavigation(null);

      try {
        setLocation(target);
      } catch (error) {
        console.error('Navigation error:', error);
        if (typeof window !== 'undefined') {
          window.location.href = target;
        }
      }

      // Clear isSwitching after navigation is dispatched
      setIsSwitching(false);
    }
  }, [pendingNavigation, setLocation]);

  // Fetch available learners for the current user
  const {
    data: availableLearners = [],
    isLoading: isLoadingLearners,
  } = useQuery({
    queryKey: ["/api/learners", user?.id, user?.role],
    queryFn: async () => {
      if (!user) return Promise.resolve([]);

      try {
        let response;

        if (user.role === 'ADMIN') {
          response = await apiRequest('GET', `/api/learners?parentId=${user.id}`);
        } else if (user.role === 'PARENT') {
          response = await apiRequest('GET', "/api/learners");
        } else {
          return [];
        }

        // Check if we have valid data
        if (!response) {
          console.error('No response received from API');
          return [];
        }

        // Handle both direct data and data wrapped in a data property
        const learnerData = response.data ? response.data : response;

        if (!Array.isArray(learnerData)) {
          console.error('Invalid learners data received, expected array:', response);
          return [];
        }

        return learnerData;
      } catch (error) {
        console.error('Error fetching learners:', error);
        return [];
      }
    },
    enabled: (user?.role === 'PARENT' || user?.role === 'ADMIN') && !!user?.id,
  });

  // Restore selected learner from localStorage when learners load
  useEffect(() => {
    if (availableLearners?.length > 0) {
      const storedLearnerId = safeGetItem('selectedLearnerId');

      if (storedLearnerId) {
        const learnerId = parseInt(storedLearnerId, 10);
        const foundLearner = availableLearners.find(learner => learner.id === learnerId);

        if (foundLearner) {
          setSelectedLearner(foundLearner);
        } else if (availableLearners && availableLearners.length > 0) {
          // Default to first learner if stored one not found
          const firstLearner = availableLearners[0];
          if (firstLearner && typeof firstLearner.id !== 'undefined') {
            setSelectedLearner(firstLearner);
            safeSetItem('selectedLearnerId', String(firstLearner.id));
          } else {
            console.error('Invalid learner object found:', firstLearner);
          }
        }
      } else if (availableLearners && availableLearners.length > 0) {
        // Default to first learner if none stored
        const firstLearner = availableLearners[0];
        if (firstLearner && typeof firstLearner.id !== 'undefined') {
          setSelectedLearner(firstLearner);
          safeSetItem('selectedLearnerId', String(firstLearner.id));
        } else {
          console.error('Invalid learner object found:', firstLearner);
        }
      }
    }
  }, [availableLearners]);

  // Async-aware learner selection with query invalidation
  const selectLearner = useCallback(async (learner: LearnerUser) => {
    // Validate learner object
    if (!learner || typeof learner !== 'object') {
      console.error('Invalid learner object provided to selectLearner:', learner);
      return;
    }

    // Enter switching state
    setIsSwitching(true);

    // Invalidate all learner-scoped queries before switching
    await queryClient.invalidateQueries({ queryKey: ['/api/learner'] });
    await queryClient.invalidateQueries({ queryKey: ['/api/quiz'] });
    await queryClient.invalidateQueries({ queryKey: ['/api/progress'] });
    await queryClient.invalidateQueries({ queryKey: ['/api/mastery'] });

    // Update selectedLearner state
    setSelectedLearner(learner);

    // Sync to localStorage as side effect
    if (learner.id !== undefined) {
      safeSetItem('selectedLearnerId', String(learner.id));
      safeSetItem('preferredMode', 'LEARNER');
    }

    // Switch to LEARNER mode and schedule navigation via state
    setMode('LEARNER');
    setPendingNavigation('/learner');
  }, []);

  // localStorage sync: persist mode changes as a side effect
  useEffect(() => {
    safeSetItem('preferredMode', mode);
  }, [mode]);

  // Update mode when user changes
  useEffect(() => {
    if (user) {
      // Don't change the mode if the user has a preference already set
      const storedPreference = safeGetItem('preferredMode');
      if (!storedPreference) {
        // Default to the actual role
        if (user.role === 'LEARNER') {
          setMode('LEARNER');
        } else {
          setMode('GROWN_UP');
        }
      }
    }
  }, [user]);

  // Determine if user can toggle modes
  const canToggleMode = (): boolean => {
    // For development, allow toggling even without a user
    const isDev = true; // process.env.NODE_ENV === 'development';
    if (isDev) return true;

    if (!user) return false;

    // Parents and admins can only toggle if they have at least one learner
    if ((user.role === 'PARENT' || user.role === 'ADMIN') && (!availableLearners || availableLearners.length === 0)) {
      return false;
    }

    // Allow all roles to toggle in this version
    return true;
  };

  const toggleMode = useCallback(() => {
    if (!canToggleMode()) {
      return;
    }

    // Check for dirty forms before allowing toggle
    if (hasDirtyForms()) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to switch modes? Your changes will be lost.'
      );
      if (!confirmed) {
        return;
      }
      // User confirmed, clear the dirty forms registry
      dirtyFormsRef.current.clear();
    }

    const newMode = mode === 'LEARNER' ? 'GROWN_UP' : 'LEARNER';

    // For parents and admins switching to learner mode, ensure a learner is selected
    if (newMode === 'LEARNER' && (user?.role === 'PARENT' || user?.role === 'ADMIN')) {
      if (!selectedLearner && availableLearners && availableLearners.length > 0) {
        // Auto-select the first learner if none is selected
        const firstLearner = availableLearners[0];
        if (firstLearner && typeof firstLearner.id !== 'undefined') {
          selectLearner(firstLearner);
          return; // selectLearner handles mode switch and navigation
        } else {
          console.error('Cannot auto-select learner: Invalid first learner object');
          return;
        }
      } else if (!selectedLearner && (!availableLearners || availableLearners.length === 0)) {
        setPendingNavigation('/learners');
        return;
      }
    }

    // Update mode state; localStorage sync handled by useEffect
    setMode(newMode);

    // Schedule navigation via state, consumed by useEffect
    const targetPath = newMode === 'LEARNER' ? '/learner' : '/dashboard';
    setPendingNavigation(targetPath);
  }, [mode, user, selectedLearner, availableLearners, selectLearner, hasDirtyForms]);

  return (
    <ModeContext.Provider value={{
      mode,
      toggleMode,
      isLearnerMode: mode === 'LEARNER',
      selectedLearner,
      selectLearner,
      availableLearners: availableLearners || [],
      isLoadingLearners,
      isSwitching,
      registerDirtyForm,
      unregisterDirtyForm,
      hasDirtyForms
    }}>
      {children}
    </ModeContext.Provider>
  );
};

export const useMode = (): ModeContextType => {
  const context = useContext(ModeContext);
  if (context === undefined) {
    throw new Error('useMode must be used within a ModeProvider');
  }
  return context;
};
