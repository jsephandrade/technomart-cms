import apiClient from '../client';

const mockDelay = (ms = 300) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const FALLBACK_LOGS = [
  {
    id: 'l1',
    action: 'User Login',
    user: 'user@example.com',
    userId: 'u-1001',
    type: 'login',
    details: 'Login success',
    timestamp: new Date().toISOString(),
  },
  {
    id: 'l2',
    action: 'Menu Item Added',
    user: 'sarah@example.com',
    userId: 'u-1002',
    type: 'action',
    details: 'Added Grilled Chicken',
    timestamp: new Date(Date.now() - 3600_000).toISOString(),
  },
];

class LogsService {
  async list({
    search = '',
    type = '',
    timeRange = '24h',
    page = 1,
    limit = 50,
  } = {}) {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (type) params.set('type', type);
      if (timeRange) params.set('timeRange', timeRange);
      params.set('page', String(page));
      params.set('limit', String(limit));
      const res = await apiClient.get(`/logs?${params.toString()}`);
      if (res && res.success) return res;
      throw new Error('Unexpected response');
    } catch (err) {
      // Fallback to mock
      await mockDelay(200);
      return {
        success: true,
        data: FALLBACK_LOGS,
        pagination: {
          page: 1,
          limit: FALLBACK_LOGS.length,
          total: FALLBACK_LOGS.length,
          totalPages: 1,
        },
      };
    }
  }

  async create({
    action,
    type = 'action',
    details = '',
    severity = '',
    meta = {},
  }) {
    const payload = { action, type, details, severity, meta };
    try {
      const res = await apiClient.post('/logs', payload);
      if (res && res.success) return res.data;
    } catch {}
    // Fallback: mimic success
    await mockDelay(150);
    return {
      id: Date.now().toString(),
      action,
      type,
      details,
      severity,
      timestamp: new Date().toISOString(),
    };
  }

  async summary() {
    try {
      const res = await apiClient.get('/logs/summary');
      if (res && res.success) return res.data;
      throw new Error('Unexpected response');
    } catch {
      await mockDelay(120);
      return {
        today: { login: 5, action: 12, security: 1, system: 2 },
        week: { login: 30, action: 80, security: 6, system: 10 },
        month: { login: 120, action: 320, security: 20, system: 44 },
      };
    }
  }

  async alerts() {
    try {
      const res = await apiClient.get('/logs/alerts');
      if (res && res.success) return res.data;
      throw new Error('Unexpected response');
    } catch {
      await mockDelay(120);
      return [
        {
          id: 'a1',
          type: 'critical',
          severity: 'critical',
          title: 'Failed Login Attempts',
          description:
            'Multiple failed login attempts detected for admin account',
          user: 'admin@technomart.local',
          ip: '203.0.113.14',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'a2',
          type: 'warning',
          severity: 'warning',
          title: 'Password Expiring',
          description: '2 user passwords will expire in 7 days',
          user: 'staff@technomart.local',
          timestamp: new Date(Date.now() - 3600_000).toISOString(),
        },
      ];
    }
  }

  async acknowledgeAlert(alertId) {
    if (!alertId) throw new Error('Alert id required');
    try {
      const res = await apiClient.post(
        `/logs/alerts/${alertId}/acknowledge`,
        {}
      );
      if (res && res.success) return res.data;
      throw new Error('Unexpected response');
    } catch {
      await mockDelay(120);
      return {
        id: String(alertId),
        status: 'acknowledged',
        acknowledgedAt: new Date().toISOString(),
      };
    }
  }

  async dismissAlert(alertId) {
    if (!alertId) throw new Error('Alert id required');
    try {
      const res = await apiClient.post(`/logs/alerts/${alertId}/dismiss`, {});
      if (res && res.success) return res.data;
      throw new Error('Unexpected response');
    } catch {
      await mockDelay(120);
      return {
        id: String(alertId),
        status: 'dismissed',
        dismissedAt: new Date().toISOString(),
      };
    }
  }
}

export const logsService = new LogsService();
export default logsService;
