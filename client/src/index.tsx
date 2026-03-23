import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { QueryClientProvider } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { AuthProvider } from './hooks/use-auth';
import { ToastProvider } from './hooks/use-toast';
import { queryClient, queryPersister } from './lib/queryClient';
import { ModeProvider } from './context/ModeContext';

// Import global CSS for hover effects and animations
import './styles/global.css';

// Set up persistence for offline support
persistQueryClient({
  queryClient,
  persister: queryPersister,
  maxAge: 1000 * 60 * 60 * 24, // 24 hours
  dehydrateOptions: {
    shouldDehydrateQuery: query => {
      // Only persist specific queries that are needed offline
      return [
        '/api/lessons/active',
        '/api/learner-profile',
        '/api/achievements'
      ].some(p => String(query.queryKey[0]).includes(p));
    },
  },
});

// Error boundary component to catch rendering errors
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error to the console
    console.error('React Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          padding: '40px 20px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: '#121212',
          textAlign: 'center',
        }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: '#FFF3E0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
            fontSize: 32,
          }}>
            !
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700 }}>Something went wrong</h2>
          <p style={{ margin: '0 0 24px', color: '#707070', fontSize: 15, maxWidth: 400 }}>
            An unexpected error occurred. Please reload the page to try again.
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 24px',
                backgroundColor: '#121212',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Reload Page
            </button>
            <button
              onClick={() => { window.location.href = '/'; }}
              style={{
                padding: '10px 24px',
                backgroundColor: '#F5F5F5',
                color: '#121212',
                border: '1px solid #E0E0E0',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Go Home
            </button>
          </div>
          {import.meta.env.DEV && this.state.error && (
            <details style={{ whiteSpace: 'pre-wrap', marginTop: 24, cursor: 'pointer', color: '#707070', fontSize: 12, maxWidth: 600, textAlign: 'left' }}>
              <summary>Developer Details</summary>
              <p style={{ marginTop: 8, padding: 12, backgroundColor: '#F9F9F9', borderRadius: 4, overflowX: 'auto' as any }}>{this.state.error.toString()}</p>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

// Offline detection banner
function OfflineBanner() {
  const [isOffline, setIsOffline] = React.useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10000,
        backgroundColor: '#FF8C42',
        color: '#FFFFFF',
        textAlign: 'center',
        padding: '8px 16px',
        fontSize: 14,
        fontWeight: 600,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      You are offline. Some features may be unavailable until your connection is restored.
    </div>
  );
}

function Root() {
  useEffect(() => {
    // Handle online/offline status changes
    const handleOnline = () => {
      queryClient.resumePausedMutations();
      queryClient.invalidateQueries();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  return (
    <React.StrictMode>
      <ErrorBoundary>
        <OfflineBanner />
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <ErrorBoundary>
              <AuthProvider>
                <ErrorBoundary>
                  <ModeProvider>
                    <ErrorBoundary>
                      <App />
                    </ErrorBoundary>
                  </ModeProvider>
                </ErrorBoundary>
              </AuthProvider>
            </ErrorBoundary>
          </ToastProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);
