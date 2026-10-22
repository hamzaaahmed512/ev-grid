'use client';
/**
 * AuthContext — provides authentication state and actions to the whole app.
 * Uses the real FastAPI backend via lib/api.ts.
 * Token is persisted in localStorage; user profile is re-validated on mount.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  authApi,
  getToken,
  setToken,
  clearToken,
  getStoredUser,
  setStoredUser,
  ApiError,
  type ApiUser,
} from './api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthState {
  /** null = not loaded yet, undefined = not authenticated */
  user: ApiUser | null | undefined;
  /** True while the initial token verification is in flight */
  loading: boolean;
  /** Sign up a new user — returns error string on failure */
  signup(name: string, email: string, password: string): Promise<string | null>;
  /** Log in an existing user — returns error string on failure */
  login(email: string, password: string): Promise<string | null>;
  googleLogin(credential: string): Promise<string | null>;
  /** Clear token & user state */
  logout(): void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // null = loading, undefined = logged-out, ApiUser = logged-in
  const [user, setUser] = useState<ApiUser | null | undefined>(null);
  const [loading, setLoading] = useState(true);

  // On mount: if a token exists in localStorage, verify it with /auth/me
  useEffect(() => {
    const token = getToken();
    if (!token) {
      // No token — try to restore from cached user data, then mark as logged out
      setUser(undefined);
      setLoading(false);
      return;
    }

    // Optimistically restore from localStorage first (avoids flash)
    const cached = getStoredUser();
    if (cached) setUser(cached);

    authApi
      .me()
      .then((me) => {
        setUser(me);
        setStoredUser(me);
      })
      .catch(() => {
        // Token is expired or invalid — clear everything
        clearToken();
        setUser(undefined);
      })
      .finally(() => setLoading(false));
  }, []);

  const signup = useCallback(
    async (name: string, email: string, password: string): Promise<string | null> => {
      try {
        const res = await authApi.signup(name, email, password);
        setToken(res.access_token);
        setStoredUser(res.user);
        setUser(res.user);
        return null;
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          return err.detail || err.message;
        }
        return (err as { detail?: string; message?: string })?.detail ?? (err as { message?: string })?.message ?? 'Signup failed. Please try again.';
      }
    },
    [],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      try {
        const res = await authApi.login(email, password);
        setToken(res.access_token);
        setStoredUser(res.user);
        setUser(res.user);
        return null;
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          return err.detail || err.message;
        }
        return (err as { detail?: string; message?: string })?.detail ?? (err as { message?: string })?.message ?? 'Login failed. Please try again.';
      }
    },
    [],
  );

  const googleLogin = useCallback(async (credential: string): Promise<string | null> => {
    try {
      const res = await authApi.google(credential);
      setToken(res.access_token);
      setStoredUser(res.user);
      setUser(res.user);
      return null;
    } catch (err: unknown) {
      return err instanceof ApiError ? err.detail : 'Google sign-in failed. Please try again.';
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(undefined);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signup, login, googleLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
