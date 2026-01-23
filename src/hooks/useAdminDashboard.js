import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import apiClient from '@/api/client';
import userService from '@/api/services/userService';
import verificationService from '@/api/services/verificationService';
import logsService from '@/api/services/logsService';
import notificationsService from '@/api/services/notificationsService';

const DEFAULT_STATS = {
  users: {
    total: 0,
    active: 0,
    pending: 0,
    deactivated: 0,
  },
  pendingVerifications: 0,
  notifications: {
    total: 0,
    unread: 0,
  },
  rolePermissionChanges: 0,
  securityAlerts: 0,
  adminActions: {
    count: 0,
    latest: null,
  },
  systemHealth: {
    status: 'Unknown',
    detail: '',
  },
};

const getTotalCount = (res) => {
  if (!res) return 0;
  if (res?.pagination && typeof res.pagination.total === 'number') {
    return res.pagination.total;
  }
  if (Array.isArray(res?.data)) return res.data.length;
  if (Array.isArray(res)) return res.length;
  return 0;
};

const resolveResult = (result) =>
  result && result.status === 'fulfilled' ? result.value : null;

export const useAdminDashboard = ({ enabled = true } = {}) => {
  const [stats, setStats] = useState(DEFAULT_STATS);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);

  const fetchAdminStats = useCallback(async () => {
    if (!enabled) {
      setStats(DEFAULT_STATS);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const results = await Promise.allSettled([
        userService.getUsers({ limit: 1 }),
        userService.getUsers({ status: 'active', limit: 1 }),
        userService.getUsers({ status: 'pending', limit: 1 }),
        userService.getUsers({ status: 'deactivated', limit: 1 }),
        verificationService.list({ status: 'pending', limit: 1 }),
        notificationsService.list({ limit: 50, scope: 'admin' }),
        logsService.list({
          type: 'action',
          timeRange: '7d',
          search: 'role',
          limit: 1,
        }),
        logsService.list({
          type: 'action',
          timeRange: '7d',
          search: 'permission',
          limit: 1,
        }),
        logsService.list({ type: 'action', timeRange: '24h', limit: 1 }),
        logsService.alerts(),
        apiClient.get('/health'),
        apiClient.get('/health/db'),
      ]);

      const [
        totalUsersResult,
        activeUsersResult,
        pendingUsersResult,
        deactivatedUsersResult,
        pendingVerificationsResult,
        notificationsResult,
        roleLogsResult,
        permissionLogsResult,
        adminActionsResult,
        alertsResult,
        healthResult,
        healthDbResult,
      ] = results;

      const totalUsers = getTotalCount(resolveResult(totalUsersResult));
      const activeUsers = getTotalCount(resolveResult(activeUsersResult));
      const pendingUsers = getTotalCount(resolveResult(pendingUsersResult));
      const deactivatedUsers = getTotalCount(
        resolveResult(deactivatedUsersResult)
      );

      const pendingVerifications = getTotalCount(
        resolveResult(pendingVerificationsResult)
      );

      const notifications = resolveResult(notificationsResult);
      const notificationItems = Array.isArray(notifications?.data)
        ? notifications.data
        : Array.isArray(notifications)
          ? notifications
          : [];
      const totalNotifications = getTotalCount(notifications);
      const unreadNotifications = notificationItems.filter(
        (item) => !item?.read
      ).length;

      const roleChanges = getTotalCount(resolveResult(roleLogsResult));
      const permissionChanges = getTotalCount(
        resolveResult(permissionLogsResult)
      );
      const rolePermissionChanges = roleChanges + permissionChanges;

      const adminActions = resolveResult(adminActionsResult);
      const adminActionsCount = getTotalCount(adminActions);
      const latestAction = Array.isArray(adminActions?.data)
        ? adminActions.data[0]
        : null;

      const alerts = resolveResult(alertsResult);
      const securityAlerts = Array.isArray(alerts) ? alerts.length : 0;

      const health = resolveResult(healthResult);
      const healthDb = resolveResult(healthDbResult);
      const apiOk = health?.status === 'ok';
      const dbConnected = healthDb?.db?.connected === true;
      const hasHealthSignal = Boolean(health || healthDb);
      const healthStatus = hasHealthSignal
        ? apiOk && dbConnected
          ? 'Healthy'
          : 'Degraded'
        : 'Unknown';

      const healthDetailParts = [];
      if (health) {
        healthDetailParts.push(apiOk ? 'API ok' : 'API issue');
      }
      if (healthDb?.db) {
        const dbLabel = dbConnected ? 'DB ok' : 'DB down';
        const pingMs = Number.isFinite(healthDb.db.ping_ms)
          ? `${healthDb.db.ping_ms}ms`
          : '';
        healthDetailParts.push(pingMs ? `${dbLabel} · ${pingMs}` : dbLabel);
      }

      const healthDetail = healthDetailParts.length
        ? healthDetailParts.join(' · ')
        : 'Health checks unavailable';

      setStats({
        users: {
          total: totalUsers,
          active: activeUsers,
          pending: pendingUsers,
          deactivated: deactivatedUsers,
        },
        pendingVerifications,
        notifications: {
          total: totalNotifications,
          unread: unreadNotifications,
        },
        rolePermissionChanges,
        securityAlerts,
        adminActions: {
          count: adminActionsCount,
          latest: latestAction,
        },
        systemHealth: {
          status: healthStatus,
          detail: healthDetail,
        },
      });

      const allRejected = results.every((res) => res.status === 'rejected');
      if (allRejected) {
        setError('Failed to load admin dashboard data');
        toast.error('Error Loading Admin Dashboard', {
          description:
            'Unable to load admin dashboard metrics. Please try again.',
        });
      }
    } catch (err) {
      setError(err?.message || 'Failed to load admin dashboard data');
      toast.error('Error Loading Admin Dashboard', {
        description:
          err?.message ||
          'Unable to load admin dashboard metrics. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchAdminStats();
  }, [fetchAdminStats]);

  return {
    stats,
    loading,
    error,
    refetch: fetchAdminStats,
  };
};

export default useAdminDashboard;
