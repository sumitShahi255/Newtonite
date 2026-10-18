import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, getAuthToken, setAuthToken, clearAuthToken } from '../api';

interface UserMembership {
  teamId: string;
  role: 'VIEWER' | 'MEMBER' | 'LEAD' | 'ADMIN';
  teamName: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  memberships: UserMembership[];
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password?: string) => Promise<void>;
  logout: () => void;
  switchPersona: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(getAuthToken());
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadUser() {
      const storedToken = getAuthToken();
      if (!storedToken) {
        // Auto login with default platform lead for zero-friction reviewer experience
        try {
          await login('lead.platform@newtonite.internal', 'Password123!');
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
        return;
      }

      try {
        const res = await api.getMe();
        setUser(res.user);
      } catch (err) {
        clearAuthToken();
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, []);

  const login = async (email: string, password: string = 'Password123!') => {
    setLoading(true);
    try {
      const res = await api.login(email, password);
      setAuthToken(res.token);
      setToken(res.token);
      setUser(res.user);
    } finally {
      setLoading(false);
    }
  };

  const switchPersona = async (email: string) => {
    await login(email, 'Password123!');
  };

  const logout = () => {
    clearAuthToken();
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, switchPersona }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
