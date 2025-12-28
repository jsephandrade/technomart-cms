import apiClient from '../client';

const mockDelay = (ms = 600) => new Promise((r) => setTimeout(r, ms));
const USE_MOCKS = !(
  typeof import.meta !== 'undefined' &&
  import.meta.env &&
  (import.meta.env.VITE_ENABLE_MOCKS === 'false' ||
    import.meta.env.VITE_ENABLE_MOCKS === '0')
);

const mockLoginOtps = new Map();

class AuthService {
  async loginWithGoogle(credential) {
    if (!credential || typeof credential !== 'string') {
      throw new Error('Missing Google credential');
    }
    if (USE_MOCKS) {
      await mockDelay(400);
      return {
        success: true,
        pending: true,
        user: {
          id: 'g-' + Date.now().toString(),
          name: 'Google User',
          email: 'user@example.com',
          role: 'staff',
          status: 'pending',
          employeeId: 'emp-' + Date.now().toString(),
        },
        token: null,
        verifyToken: 'mock-verify-token-' + Date.now(),
      };
    }
    const res = await apiClient.post(
      '/auth/google',
      { credential },
      { retry: { retries: 1 } }
    );
    const data = res?.data || res;
    const rawUser = data.user || data;
    const user = {
      ...rawUser,
      employeeId:
        rawUser?.employeeId ??
        rawUser?.employee_id ??
        rawUser?.employee?.id ??
        data.employeeId ??
        data.employee_id ??
        null,
    };
    return {
      success: Boolean(data?.success ?? true),
      pending: Boolean(data?.pending ?? false),
      user,
      token: data.token || data.accessToken || null,
      refreshToken: data.refreshToken || null,
      verifyToken: data.verifyToken || null,
      message: data?.message || null,
    };
  }
  async loginWithFace(imageData, options = {}) {
    if (USE_MOCKS) {
      await mockDelay(400);
      return {
        success: true,
        pending: false,
        user: {
          id: 'u-face-' + Date.now().toString(),
          name: 'Face User',
          email: 'face@example.com',
          role: 'staff',
          status: 'active',
          employeeId: 'emp-face-' + Date.now().toString(),
        },
        token: 'mock-face-token-' + Date.now(),
        refreshToken: 'mock-face-rt-' + Date.now(),
      };
    }
    const remember = Boolean(options?.remember);
    const res = await apiClient.post(
      '/auth/face-login',
      { image: imageData, remember },
      { retry: { retries: 1 } }
    );
    const data = res?.data || res;
    const rawUser = data.user || data;
    const user = {
      ...rawUser,
      employeeId:
        rawUser?.employeeId ??
        rawUser?.employee_id ??
        rawUser?.employee?.id ??
        data.employeeId ??
        data.employee_id ??
        null,
    };
    return {
      success: Boolean(data?.success ?? true),
      pending: Boolean(data?.pending ?? false),
      user,
      token: data.token || data.accessToken || null,
      refreshToken: data.refreshToken || null,
      verifyToken: data.verifyToken || null,
      message: data?.message || null,
    };
  }

  async registerFace(images) {
    // images: array of base64 data URLs or objects with { data }
    if (USE_MOCKS) {
      await mockDelay(400);
      return { success: true };
    }
    const payload = Array.isArray(images) ? { images } : { image: images };
    const res = await apiClient.post('/auth/face-register', payload, {
      retry: { retries: 1 },
    });
    return res?.data || res;
  }
  async unregisterFace() {
    if (USE_MOCKS) {
      await mockDelay(300);
      return { success: true };
    }
    try {
      const res = await apiClient.post(
        '/auth/face-unregister',
        {},
        {
          retry: { retries: 1 },
        }
      );
      return res?.data || res;
    } catch (e1) {
      try {
        const res = await apiClient.delete('/auth/face-register', {
          retry: { retries: 1 },
        });
        return res?.data || res;
      } catch (e2) {
        return {
          success: false,
          message: e2?.message || e1?.message || 'Failed to disable face login',
        };
      }
    }
  }
  async login(email, password, options = {}) {
    const remember = Boolean(options?.remember);
    if (USE_MOCKS) {
      await mockDelay();
      const user = {
        id: 'u-' + Date.now().toString(),
        name: email.split('@')[0] || 'User',
        email,
        role: 'staff',
        status: 'active',
        employeeId: 'emp-' + (email?.split('@')[0] || 'mock'),
      };
      const otpToken = 'mock-login-otp-' + Date.now();
      const ttl = 60;
      mockLoginOtps.set(otpToken, {
        email: email.toLowerCase(),
        code: '123456',
        user,
        remember,
        expiresAt: Date.now() + ttl * 1000,
      });
      return {
        success: true,
        pending: false,
        user,
        otpRequired: true,
        otpToken,
        otpExpiresIn: ttl,
        token: null,
        refreshToken: null,
        verifyToken: null,
      };
    }
    const payload = { email, password, ...options, remember };
    const res = await apiClient.post('/auth/login', payload, {
      retry: { retries: 1 },
    });
    const data = res?.data || res;
    const rawUser = data.user || {
      id: data.userId || 'me',
      name: data.name || email,
      email,
      role: (data.role || 'staff').toLowerCase(),
      status: data.status || 'active',
    };
    const user = {
      ...rawUser,
      employeeId:
        rawUser?.employeeId ??
        rawUser?.employee_id ??
        rawUser?.employee?.id ??
        data.employeeId ??
        data.employee_id ??
        null,
    };
    return {
      success: Boolean(data?.success ?? true),
      pending: Boolean(data?.pending ?? false),
      user,
      token: data.token || data.accessToken || null,
      refreshToken: data.refreshToken || null,
      verifyToken: data.verifyToken || null,
      message: data?.message || null,
      otpRequired: Boolean(data?.otpRequired ?? false),
      otpToken: data.otpToken || null,
      otpExpiresIn: data.expiresIn ?? data.otpExpiresIn ?? null,
    };
  }

  async resendLoginOtp({ email, otpToken, remember } = {}) {
    const normalizedEmail = (email || '').toLowerCase();
    if (USE_MOCKS) {
      await mockDelay(300);
      const entry = mockLoginOtps.get(otpToken);
      if (!entry || entry.email !== normalizedEmail) {
        return {
          success: false,
          message: 'Session expired. Please login again.',
        };
      }
      const newToken = 'mock-login-otp-' + Date.now();
      const ttl = 60;
      mockLoginOtps.delete(otpToken);
      mockLoginOtps.set(newToken, {
        email: normalizedEmail,
        code: '123456',
        user: entry.user,
        remember: typeof remember === 'boolean' ? remember : entry.remember,
        expiresAt: Date.now() + ttl * 1000,
      });
      return {
        success: true,
        otpToken: newToken,
        expiresIn: ttl,
      };
    }
    const payload = {
      email: normalizedEmail,
      otpToken,
    };
    if (typeof remember === 'boolean') {
      payload.remember = remember;
    }
    const res = await apiClient.post('/auth/login/resend-otp', payload, {
      retry: { retries: 1 },
    });
    const data = res?.data || res;
    return {
      success: Boolean(data?.success ?? true),
      otpToken: data.otpToken || null,
      expiresIn: data.expiresIn ?? data.otpExpiresIn ?? null,
      message: data.message || null,
    };
  }

  async verifyLoginOtp({ email, otpToken, code, remember } = {}) {
    const normalizedEmail = (email || '').toLowerCase();
    const rememberFlag = typeof remember === 'boolean' ? remember : undefined;
    if (USE_MOCKS) {
      await mockDelay(300);
      const entry = mockLoginOtps.get(otpToken);
      if (
        !entry ||
        (normalizedEmail && entry.email !== normalizedEmail) ||
        !code ||
        String(code).trim() !== entry.code
      ) {
        return { success: false, message: 'Invalid or expired code.' };
      }
      mockLoginOtps.delete(otpToken);
      return {
        success: true,
        user: entry.user,
        token: 'mock-jwt-token-' + Date.now(),
        refreshToken: 'mock-refresh-token-' + Date.now(),
        remember: entry.remember,
      };
    }
    const payload = {
      email: normalizedEmail,
      otpToken,
      code,
    };
    if (typeof rememberFlag === 'boolean') {
      payload.remember = rememberFlag;
    }
    const res = await apiClient.post('/auth/login/verify-otp', payload, {
      retry: { retries: 1 },
    });
    const data = res?.data || res;
    const rawUser = data.user || data;
    const user = {
      ...rawUser,
      employeeId:
        rawUser?.employeeId ??
        rawUser?.employee_id ??
        rawUser?.employee?.id ??
        data.employeeId ??
        data.employee_id ??
        null,
    };
    return {
      success: Boolean(data?.success ?? true),
      user,
      token: data.token || data.accessToken || null,
      refreshToken: data.refreshToken || null,
      message: data.message || null,
      remember: rememberFlag,
    };
  }

  async register(userData) {
    if (USE_MOCKS) {
      await mockDelay();
      return {
        success: true,
        pending: true,
        user: {
          id: Date.now().toString(),
          ...userData,
          role: 'staff',
          status: 'pending',
          employeeId: 'emp-' + Date.now().toString(),
        },
        token: null,
        verifyToken: 'mock-verify-token-' + Date.now(),
      };
    }
    const res = await apiClient.post('/auth/register', userData, {
      retry: { retries: 1 },
    });
    const data = res?.data || res;
    const rawUser = data.user || {
      id: data.id || String(Date.now()),
      ...userData,
      role: (data.role || 'staff').toLowerCase(),
      status: data.status || 'pending',
    };
    const user = {
      ...rawUser,
      employeeId:
        rawUser?.employeeId ??
        rawUser?.employee_id ??
        rawUser?.employee?.id ??
        data.employeeId ??
        data.employee_id ??
        null,
    };
    return {
      success: Boolean(data?.success ?? true),
      pending: Boolean(data?.pending ?? false),
      user,
      token: data.token || data.accessToken || null,
      refreshToken: data.refreshToken || null,
      verifyToken: data.verifyToken || null,
    };
  }

  async logout(refreshToken) {
    if (USE_MOCKS) {
      await mockDelay(300);
      return { success: true };
    }
    const payload = refreshToken ? { refreshToken } : {};
    const res = await apiClient.post('/auth/logout', payload);
    return res?.data || { success: true };
  }

  async socialLogin(provider) {
    if (USE_MOCKS) {
      await mockDelay(500);
      return {
        success: true,
        user: {
          id: 'u-' + Date.now().toString(),
          name: 'Social User',
          email: 'user@example.com',
          role: 'staff',
          employeeId: 'emp-social-' + Date.now().toString(),
        },
        token: 'mock-social-token-' + Date.now(),
      };
    }
    const res = await apiClient.post('/auth/social', { provider });
    const data = res?.data || res;
    const rawUser = data.user || {
      id: 'me',
      name: data.name || 'User',
      email: data.email || 'user@example.com',
      role: (data.role || 'staff').toLowerCase(),
    };
    const user = {
      ...rawUser,
      employeeId:
        rawUser?.employeeId ??
        rawUser?.employee_id ??
        rawUser?.employee?.id ??
        data.employeeId ??
        data.employee_id ??
        null,
    };
    return {
      success: true,
      user,
      token: data.token || data.accessToken || null,
    };
  }

  async forgotPassword(email) {
    if (USE_MOCKS) {
      await mockDelay(400);
      return { success: true, message: 'Password reset email sent' };
    }
    const res = await apiClient.post('/auth/forgot-password', { email });
    return res?.data || { success: true };
  }

  async resetPassword(token, newPassword) {
    if (USE_MOCKS) {
      await mockDelay(400);
      return { success: true, message: 'Password reset successful' };
    }
    const res = await apiClient.post('/auth/reset-password', {
      token,
      newPassword,
    });
    return res?.data || { success: true };
  }

  async resetPasswordWithCode(email, code, newPassword) {
    if (USE_MOCKS) {
      await mockDelay(300);
      if (!newPassword || newPassword.length < 8) {
        return {
          success: false,
          message: 'Password must be at least 8 characters',
        };
      }
      return { success: true };
    }
    const res = await apiClient.post('/auth/reset-password-code', {
      email,
      code,
      newPassword,
    });
    return res?.data || res;
  }

  async verifyResetCode(email, code) {
    if (USE_MOCKS) {
      await mockDelay(200);
      return { success: true, commitToken: 'mock-commit-' + Date.now() };
    }
    const res = await apiClient.post('/auth/verify-reset-code', {
      email,
      code,
    });
    return res?.data || res;
  }

  async changePassword(currentPassword, newPassword) {
    if (USE_MOCKS) {
      await mockDelay(300);
      if (!newPassword || newPassword.length < 8) {
        return {
          success: false,
          message: 'Password must be at least 8 characters',
        };
      }
      return { success: true };
    }
    const res = await apiClient.post('/auth/change-password', {
      currentPassword,
      newPassword,
    });
    return res?.data || res;
  }

  async refreshToken(refreshToken) {
    if (USE_MOCKS) {
      await mockDelay(300);
      return {
        success: true,
        token: 'mock-refreshed-token-' + Date.now(),
        refreshToken: 'mock-rtok-' + Date.now(),
      };
    }
    const payload = refreshToken ? { refreshToken } : {};
    const res = await apiClient.post('/auth/refresh-token', payload);
    const data = res?.data || res;
    return {
      success: true,
      token: data.token || data.accessToken || null,
      refreshToken: data.refreshToken || null,
    };
  }

  async verifyEmail(token) {
    if (USE_MOCKS) {
      await mockDelay(300);
      return { success: true };
    }
    const res = await apiClient.post('/auth/verify-email', { token });
    return res?.data || res;
  }

  async resendVerification(email) {
    if (USE_MOCKS) {
      await mockDelay(300);
      return { success: true };
    }
    const res = await apiClient.post('/auth/resend-verification', { email });
    return res?.data || res;
  }

  // New OTP password reset flow
  async requestPasswordReset(email) {
    if (USE_MOCKS) {
      await mockDelay(300);
      return { success: true, message: 'If account exists, code sent.' };
    }
    const res = await apiClient.post('/auth/password-reset/request', { email });
    return res?.data || res;
  }

  async verifyPasswordReset(email, code) {
    if (USE_MOCKS) {
      await mockDelay(300);
      return { success: true, resetToken: 'mock-reset-' + Date.now() };
    }
    const res = await apiClient.post('/auth/password-reset/verify', {
      email,
      code,
    });
    return res?.data || res;
  }

  async confirmPasswordReset(resetToken, newPassword) {
    if (USE_MOCKS) {
      await mockDelay(300);
      return { success: true };
    }
    const res = await apiClient.post('/auth/password-reset/confirm', {
      resetToken,
      newPassword,
    });
    return res?.data || res;
  }
}

export const authService = new AuthService();
export default authService;
