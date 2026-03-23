import React from 'react';
import { Switch, Route, Redirect, useLocation } from 'wouter';
import AuthPage from './pages/auth-page';
import HomePage from './pages/home-page';
import DashboardPage from './pages/dashboard-page';
import LearnersPage from './pages/learners-page';
import AddLearnerPage from './pages/add-learner-page';
import ChangeLearnerSubjectsPage from './pages/change-learner-subjects';
import ReportsPage from './pages/reports-page';
import AdminPage from './pages/admin-page';
import AdminUsersPage from './pages/admin-users-page';
import AdminLessonsPage from './pages/admin-lessons-page';
import AdminSettingsPage from './pages/admin-settings-page';
import WelcomePage from './pages/welcome-page';
import PrivacyPage from './pages/privacy-page';
import TermsPage from './pages/terms-page';
import LearnerHome from './pages/learner-home';
import ActiveLessonPage from './pages/active-lesson-page';
import QuizPage from './pages/quiz-page';
import ProgressPage from './pages/progress-page';
import DatabaseSyncPage from './pages/database-sync-page';
import LessonsPage from './pages/lessons-page';
import SelectLearnerPage from './pages/select-learner-page';
import ParentRewardsPage from './pages/parent-rewards-page';
import LearnerGoalsPage from './pages/learner-goals-page';
import { ProtectedRoute } from './lib/protected-route';
import { AdminRoute } from './lib/admin-route';
import { LearnerRoute } from './lib/learner-route';
import { Toaster } from './components/ui/toast';
import { PlausibleAnalytics } from './components/PlausibleAnalytics';
import { useAuth } from './hooks/use-auth';
import { ModeProvider } from './context/ModeContext';
import AppLayout from './components/AppLayout';
import { useMode } from './context/ModeContext';
import { usePageTitle } from './hooks/use-page-title';

// Home redirect component to handle auth status
const HomeRedirect = () => {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading authentication status...</p>
      </div>
    );
  }
  
  if (!user) {
    return <Redirect to="/welcome" />;
  }

  if (user.role === 'LEARNER') {
    return <Redirect to="/learner" />;
  } else {
    return <Redirect to="/dashboard" />;
  }
};

const NotFoundPage = () => {
  const [, navigate] = useLocation();
  const { isLearnerMode } = useMode();

  const title = isLearnerMode ? 'Oops! This page got lost \u{1F5FA}\u{FE0F}' : 'Page Not Found';
  const subtitle = isLearnerMode
    ? undefined
    : 'The page you are looking for does not exist or has been moved.';
  const buttonLabel = isLearnerMode ? 'Go Home \u{1F3E0}' : 'Go to Dashboard';
  const destination = isLearnerMode ? '/learner' : '/dashboard';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: '40px 20px',
      textAlign: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{ fontSize: isLearnerMode ? 28 : 22, fontWeight: 600, margin: '0 0 8px', color: '#121212' }}>
        {title}
      </div>
      {subtitle && (
        <p style={{ fontSize: 15, color: '#707070', margin: '0 0 24px', maxWidth: 400 }}>
          {subtitle}
        </p>
      )}
      {!subtitle && <div style={{ height: 16 }} />}
      <button
        onClick={() => navigate(destination)}
        style={{
          padding: '12px 28px',
          backgroundColor: '#121212',
          color: '#FFFFFF',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: isLearnerMode ? 16 : 14,
          fontWeight: 600,
        }}
      >
        {buttonLabel}
      </button>
    </div>
  );
};

export default function App() {
  usePageTitle();

  return (
    <div className="app-container">
      <PlausibleAnalytics
        domain="sunschool.xyz"
        enabled={process.env.NODE_ENV === 'production' && process.env.ENABLE_STATS !== 'false'}
      />

      <ModeProvider>
        <AppLayout>
          <Switch>
            {/* Public routes (no auth required) */}
            <Route path="/welcome" component={WelcomePage} />
            <Route path="/privacy" component={PrivacyPage} />
            <Route path="/terms" component={TermsPage} />
            <Route path="/auth" component={AuthPage} />
            
            {/* Protected admin routes */}
            <AdminRoute path="/admin" component={AdminPage} />
            <AdminRoute path="/admin/users" component={AdminUsersPage} />
            <AdminRoute path="/admin/lessons" component={AdminLessonsPage} />
            <AdminRoute path="/admin/settings" component={AdminSettingsPage} />
            
            {/* Protected parent/admin routes */}
            <ProtectedRoute path="/dashboard" component={DashboardPage} />
            <ProtectedRoute path="/learners" component={LearnersPage} />
            <ProtectedRoute path="/add-learner" component={AddLearnerPage} />
            <ProtectedRoute path="/change-learner-subjects/:id" component={ChangeLearnerSubjectsPage} />
            <ProtectedRoute path="/reports" component={ReportsPage} />
            <ProtectedRoute path="/database-sync" component={DatabaseSyncPage} />
            <ProtectedRoute path="/rewards" component={ParentRewardsPage} />
            
            {/* Learner specific routes */}
            <LearnerRoute path="/learner" component={LearnerHome} />
            <LearnerRoute path="/select-learner" component={SelectLearnerPage} />
            <LearnerRoute path="/lessons" component={LessonsPage} />
            <LearnerRoute path="/lesson" component={ActiveLessonPage} />
            <LearnerRoute path="/quiz/:lessonId" component={QuizPage} />
            <LearnerRoute path="/progress" component={ProgressPage} />
            <LearnerRoute path="/goals" component={LearnerGoalsPage} />
            
            {/* Root path - redirect authenticated users to their home, others to welcome */}
            <Route path="/">
              {() => <HomeRedirect />}
            </Route>
            
            {/* Catch-all for 404 */}
            <Route>
              <NotFoundPage />
            </Route>
          </Switch>
        </AppLayout>
        <Toaster />
      </ModeProvider>
    </div>
  );
}
