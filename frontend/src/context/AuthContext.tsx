import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { authApi } from '@/api/endpoints';
import { getStoredToken, setStoredToken, setUnauthorizedHandler } from '@/api/client';
import type { AuthUser, Role } from '@/types/api';

interface AuthContextValue {
  user: AuthUser | null;
  /** True only while the stored token is being validated on first load. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  /** True when the current user holds any of the given roles. */
  can: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    setStoredToken(null);
    setUser(null);
  }, []);

  // A 401 from any request means the token is gone or expired; drop the session
  // rather than leaving the user in a UI where nothing works.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // On load, a stored token is verified against the API before it is trusted.
  // The token could have expired, or the account could have been deactivated.
  useEffect(() => {
    let cancelled = false;

    if (!getStoredToken()) {
      setIsLoading(false);
      return;
    }

    authApi
      .me()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        if (!cancelled) setStoredToken(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: loggedIn } = await authApi.login(email, password);
    setStoredToken(token);
    setUser(loggedIn);
    return loggedIn;
  }, []);

  const can = useCallback((...roles: Role[]) => (user ? roles.includes(user.role) : false), [user]);

  const value = useMemo(
    () => ({ user, isLoading, login, logout, can }),
    [user, isLoading, login, logout, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}
