import React, { useEffect, useRef } from 'react';
import { useAuth } from '../hooks/use-auth';
import { Redirect, Route } from 'wouter';
import { useMode } from '../context/ModeContext';

export function LearnerRoute({
  path,
  component: Component,
}: {
  path: string;
  component: React.ComponentType<any>;
}) {
  const { user, isLoading } = useAuth();
  const {
    isLearnerMode,
    selectedLearner,
    availableLearners,
    isLoadingLearners,
    selectLearner,
  } = useMode();

  // Track whether we've already attempted an auto-switch to prevent loops
  const autoSwitchAttempted = useRef(false);

  // Reset the flag if the user changes (e.g. logout/login)
  useEffect(() => {
    autoSwitchAttempted.current = false;
  }, [user?.id]);

  // Auto-switch to learner mode when a logged-in parent navigates directly
  useEffect(() => {
    if (
      user &&
      !isLearnerMode &&
      !isLoading &&
      !isLoadingLearners &&
      !autoSwitchAttempted.current
    ) {
      autoSwitchAttempted.current = true;

      if (selectedLearner) {
        // Already have a selected learner — just flip the mode
        window.localStorage.setItem('preferredMode', 'LEARNER');
        // selectLearner handles mode switch, localStorage, and query invalidation
        selectLearner(selectedLearner);
      } else if (availableLearners && availableLearners.length > 0) {
        // Pick the first available learner
        selectLearner(availableLearners[0]);
      }
      // If no learners exist, we fall through to the redirect below
    }
  }, [
    user,
    isLearnerMode,
    isLoading,
    isLoadingLearners,
    selectedLearner,
    availableLearners,
    selectLearner,
  ]);

  if (isLoading) {
    return (
      <Route path={path}>
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </Route>
    );
  }

  // Not logged in, redirect to auth
  if (!user) {
    return (
      <Route path={path}>
        <Redirect to="/auth" />
      </Route>
    );
  }

  // Still loading learners — show loading state while we figure out if we can auto-switch
  if (!isLearnerMode && isLoadingLearners) {
    return (
      <Route path={path}>
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </Route>
    );
  }

  // Not in learner mode after auto-switch was attempted (no learners available)
  if (!isLearnerMode && autoSwitchAttempted.current) {
    return (
      <Route path={path}>
        <Redirect to="/dashboard" />
      </Route>
    );
  }

  // Auto-switch is in progress (effect hasn't fired yet or mode hasn't updated)
  if (!isLearnerMode) {
    return (
      <Route path={path}>
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      </Route>
    );
  }

  return (
    <Route path={path}>
      {(params) => <Component params={params} />}
    </Route>
  );
}
