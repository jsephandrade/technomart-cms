import apiClient from '../client';

class VerificationService {
  async getStatus(verifyToken) {
    if (!verifyToken) throw new Error('Missing verify token');
    const res = await apiClient.get(
      `/verify/status?token=${encodeURIComponent(verifyToken)}`
    );
    return res?.data || res;
  }

  async uploadHeadshot({ verifyToken, imageData, consent = true }) {
    if (!verifyToken) throw new Error('Missing verify token');
    const res = await apiClient.post('/verify/upload', {
      verifyToken,
      imageData,
      consent: Boolean(consent),
    });
    return res?.data || res;
  }

  async refreshVerifyToken(verifyToken) {
    const res = await apiClient.post('/verify/resend-token', {
      verifyToken,
    });
    return res?.data || res;
  }

  async list({ status = 'pending', page = 1, limit = 10, search = '' } = {}) {
    const params = new URLSearchParams();
    Object.entries({ status, page, limit, search }).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '')
        params.append(k, String(v));
    });

    // Auth uses httpOnly cookies; apiClient sends credentials when enabled.
    const res = await apiClient.get(`/verify/requests?${params.toString()}`);
    const data = (res?.data || []).map((r) => ({
      id: r.id,
      user: {
        name: r?.user?.name || '',
        email: r?.user?.email || '',
        phone: r?.user?.phone || '',
      },
      createdAt: r.createdAt,
      hasHeadshot: Boolean(r.hasHeadshot),
    }));

    return {
      success: res?.success ?? true,
      message: res?.message,
      data,
      pagination: res?.pagination || {
        page: Number(page) || 1,
        limit: Number(limit) || data.length,
        total: 0,
        totalPages: 0,
      },
    };
  }

  // Backwards compatibility
  async listRequests(options) {
    return this.list(options);
  }

  async approve({ requestId, role = 'staff', note = '' }) {
    const res = await apiClient.post('/verify/approve', {
      requestId,
      role,
      note,
    });
    return res?.data || res;
  }

  async reject({ requestId, note = '' }) {
    const res = await apiClient.post('/verify/reject', { requestId, note });
    return res?.data || res;
  }

  async fetchHeadshotBlob(requestId) {
    const response = await fetch(
      `${apiClient.baseURL}/verify/headshot/${requestId}`,
      {
        headers: {
          ...(apiClient.defaultHeaders || {}),
          // include Authorization if apiClient has one
        },
        credentials: apiClient.sendCredentials ? 'include' : 'same-origin',
      }
    );
    if (!response.ok) throw new Error('Failed to load headshot');
    return await response.blob();
  }
}

export const verificationService = new VerificationService();
export default verificationService;
