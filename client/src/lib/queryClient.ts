import { QueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

// Create a custom persister since the package exports have changed
export const queryPersister = {
  persistClient: async (client: any) => {
    await AsyncStorage.setItem(
      'LEARNER_APP_CACHE',
      JSON.stringify({
        timestamp: Date.now(),
        buster: 'v1',
        clientState: client
      })
    );
  },
  restoreClient: async () => {
    const cacheString = await AsyncStorage.getItem('LEARNER_APP_CACHE');
    if (!cacheString) return;
    
    try {
      const cache = JSON.parse(cacheString);
      return cache.clientState;
    } catch {}
    
    return undefined;
  },
  removeClient: async () => {
    await AsyncStorage.removeItem('LEARNER_APP_CACHE');
  }
};

// Handle the domain-specific configurations for API requests
// For sunschool.xyz domain, we need to make sure requests go to the right place
function getApiBaseUrl() {
  if (typeof window === 'undefined') return ''; // Server-side rendering fallback

  const origin = window.location.origin;
  // If we're on sunschool.xyz, use that domain for API requests
  if (origin.includes('sunschool.xyz')) {
    return 'https://sunschool.xyz';
  }

  // Otherwise use current origin (empty string means use relative URLs)
  return '';
}

const API_URL = getApiBaseUrl();

export const axiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30 * 1000, // 30 seconds — learner data changes often
      gcTime: 24 * 60 * 60 * 1000, // 24 hours
      networkMode: 'offlineFirst',
    },
  },
});

// Global 401 interceptor — clears auth state and redirects to login on session expiry
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const requestUrl = error.config?.url || '';
      // Don't intercept auth endpoints themselves to avoid loops
      if (!requestUrl.includes('/login') && !requestUrl.includes('/register') && !requestUrl.includes('/api/user')) {
        // Clear token
        delete axiosInstance.defaults.headers.common['Authorization'];
        try {
          await AsyncStorage.removeItem('AUTH_TOKEN');
          await AsyncStorage.removeItem('AUTH_TOKEN_DATA');
        } catch (e) {
          // ignore cleanup errors
        }
        // Clear user from query cache
        queryClient.setQueryData(['/api/user'], null);
        // Dispatch event so ModeContext can reset
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth-session-expired'));
          window.location.href = '/auth';
        }
      }
    }
    return Promise.reject(error);
  }
);

// Add auth token to requests and store it
export const setAuthToken = async (token: string | null) => {
  if (token) {
    try {
      // Set the token in axios for all future requests
      axiosInstance.defaults.headers.common["Authorization"] = `Bearer ${token}`;

      // For domain-specific configuration
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      const isSunschool = currentOrigin.includes('sunschool.xyz');

      // Also create a timestamp to help with token validation
      const tokenData = {
        token,
        timestamp: Date.now(),
        origin: currentOrigin,
        isSunschool
      };

      // Store the token and metadata
      await AsyncStorage.setItem('AUTH_TOKEN', token);
      await AsyncStorage.setItem('AUTH_TOKEN_DATA', JSON.stringify(tokenData));
    } catch (error) {
      console.error('Error setting auth token:', error);
      // Still set the token even if validation failed
      axiosInstance.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    }
  } else {
    // Clear the token from axios
    delete axiosInstance.defaults.headers.common["Authorization"];

    // Remove token and metadata from storage
    await AsyncStorage.removeItem('AUTH_TOKEN');
    await AsyncStorage.removeItem('AUTH_TOKEN_DATA');
  }
};

// Initialize token from storage (call this when app starts)
export const initializeAuthFromStorage = async () => {
  try {
    // First try to get the token metadata for validation
    const tokenDataString = await AsyncStorage.getItem('AUTH_TOKEN_DATA');
    const tokenData = tokenDataString ? JSON.parse(tokenDataString) : null;

    // Get the raw token directly (fallback for older versions)
    const token = await AsyncStorage.getItem('AUTH_TOKEN');

    if (token) {
      // Check if token data exists and validate origin if needed
      if (tokenData) {
        const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
        const storedOrigin = tokenData.origin || '';

        // If origins don't match and it's not a known migration situation, don't use the token
        const isKnownMigration =
          (currentOrigin === 'https://sunschool.xyz' && (storedOrigin.includes('replit') || !storedOrigin)) ||
          (storedOrigin === 'https://sunschool.xyz' && currentOrigin.includes('replit'));

        if (currentOrigin && storedOrigin && currentOrigin !== storedOrigin && !isKnownMigration) {
          return false;
        }
      }

      // Set the token in axios headers
      axiosInstance.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error initializing auth from storage:', error);
    return false;
  }
};

type QueryFnOptions = {
  on401?: "throw" | "returnNull";
};

export const getQueryFn = (options: QueryFnOptions = { on401: "throw" }) => {
  return async ({ queryKey }: { queryKey: readonly unknown[] }) => {
    const endpoint = queryKey[0] as string;

    try {
      const response = await axiosInstance.get(endpoint);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401 && options.on401 === "returnNull") {
        return null;
      }
      throw new Error(error.response?.data?.error || "An error occurred");
    }
  };
};

export const apiRequest = async (
  method: "GET" | "POST" | "PUT" | "DELETE",
  url: string,
  data?: any
) => {
  const isAuthRequest = (url.includes('/login') || url.includes('/register')) && method === 'POST';

  try {
    // Add explicit headers to avoid potential content-type and parsing issues
    const headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    // Start the request with timeout and validation
    const response = await axiosInstance({
      method,
      url,
      data,
      headers,
      // Force response as JSON to prevent potential response type issues
      responseType: 'json',
      // Add timeout to prevent hanging requests
      timeout: 30000, // 30 second timeout
      // Only accept 2xx status codes for auth endpoints to ensure token presence
      validateStatus: (status) => {
        if (isAuthRequest) {
          return status >= 200 && status < 300;
        }
        // For other endpoints, handle 4xx errors explicitly below
        return status >= 200 && status < 500;
      }
    });

    // Check for 4xx errors that weren't automatically rejected
    if (response.status >= 400 && response.status < 500) {
      throw new Error(response.data?.error || `Server returned error ${response.status}`);
    }

    return response;
  } catch (error: any) {
    // Specific error handling based on error types
    if (error.response) {
      const errorText = error.response.data?.error || error.response.statusText || "Request failed";
      throw new Error(`${errorText} (${error.response.status})`);
    } else if (error.request) {
      throw new Error("Network error: No response received from server");
    } else {
      throw new Error(`Request error: ${error.message}`);
    }
  }
};
