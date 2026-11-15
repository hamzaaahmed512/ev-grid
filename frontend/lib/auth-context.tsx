'use client';

/**
 * AuthContext — standardized on native Supabase Auth sessions.
 * Manages HTTP-only cookie-based sessions, auto-token refresh,
 * onAuthStateChange listeners, and eliminates manual localStorage JWT conflicts.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { createClient } from './supabase/client';
import type { ApiUser, UserProfileUpdateInput } from './api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthState {
  /** null = loading, undefined = not logged in, ApiUser = logged in */
  user: ApiUser | null | undefined;
  session: Session | null;
  /** True until initial session hydration from Supabase completes */
  loading: boolean;
  /** Sign up with email & password */
  signup(name: string, email: string, password: string): Promise<string | null>;
  /** Log in with email & password */
  login(email: string, password: string): Promise<string | null>;
  /** Trigger Supabase Google OAuth redirect */
  googleLogin(): Promise<string | null>;
  /** Update user profile attributes in Supabase user metadata */
  updateProfile(data: UserProfileUpdateInput): Promise<string | null>;
  /** Refresh current user profile */
  refreshUser(): Promise<ApiUser | null>;
  /** Log out and clear Supabase session */
  logout(): Promise<void>;
}

// ── User Mapping Helper ───────────────────────────────────────────────────────

export function mapSupabaseUser(user: SupabaseUser | null | undefined): ApiUser | null {
  if (!user) return null;

  const metadata = user.user_metadata || {};
  const name =
    metadata.full_name ||
    metadata.name ||
    user.email?.split('@')[0] ||
    'EV Driver';

  return {
    id: user.id,
    name,
    email: user.email || '',
    phone: user.phone || metadata.phone || null,
    city: metadata.city || null,
    profile_image_url: metadata.avatar_url || metadata.picture || metadata.profile_image_url || null,
    role: metadata.role || 'driver',
    created_at: user.created_at,
    updated_at: user.updated_at || null,
  };
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(() => createClient());
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<ApiUser | null | undefined>(null);
  const [loading, setLoading] = useState(true);

  // Initial session hydration and onAuthStateChange listener
  useEffect(() => {
    let mounted = true;

    async function hydrateSession() {
      try {
        const {
          data: { session: initialSession },
        } = await supabase.auth.getSession();

        if (mounted) {
          setSession(initialSession);
          setUser(initialSession ? mapSupabaseUser(initialSession.user) : undefined);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to hydrate Supabase auth session:', err);
        if (mounted) {
          setUser(undefined);
          setLoading(false);
        }
      }
    }

    hydrateSession();

    // Listen to native Supabase session events
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!mounted) return;
      setSession(currentSession);
      setUser(currentSession ? mapSupabaseUser(currentSession.user) : undefined);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const refreshUser = useCallback(async (): Promise<ApiUser | null> => {
    try {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      const mapped = mapSupabaseUser(currentUser);
      setUser(mapped || undefined);
      return mapped;
    } catch {
      return null;
    }
  }, [supabase]);

  const signup = useCallback(
    async (name: string, email: string, password: string): Promise<string | null> => {
      try {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
              name,
              role: 'driver',
            },
            emailRedirectTo: `${origin}/api/auth/callback`,
          },
        });

        if (error) return error.message;

        // When "Confirm email" is enabled on the Supabase project, signUp()
        // succeeds but returns no session. Do NOT treat that as a login:
        // tell the user to confirm their address first (sentinel consumed
        // by the auth UI, which shows a friendly notice instead of a red error).
        if (!data.session) {
          return 'EMAIL_CONFIRMATION_REQUIRED';
        }

        return null;
      } catch (err: unknown) {
        return (err as Error)?.message ?? 'Signup failed. Please try again.';
      }
    },
    [supabase],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) return error.message;
        return null;
      } catch (err: unknown) {
        return (err as Error)?.message ?? 'Login failed. Please try again.';
      }
    },
    [supabase],
  );

  const googleLogin = useCallback(async (): Promise<string | null> => {
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      // NOTE: do NOT pass access_type:'offline' / prompt:'consent'.
      // prompt:'consent' forces Google to re-issue consent every time and is a
      // known contributor to Supabase's "Unable to exchange external code"
      // failure with PKCE flows (the single-use authorization code gets
      // replayed/voided). Supabase manages refresh tokens itself.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${origin}/api/auth/callback`,
        },
      });

      if (error) return error.message;
      return null;
    } catch (err: unknown) {
      return (err as Error)?.message ?? 'Google sign-in failed. Please try again.';
    }
  }, [supabase]);

  const updateProfile = useCallback(
    async (data: UserProfileUpdateInput): Promise<string | null> => {
      try {
        const updates: Record<string, unknown> = {};
        if (data.name !== undefined) updates.full_name = data.name;
        if (data.phone !== undefined) updates.phone = data.phone;
        if (data.city !== undefined) updates.city = data.city;
        if (data.profile_image_url !== undefined) updates.avatar_url = data.profile_image_url;

        const { data: updated, error } = await supabase.auth.updateUser({
          data: updates,
        });

        if (error) return error.message;
        setUser(mapSupabaseUser(updated.user));
        return null;
      } catch (err: unknown) {
        return (err as Error)?.message ?? 'Failed to update profile.';
      }
    },
    [supabase],
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(undefined);
  }, [supabase]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signup,
        login,
        googleLogin,
        updateProfile,
        refreshUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
