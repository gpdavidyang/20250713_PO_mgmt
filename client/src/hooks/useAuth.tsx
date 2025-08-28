import { createContext, ReactNode, useContext, useCallback, useState, useEffect } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useLocation } from "wouter";
import { isDevelopmentEnvironment, isProductionEnvironment, devLog, devWarn } from "@/utils/environment";

type User = {
  id: string;
  email: string | null;
  name: string;
  password: string;
  positionId: number | null;
  phoneNumber: string;
  profileImageUrl: string | null;
  role: "field_worker" | "project_manager" | "hq_management" | "executive" | "admin";
  createdAt: Date | null;
  updatedAt: Date | null;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: Error | null;
  loginMutation: any;
  logoutMutation: any;
  forceLogout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType | null>(null);

function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  // Always check auth status to properly handle login flow
  const [shouldCheckAuth, setShouldCheckAuth] = useState(() => {
    console.log('🚀 Initializing useAuth hook');
    // Always enable auth checking to properly handle login/logout flow
    // The query itself will handle 401 responses gracefully
    return true;
  });

  // Monitor storage changes for multi-tab sync
  useEffect(() => {
    // Listen for storage changes (login/logout in other tabs)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'hasAuthenticated' || e.key === 'userAuthenticated') {
        devLog('🔄 Storage change detected, invalidating auth query');
        // Invalidate the auth query to re-check authentication status
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [queryClient]);

  // Debug effect to monitor shouldCheckAuth state changes
  useEffect(() => {
    console.log('🔄 shouldCheckAuth changed:', shouldCheckAuth);
  }, [shouldCheckAuth]);

  const {
    data: user,
    error,
    isLoading,
  } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/auth/user", {
          credentials: 'include',
        });
        
        // Silently handle 401 errors - user is not authenticated
        if (response.status === 401) {
          // Clear authentication indicators on 401
          localStorage.removeItem('hasAuthenticated');
          sessionStorage.removeItem('userAuthenticated');
          return null;
        }
        
        // Handle other HTTP errors
        if (!response.ok) {
          // Don't log auth errors to console in production
          if (isDevelopmentEnvironment()) {
            console.warn(`Auth query failed with status ${response.status}:`, response.statusText);
          }
          throw new Error(`Authentication check failed: ${response.status}`);
        }
        
        const userData = await response.json();
        console.log('🔍 useAuth - Raw response data:', userData);
        console.log('🌍 Environment check:', {
          hostname: window.location.hostname,
          port: window.location.port,
          href: window.location.href,
          isDev: isDevelopmentEnvironment(),
          isProd: isProductionEnvironment()
        });
        console.log('🔑 Auth indicators:', {
          hasSessionCookie: document.cookie.includes('connect.sid') || document.cookie.includes('session'),
          hasLocalAuth: localStorage.getItem('hasAuthenticated') === 'true',
          hasSessionAuth: sessionStorage.getItem('userAuthenticated') === 'true',
          shouldCheckAuth,
          cookies: document.cookie
        });
        
        // Set authentication indicators on successful auth
        localStorage.setItem('hasAuthenticated', 'true');
        sessionStorage.setItem('userAuthenticated', 'true');
        
        return userData;
      } catch (fetchError: any) {
        // Clear authentication indicators on network errors
        localStorage.removeItem('hasAuthenticated');
        sessionStorage.removeItem('userAuthenticated');
        
        // Silently handle network errors that might indicate auth issues
        if (fetchError.name === 'TypeError' && fetchError.message.includes('Failed to fetch')) {
          devWarn('🌐 Network error during auth check, treating as unauthenticated');
          return null;
        }
        
        // Re-throw other errors for proper error handling
        throw fetchError;
      }
    },
    enabled: shouldCheckAuth, // Only run query when session indicators are present
    retry: false, // Never retry auth queries to prevent 401 spam
    staleTime: 1000 * 60 * 5, // 5 minutes - prevent excessive polling
    refetchOnWindowFocus: false, // Disable window focus refetch to prevent 401 spam
    refetchOnMount: false, // Prevent automatic refetch on mount
    refetchOnReconnect: false, // Disable reconnect refetch during logout
    refetchInterval: false, // No automatic polling for auth
    // Add meta for query identification in DevTools
    meta: {
      cacheType: 'MASTER',
      isAuthQuery: true,
    },
  });

  // Debug effect to monitor user data changes (after useQuery is defined)
  useEffect(() => {
    console.log('👤 useAuth user data changed:', {
      user: user ? {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      } : null,
      isLoading,
      error: error?.message,
      shouldCheckAuth
    });
  }, [user, isLoading, error, shouldCheckAuth]);

  const loginMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include',
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Login failed");
      }

      return await response.json();
    },
    onSuccess: (user: User) => {
      // Set the user data directly without invalidating to prevent immediate 401 calls
      queryClient.setQueryData(["/api/auth/user"], user);
      devLog('✅ Login successful, user data set:', user);
      
      // Set authentication indicators for future sessions
      localStorage.setItem('hasAuthenticated', 'true');
      sessionStorage.setItem('userAuthenticated', 'true');
      
      // Invalidate and refetch to ensure session is properly established
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      }, 100);
    },
  });

  const forceLogout = useCallback(async () => {
    console.log("🚪 Starting force logout process");
    
    try {
      // First, immediately set query data to null to prevent further requests
      queryClient.setQueryData(["/api/auth/user"], null);
      
      // Clear authentication indicators immediately
      localStorage.removeItem('hasAuthenticated');
      sessionStorage.removeItem('userAuthenticated');
      
      // Cancel any outgoing requests to prevent race conditions
      await queryClient.cancelQueries({ queryKey: ["/api/auth/user"] });
      
      // Call the force logout endpoint for complete cleanup
      const response = await fetch("/api/auth/force-logout", {
        method: "POST",
        credentials: 'include',
      });
      
      if (!response.ok) {
        console.warn("⚠️ Force logout API call failed, but continuing with client-side cleanup");
      } else {
        console.log("✅ Server logout successful");
      }
    } catch (error) {
      console.warn("⚠️ Server logout failed, but continuing with client-side cleanup:", error);
    }
    
    // Clear all React Query caches
    queryClient.clear();
    
    // Force redirect to login page
    navigate("/login");
    
    console.log("✅ Force logout completed");
  }, [queryClient, navigate]);

  const logoutMutation = useMutation({
    mutationFn: async () => {
      console.log("🚪 Starting logout process");
      
      // Immediately set user to null to prevent UI issues
      queryClient.setQueryData(["/api/auth/user"], null);
      
      // Clear authentication indicators immediately
      localStorage.removeItem('hasAuthenticated');
      sessionStorage.removeItem('userAuthenticated');
      
      // Keep auth checking enabled to properly handle the logged-out state
      // The query will return null for unauthenticated users
      
      // Cancel any pending auth queries to prevent 401 errors
      await queryClient.cancelQueries({ queryKey: ["/api/auth/user"] });
      
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: 'include',
      });

      if (!response.ok) {
        console.warn("⚠️ Regular logout failed, attempting force logout");
        throw new Error("Logout failed");
      }
      
      console.log("✅ Regular logout successful");
      return response.json();
    },
    onSuccess: () => {
      console.log("🧹 Cleaning up after successful logout");
      
      // Clear all caches
      queryClient.clear();
      
      // Navigate to login
      navigate("/login");
    },
    onError: async (error) => {
      console.log("❌ Regular logout failed, attempting force logout:", error);
      
      // If regular logout fails, try force logout
      await forceLogout();
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        isAuthenticated: !!user,
        error,
        loginMutation,
        logoutMutation,
        forceLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export { AuthProvider, useAuth };