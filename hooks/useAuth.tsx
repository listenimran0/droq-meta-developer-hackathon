import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getProfile, syncProfileFromAuth } from '@/services/auth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Profile } from '@/types/drop';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  configured: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Prefer live Google metadata while profiles row is still catching up. */
function metaFallbackProfile(user: User): Profile | null {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const nameKeys = ['display_name', 'full_name', 'name'] as const;
  let displayName: string | null = null;
  for (const key of nameKeys) {
    const v = meta[key];
    if (typeof v === 'string' && v.trim()) {
      displayName = v.trim();
      break;
    }
  }
  let avatarUrl: string | null = null;
  for (const key of ['avatar_url', 'picture'] as const) {
    const v = meta[key];
    if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) {
      avatarUrl = v.trim();
      break;
    }
  }
  if (!displayName && !avatarUrl) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    username: null,
    display_name: displayName,
    avatar_url: avatarUrl,
    created_at: user.created_at ?? new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    if (!session?.user?.id || !isSupabaseConfigured) {
      setProfile(null);
      return;
    }
    const user = session.user;
    // Show Google name/photo immediately while DB profile catches up
    const fallback = metaFallbackProfile(user);
    if (fallback) {
      setProfile((prev) => prev ?? fallback);
    }
    try {
      const synced = await syncProfileFromAuth(user).catch(() => null);
      const p = synced ?? (await getProfile(user.id));
      if (p) {
        setProfile(p);
      } else if (fallback) {
        setProfile(fallback);
      } else {
        setProfile(null);
      }
    } catch {
      if (fallback) setProfile(fallback);
      else setProfile(null);
    }
  }, [session?.user]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!isSupabaseConfigured) {
        if (mounted) setLoading(false);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      configured: isSupabaseConfigured,
      refreshProfile,
      signOut: async () => {
        await supabase.auth.signOut();
        setProfile(null);
      },
    }),
    [session, profile, loading, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
