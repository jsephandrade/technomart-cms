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

const USE_AUTH_COOKIES =
  typeof import.meta !== 'undefined' &&
  import.meta.env &&
  (import.meta.env.VITE_AUTH_USE_COOKIES === 'true' ||
    import.meta.env.VITE_AUTH_USE_COOKIES === '1');

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
    if (USE_AUTH_COOKIES && (key === 'auth_token' || key === 'refresh_token')) {
      return null;
    }
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
  const [token, setToken] = useState(() => loadFromStores('auth_token'));
  const [refreshTokenValue, setRefreshTokenValue] = useState(() =>
    loadFromStores('refresh_token')
  );
  const [rememberPref, setRememberPref] = useState(() => {
    try {
      // default to true to keep previous behaviour (persist between sessions)
      const v = localStorage.getItem('remember_pref');
      return v == null ? true : v === '1';
    } catch {
      return true;
    }
  });

  // Keep a ref for apiClient token provider to avoid stale closures
  const tokenRef = useRef(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // Keep a ref for refresh function to avoid exhaustive-deps churn
  const refreshRef = useRef(null);

  // Configure apiClient once
  useEffect(() => {
    // Dynamic token provider and 401 handler
    apiClient.setAuthTokenProvider(() => tokenRef.current);
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
          setToken(null);
          try {
            localStorage.removeItem('user');
            localStorage.removeItem('auth_token');
            localStorage.removeItem('refresh_token');
            sessionStorage.removeItem('user');
            sessionStorage.removeItem('auth_token');
            sessionStorage.removeItem('refresh_token');
          } catch {}
        }
      } finally {
        refreshing = false;
      }
    };
  }, []);

  // Initialize apiClient header from persisted token
  useEffect(() => {
    apiClient.setAuthToken(token);
  }, [token]);

  const persistAuth = useCallback(
    (nextUser, nextToken, nextRefreshToken = null, remember = undefined) => {
      const useRemember =
        typeof remember === 'boolean' ? remember : Boolean(rememberPref);

      setUser(nextUser);
      setToken(USE_AUTH_COOKIES ? null : nextToken);
      setRefreshTokenValue(USE_AUTH_COOKIES ? null : nextRefreshToken);

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

        // Always remove tokens from both stores when using cookie auth
        if (USE_AUTH_COOKIES) {
          try {
            store.removeItem('auth_token');
            store.removeItem('refresh_token');
          } catch {}
        }

        // Persist to target store
        if (nextUser) {
          store.setItem('user', JSON.stringify(nextUser));
        } else {
          store.removeItem('user');
        }
        if (!USE_AUTH_COOKIES) {
          if (nextToken) {
            store.setItem('auth_token', nextToken);
          } else {
            store.removeItem('auth_token');
          }
          if (nextRefreshToken) {
            store.setItem('refresh_token', nextRefreshToken);
          } else {
            store.removeItem('refresh_token');
          }
        }

        // Persist preference for next logins
        if (typeof remember === 'boolean') {
          localStorage.setItem('remember_pref', remember ? '1' : '0');
          setRememberPref(remember);
        }
      } catch {}
    },
    [rememberPref]
  );

  const login = useCallback(
    async (email, password, options = {}) => {
      try {
        const res = await authService.login(email, password, options);
        if (res?.success && res?.token) {
          const remember = Boolean(options?.remember);
          persistAuth(res.user, res.token, res.refreshToken || null, remember);
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
    [persistAuth]
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
        if (res?.success && res?.token) {
          const rememberChoice =
            typeof remember === 'boolean' ? remember : Boolean(res?.remember);
          persistAuth(
            res.user,
            res.token,
            res.refreshToken || null,
            rememberChoice
          );
        }
        return res;
      } catch (err) {
        return { success: false, error: err?.message || 'Verification failed' };
      }
    },
    [persistAuth]
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
        if (res?.success) {
          persistAuth(res.user, res.token || null, res.refreshToken || null);
          return true;
        }
        return false;
      } catch (err) {
        return false;
      }
    },
    [persistAuth]
  );

  const loginWithGoogle = useCallback(
    async (credential, options = {}) => {
      try {
        const res = await authService.loginWithGoogle(credential);
        if (!res?.success) return { success: false };
        // Only persist when we actually have a token (approved users)
        if (res.token) {
          const remember = Boolean(options?.remember);
          persistAuth(res.user, res.token, res.refreshToken || null, remember);
        }
        return res; // { success, pending?, user, token?, verifyToken? }
      } catch (err) {
        return { success: false, error: err?.message || 'Login failed' };
      }
    },
    [persistAuth]
  );

  const loginWithFace = useCallback(
    async (imageData, options = {}) => {
      try {
        const res = await authService.loginWithFace(imageData, options);
        if (!res?.success) return { success: false };
        if (res.token) {
          const remember = Boolean(options?.remember);
          persistAuth(res.user, res.token, res.refreshToken || null, remember);
        }
        return res;
      } catch (err) {
        return { success: false, error: err?.message || 'Login failed' };
      }
    },
    [persistAuth]
  );

  const register = useCallback(
    async (userData) => {
      try {
        const res = await authService.register(userData);
        // Do not persist during pending; page will route to verify
        if (res?.success && res?.token) {
          persistAuth(res.user, res.token, res.refreshToken || null);
        }
        return res;
      } catch (err) {
        return { success: false, error: err?.message || 'Registration failed' };
      }
    },
    [persistAuth]
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout(USE_AUTH_COOKIES ? null : refreshTokenValue);
    } catch {}
    // Clear from both storages on logout
    try {
      localStorage.removeItem('user');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
      sessionStorage.removeItem('user');
      sessionStorage.removeItem('auth_token');
      sessionStorage.removeItem('refresh_token');
    } catch {}
    setUser(null);
    setToken(null);
    setRefreshTokenValue(null);
  }, [refreshTokenValue]);

  const refreshToken = useCallback(async () => {
    if (!refreshTokenValue && !USE_AUTH_COOKIES) {
      // No refresh token available; nothing to do
      return false;
    }
    try {
      const res = await authService.refreshToken(
        USE_AUTH_COOKIES ? undefined : refreshTokenValue
      );
      if (!res?.success) return false;
      if (!USE_AUTH_COOKIES) {
        if (!res?.token) return false;
        setToken(res.token);
        setRefreshTokenValue(res.refreshToken || null);
        try {
          // Update both storages just in case
          [localStorage, sessionStorage].forEach((store) => {
            try {
              store.setItem('auth_token', res.token);
              if (res.refreshToken) {
                store.setItem('refresh_token', res.refreshToken);
              }
            } catch {}
          });
        } catch {}
      } else {
        setToken(null);
        setRefreshTokenValue(null);
      }
      return true;
    } catch (err) {
      await logout();
      return false;
    }
  }, [logout, refreshTokenValue]);

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
        // Reuse current token/refresh; persist to the same store based on rememberPref
        persistAuth(
          nextUser,
          tokenRef.current || token,
          refreshTokenValue || null
        );
        return true;
      } catch {
        return false;
      }
    },
    [user, persistAuth, token, refreshTokenValue]
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
