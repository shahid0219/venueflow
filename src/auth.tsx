import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import type { Role, User } from './types';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: { name: string; email: string; password: string; role?: Role }) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<User, 'name' | 'phone' | 'city' | 'skills' | 'availability' | 'bio'>>) => Promise<User>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ user: User }>('/api/auth/me');
      setUser(data.user);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) {
        // Network/other failures leave the session untouched; the UI surfaces the error.
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api<{ user: User }>('/api/auth/login', { method: 'POST', body: { email, password } });
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(
    async (input: { name: string; email: string; password: string; role?: Role }) => {
      const data = await api<{ user: User }>('/api/auth/register', { method: 'POST', body: input });
      setUser(data.user);
      return data.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  }, []);

  const updateProfile = useCallback(
    async (patch: Partial<Pick<User, 'name' | 'phone' | 'city' | 'skills' | 'availability' | 'bio'>>) => {
      const data = await api<{ user: User }>('/api/auth/profile', { method: 'PATCH', body: patch });
      setUser(data.user);
      return data.user;
    },
    [],
  );

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refresh, updateProfile }),
    [user, loading, login, register, logout, refresh, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

/** Roles permitted to mutate operational records (mirrors the server-side guard). */
export function canManage(user: User | null): boolean {
  return Boolean(user && user.role !== 'volunteer');
}
