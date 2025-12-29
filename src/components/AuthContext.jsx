// AuthContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import authService from '@/api/services/authService';
import apiClient from '@/api/client';
import { effectivePermissions } from '@/lib/permissions';

// Context shape
const AuthContext = createContext({
  user: null,
  token: null,
  // actions
  login: async () => false,
  verifyLoginOtp: async () => false,
  resendLoginOtp: async () => false,
  socialLogin: async () => false,
  register: async () => false,
  logout: async () => {},
  refreshToken: async () => false,
  // role/permission helpers
  hasRole: () => false,
  hasAnyRole: () => false,
  can: () => true,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const loadFromStores = (key, parseJson = false) => {
    try {
      const lsv = localStorage.getItem(key);
      const ssv = sessionStorage.getItem(key);
      const raw = lsv != null ? lsv : ssv;
      if (raw == null) return null;
      return parseJson ? JSON.parse(raw) : raw;
    } catch {
      return null;
    }
  };

  const [user, setUser] = useState(() => loadFromStores('user', true));
  const [rememberPref, setRememberPref] = useState(() => {
    try {
      // default to true to keep previous behaviour (persist between sessions)
      const v = localStorage.getItem('remember_pref');
      return v == null ? true : v === '1';
    } catch {
      return true;
    }
  });

  const clearStoredAuth = useCallback(() => {
    try {
      localStorage.removeItem('user');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
      sessionStorage.removeItem('user');
      sessionStorage.removeItem('auth_token');
      sessionStorage.removeItem('refresh_token');
    } catch {}
  }, []);
  const token = null;

  // Keep a ref for refresh function to avoid exhaustive-deps churn
  const refreshRef = useRef(null);

  // Configure apiClient once
  useEffect(() => {
    // Clear any lingering bearer token usage; rely on httpOnly cookies.
    apiClient.setAuthTokenProvider(null);
    apiClient.setAuthToken(null);
    let refreshing = false;
    apiClient.onUnauthorized = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const ok = await (refreshRef.current
          ? refreshRef.current()
          : Promise.resolve(false));
        if (!ok) {
          setUser(null);
          clearStoredAuth();
        }
      } finally {
        refreshing = false;
      }
    };
  }, [clearStoredAuth]);

  const persistUser = useCallback(
    (nextUser, remember = undefined) => {
      const useRemember =
        typeof remember === 'boolean' ? remember : Boolean(rememberPref);

      setUser(nextUser);

      try {
        // Choose storage target
        const store = useRemember ? localStorage : sessionStorage;
        const other = useRemember ? sessionStorage : localStorage;

        // Clear old data from the other store to avoid confusion
        try {
          other.removeItem('user');
          other.removeItem('auth_token');
          other.removeItem('refresh_token');
        } catch {}

        // Persist to target store
        if (nextUser) {
          store.setItem('user', JSON.stringify(nextUser));
        } else {
          store.removeItem('user');
        }
        store.removeItem('auth_token');
        store.removeItem('refresh_token');

        // Persist preference for next logins
        if (typeof remember === 'boolean') {
          localStorage.setItem('remember_pref', remember ? '1' : '0');
          setRememberPref(remember);
        }
      } catch {}
    },
    [rememberPref]
  );

  useEffect(() => {
    let active = true;
    const hydrateUser = async () => {
      try {
        const res = await authService.me();
        if (!active) return;
        if (res?.success && res?.user) {
          persistUser(res.user);
        } else {
          setUser(null);
          clearStoredAuth();
        }
      } catch {
        if (!active) return;
        setUser(null);
        clearStoredAuth();
      }
    };
    hydrateUser();
    return () => {
      active = false;
    };
  }, [clearStoredAuth, persistUser]);

  const login = useCallback(
    async (email, password, options = {}) => {
      try {
        const res = await authService.login(email, password, options);
        const shouldPersist =
          res?.success && res?.user && !res?.otpRequired && !res?.pending;
        if (shouldPersist) {
          const remember = Boolean(options?.remember);
          persistUser(res.user, remember);
        }
        return res;
      } catch (err) {
        return {
          success: false,
          error: err?.message || 'Login failed',
          status: err?.status ?? null,
          code: err?.code ?? null,
          details: err?.details ?? null,
        };
      }
    },
    [persistUser]
  );

  const verifyLoginOtp = useCallback(
    async ({ email, otpToken, code, remember } = {}) => {
      try {
        const res = await authService.verifyLoginOtp({
          email,
          otpToken,
          code,
          remember,
        });
        if (res?.success && res?.user) {
          const rememberChoice =
            typeof remember === 'boolean' ? remember : Boolean(res?.remember);
          persistUser(res.user, rememberChoice);
        }
        return res;
      } catch (err) {
        return { success: false, error: err?.message || 'Verification failed' };
      }
    },
    [persistUser]
  );

  const resendLoginOtp = useCallback(
    async ({ email, otpToken, remember } = {}) => {
      try {
        return await authService.resendLoginOtp({ email, otpToken, remember });
      } catch (err) {
        return { success: false, error: err?.message || 'Resend failed' };
      }
    },
    []
  );

  const socialLogin = useCallback(
    async (provider) => {
      try {
        const res = await authService.socialLogin(provider);
        if (res?.success && res?.user) {
          persistUser(res.user);
          return true;
        }
        return false;
      } catch (err) {
        return false;
      }
    },
    [persistUser]
  );

  const loginWithGoogle = useCallback(
    async (credential, options = {}) => {
      try {
        const res = await authService.loginWithGoogle(credential);
        if (!res?.success) return { success: false };
        const shouldPersist = res?.user && !res?.pending && !res?.verifyToken;
        if (shouldPersist) {
          const remember = Boolean(options?.remember);
          persistUser(res.user, remember);
        }
        return res; // { success, pending?, user, token?, verifyToken? }
      } catch (err) {
        return { success: false, error: err?.message || 'Login failed' };
      }
    },
    [persistUser]
  );

  const loginWithFace = useCallback(
    async (imageData, options = {}) => {
      try {
        const res = await authService.loginWithFace(imageData, options);
        if (!res?.success) return { success: false };
        const shouldPersist = res?.user && !res?.pending;
        if (shouldPersist) {
          const remember = Boolean(options?.remember);
          persistUser(res.user, remember);
        }
        return res;
      } catch (err) {
        return { success: false, error: err?.message || 'Login failed' };
      }
    },
    [persistUser]
  );

  const register = useCallback(
    async (userData) => {
      try {
        const res = await authService.register(userData);
        // Do not persist during pending; page will route to verify
        if (res?.success && res?.user && !res?.pending) {
          persistUser(res.user);
        }
        return res;
      } catch (err) {
        return { success: false, error: err?.message || 'Registration failed' };
      }
    },
    [persistUser]
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {}
    clearStoredAuth();
    setUser(null);
  }, [clearStoredAuth]);

  const refreshToken = useCallback(async () => {
    try {
      const res = await authService.refreshToken();
      if (!res?.success) return false;
      const me = await authService.me();
      if (me?.success && me?.user) {
        persistUser(me.user);
      }
      return true;
    } catch (err) {
      await logout();
      return false;
    }
  }, [logout, persistUser]);

  // keep latest refresh function in a ref for onUnauthorized
  useEffect(() => {
    refreshRef.current = refreshToken;
  }, [refreshToken]);

  // Role/permission helpers
  const hasRole = (role) =>
    (user?.role || '').toLowerCase() === (role || '').toLowerCase();
  const hasAnyRole = (roles = []) => roles.some((r) => hasRole(r));
  const can = (permission) => {
    if (!permission) return true;
    if (hasRole('admin')) return true;
    const perms = effectivePermissions(user);
    return perms.includes('all') || perms.includes(permission);
  };

  const updateProfile = useCallback(
    async (updates) => {
      try {
        const nextUser = { ...(user || {}), ...(updates || {}) };
        // Persist profile updates for display; auth cookies remain unchanged.
        persistUser(nextUser);
        return true;
      } catch {
        return false;
      }
    },
    [user, persistUser]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        verifyLoginOtp,
        resendLoginOtp,
        socialLogin,
        loginWithGoogle,
        loginWithFace,
        register,
        logout,
        refreshToken,
        updateProfile,
        hasRole,
        hasAnyRole,
        can,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
