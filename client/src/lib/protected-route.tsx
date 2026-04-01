import React from 'react';
import { useAuth } from '../hooks/use-auth';
import { Redirect, Route } from 'wouter';

export function ProtectedRoute({
  path,
  component: Component,
}: {
  path: string;
  component: React.ComponentType<any>;
}) {
  const { user, isLoading } = useAuth();

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
  if (!user || !user.id) {
    return (
      <Route path={path}>
        <Redirect to="/auth" />
      </Route>
    );
  }

  // Allow access if user is authenticated, even with 0 learners
  if (user.role === 'PARENT' || user.role === 'ADMIN') {
    return (
      <Route path={path}>
        {(params) => <Component params={params} />}
      </Route>
    );
  }

  // LEARNER role — redirect to learner home
  return (
    <Route path={path}>
      <Redirect to="/learner" />
    </Route>
  );
}