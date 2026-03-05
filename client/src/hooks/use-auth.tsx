import React, { createContext, ReactNode, useContext, useEffect, useState, useRef } from "react";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import type { User as SelectUser, InsertUser } from "../../../shared/schema";
import {
  getQueryFn,
  apiRequest,
  queryClient,
  setAuthToken,
  initializeAuthFromStorage,
  axiosInstance,
  queryPersister
} from "../lib/queryClient";
import { useToast } from "./use-toast";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, RegisterData>;
};

type LoginData = {
  username: string;
  password: string;
};

type RegisterData = {
  username: string;
  email: string;
  name: string;
  password: string;
  role: "ADMIN" | "PARENT" | "LEARNER";
  parentId?: number;
  gradeLevel?: number;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [initializationComplete, setInitializationComplete] = useState(false);
  const [initError, setInitError] = useState<Error | null>(null);

  // CRITICAL FIX: Initialize auth with stricter validation and safer defaults
  useEffect(() => {
    // Set initial state as NOT authenticated while we check
    queryClient.setQueryData(["/api/user"], null);

    const init = async () => {
      try {
        // First, clear any potentially corrupted state to start fresh
        try {
          await setAuthToken(null);
          await AsyncStorage.removeItem('AUTH_TOKEN');
          await queryPersister.removeClient();

          // Remove any other cached data that might cause persistence issues
          await AsyncStorage.removeItem('LEARNER_APP_CACHE');
        } catch (clearError) {
          console.error('Initial state cleanup error (continuing):', clearError);
        }

        // Now explicitly check if we have a token in storage and validate it
        const token = await AsyncStorage.getItem('AUTH_TOKEN');
        const hasValidToken = !!token && token.length > 20;

        // Only proceed with validation if we have what appears to be a valid token
        if (hasValidToken) {
          try {
            await setAuthToken(token); // Set the token in headers

            // Make a synchronous validation request that blocks initialization
            const response = await axiosInstance.get('/api/user', {
              timeout: 5000,  // Short timeout
              validateStatus: (status) => status === 200 // Only 200 is valid
            });

            // Verify that the response contains a proper user object
            const userData = response.data;
            if (userData && userData.id && userData.role) {
              // User is confirmed valid, update cache
              queryClient.setQueryData(["/api/user"], userData);
            } else {
              // Clear everything since data is invalid
              await setAuthToken(null);
              await AsyncStorage.removeItem('AUTH_TOKEN');
              await queryPersister.removeClient();
              queryClient.setQueryData(["/api/user"], null);
            }
          } catch (validationError) {
            // Clear everything
            await setAuthToken(null);
            await AsyncStorage.removeItem('AUTH_TOKEN');
            await queryPersister.removeClient();
            queryClient.setQueryData(["/api/user"], null);
          }
        } else {
          queryClient.setQueryData(["/api/user"], null);
        }

        // Initialization complete
        setInitializationComplete(true);
      } catch (error) {
        console.error('Auth initialization error:', error);
        setInitError(error instanceof Error ? error : new Error('Unknown error during auth initialization'));

        // Clear all state on major error
        try {
          await setAuthToken(null);
          await AsyncStorage.removeItem('AUTH_TOKEN');
          await queryPersister.removeClient();
          await AsyncStorage.removeItem('LEARNER_APP_CACHE');
          queryClient.setQueryData(["/api/user"], null);
        } catch (clearError) {
          console.error('Failed to clear auth state after error:', clearError);
        }

        setInitializationComplete(true);
      }
    };

    // Run initialization
    init();
  }, []);

  // Set up the user query with strict type checking and specific behaviors
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | null, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    // Critical settings to prevent false authentication
    initialData: null, // Always start with null (not authenticated)
    staleTime: 0, // Always validate freshness
    // Only consider query successful when the data is complete
    structuralSharing: (oldData, newData) => {
      // If new data doesn't look like a valid user, return null
      if (!newData || typeof newData !== 'object' || !('id' in newData) || !('role' in newData)) {
        return null;
      }
      return newData as SelectUser;
    }
  });

  // --- Session expiry detection ---
  // Track previous user value to detect when session expires (user goes from non-null to null)
  const previousUserRef = useRef<SelectUser | null>(user);
  useEffect(() => {
    const prevUser = previousUserRef.current;
    previousUserRef.current = user;

    // Only act when user transitions from authenticated to unauthenticated
    if (prevUser !== null && user === null) {
      // Clear app-specific localStorage items
      try {
        AsyncStorage.removeItem('selectedLearnerId');
        AsyncStorage.removeItem('preferredMode');
      } catch (e) {
        console.error('Failed to clear session storage on expiry:', e);
      }

      // Dispatch custom event so other contexts (e.g. ModeContext) can reset state
      window.dispatchEvent(new CustomEvent('auth-session-expired'));
    }
  }, [user]);

  interface LoginResponse {
    user: SelectUser;
    token: string;
  }

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData): Promise<LoginResponse> => {
      try {
        const response = await axiosInstance.post('/api/login', credentials);
        const data = response.data;

        // Validate response format
        if (!data || !data.token || !data.user) {
          throw new Error('Invalid username or password');
        }

        return { token: data.token, user: data.user };
      } catch (err: any) {
        // Map errors to human-readable messages
        if (!navigator.onLine) {
          throw new Error('Check your internet connection');
        }
        if (err.response?.status === 401) {
          throw new Error('Invalid username or password');
        }
        if (err.response?.status === 503 || err.response?.status === 500) {
          throw new Error('Server is temporarily unavailable');
        }
        // If it's already a formatted error from the validation above, re-throw as-is
        if (err.message === 'Invalid username or password' ||
            err.message === 'Check your internet connection' ||
            err.message === 'Server is temporarily unavailable') {
          throw err;
        }
        // Network / unknown errors
        if (!err.response) {
          throw new Error('Check your internet connection');
        }
        throw new Error('Server is temporarily unavailable');
      }
    },
    onSuccess: async (response: LoginResponse) => {
      try {
        if (!response.token) {
          throw new Error('No authentication token received');
        }

        await setAuthToken(response.token);

        const userData = response.user;
        if (!userData) {
          throw new Error('No user data received');
        }

        // Update the user data in the query cache
        queryClient.setQueryData(["/api/user"], userData);

        toast({
          title: "Login successful",
          description: `Welcome back, ${userData?.name || 'user'}!`,
        });
      } catch (err: any) {
        console.error('Error in login success handler:', err);
        toast({
          title: "Login partially failed",
          description: err.message,
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  interface RegisterResponse {
    user: SelectUser;
    token: string;
    wasPromotedToAdmin?: boolean;
  }

  const registerMutation = useMutation({
    mutationFn: async (userData: RegisterData): Promise<RegisterResponse> => {
      try {
        const response = await axiosInstance.post('/api/register', userData);
        const data = response.data;

        // Validate response format
        if (!data || !data.token || !data.user) {
          throw new Error('Registration failed: unexpected server response');
        }

        return {
          token: data.token,
          user: data.user,
          wasPromotedToAdmin: data.wasPromotedToAdmin
        };
      } catch (err: any) {
        if (!navigator.onLine) {
          throw new Error('Check your internet connection');
        }
        if (err.response?.status === 409) {
          throw new Error('An account with that username or email already exists');
        }
        if (err.response?.status === 503 || err.response?.status === 500) {
          throw new Error('Server is temporarily unavailable');
        }
        // If it's already a formatted error, re-throw as-is
        if (err.message && !err.response) {
          throw err;
        }
        throw new Error(err.response?.data?.error || 'Server is temporarily unavailable');
      }
    },
    onSuccess: async (response: RegisterResponse) => {
      try {
        if (!response.token || !response.user) {
          toast({
            title: "Registration failed",
            description: "Unexpected server response. Please try again.",
            variant: "destructive",
          });
          return;
        }

        // Store the token
        await setAuthToken(response.token);

        // Update the user data in the query cache
        queryClient.setQueryData(["/api/user"], response.user);

        // Show appropriate toast message
        if (response.wasPromotedToAdmin) {
          toast({
            title: "You are the first user!",
            description: `Welcome, ${response.user?.name || 'user'}! As the first user, you've been automatically granted administrator privileges.`,
          });
        } else {
          toast({
            title: "Registration successful",
            description: `Welcome, ${response.user?.name || 'user'}!`,
          });
        }
      } catch (err: any) {
        console.error('Error in registration success handler:', err);
        toast({
          title: "Registration partially failed",
          description: err.message,
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      // Call the server logout endpoint
      try {
        await axiosInstance.post('/api/logout');
      } catch (error) {
        // Continue with client-side logout even if server call fails
      }

      // Thorough cleanup of all authentication state
      try {
        // Clear auth token from axios headers
        await setAuthToken(null);

        // Clear persisted token
        await AsyncStorage.removeItem('AUTH_TOKEN');

        // Clear persisted query cache
        await queryPersister.removeClient();

        // Clear any other auth-related storage items
        await AsyncStorage.removeItem('LEARNER_APP_CACHE');
      } catch (cleanupError) {
        console.error('Error during auth cleanup:', cleanupError);
        throw cleanupError; // Re-throw to trigger the error handler
      }
    },
    onSuccess: async () => {
      // Immediately clear in-memory user data
      queryClient.setQueryData(["/api/user"], null);

      // Clear all queries to prevent any auth-dependent data from persisting
      queryClient.clear();

      toast({
        title: "Logged out",
        description: "You have been logged out successfully",
      });

      // Force page reload to ensure clean state if needed
      if (typeof window !== 'undefined') {
        window.location.href = '/auth';
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Logout Failed",
        description: error.message,
        variant: "destructive",
      });

      // Even on error, try to clear client-side state
      queryClient.setQueryData(["/api/user"], null);

      // Try to force reload to auth page as last resort
      if (typeof window !== 'undefined') {
        window.location.href = '/auth';
      }
    },
  });

  // If there was an initialization error, show a fallback UI
  if (initializationComplete && initError) {
    return (
      <div style={{
        padding: '20px',
        margin: '20px',
        backgroundColor: '#f8d7da',
        borderRadius: '5px',
        color: '#721c24'
      }}>
        <h2>Authentication Error</h2>
        <p>There was a problem initializing the authentication system.</p>
        <details style={{ whiteSpace: 'pre-wrap', marginTop: '10px', cursor: 'pointer' }}>
          <summary>Error Details</summary>
          <p>{initError.toString()}</p>
        </details>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '10px',
            padding: '8px 16px',
            backgroundColor: '#6200EE',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Refresh Page
        </button>
      </div>
    );
  }

  // If still initializing, show a loading indicator
  if (!initializationComplete) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: '40px'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid #f3f3f3',
          borderTop: '4px solid #6200EE',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '16px'
        }}></div>
        <p style={{ color: '#333' }}>Initializing authentication...</p>
      </div>
    );
  }

  // Normal rendering when initialization is complete and successful
  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
