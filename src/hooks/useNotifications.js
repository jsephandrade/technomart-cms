import { useState, useEffect, useCallback, useRef } from 'react';
import { notificationsService } from '@/api/services/notificationsService';
import { createRealtime } from '@/lib/realtime';
import { useAuth } from '@/components/AuthContext';

const ADMIN_NOTIFICATION_EVENT_TYPES = new Set([
  'new_user_registration',
  'role_changed',
  'verification_submitted',
  'verification_approved',
  'verification_rejected',
  'system_maintenance',
  'backup_completed',
  'backup_failed',
  'test_notification',
]);

/**
 * Custom hook for managing notifications with real-time updates
 * Provides unread count, notifications list, and real-time WebSocket updates
 */
export function useNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { hasAnyRole } = useAuth();
  const isAdmin = hasAnyRole(['admin']);
  const scope = isAdmin ? 'admin' : undefined;

  // Polling fallback ref
  const pollRef = useRef(null);
  const realtimeRef = useRef(null);

  /**
   * Fetch unread notification count from API
   */
  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await notificationsService.getUnreadCount({
        scope,
      });
      const count =
        response?.count ??
        response?.data?.count ??
        response?.data?.unreadCount ??
        0;
      setUnreadCount(count);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
      setError(err.message || 'Failed to load notifications');
    }
  }, [scope]);

  /**
   * Fetch recent notifications list
   */
  const fetchNotifications = useCallback(
    async (limit = 10) => {
      try {
        setLoading(true);
        const response = await notificationsService.getRecent({
          limit,
          scope,
        });
        const list = response?.data || [];

        // Format notifications
        const formatted = list.map((n) => ({
          id: n.id,
          title: n.title,
          message: n.message,
          createdAt: n.createdAt,
          read: Boolean(n.read || n.isRead),
          type: n.type || 'info',
        }));

        setNotifications(formatted);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch notifications:', err);
        setError(err.message || 'Failed to load notifications');
      } finally {
        setLoading(false);
      }
    },
    [scope]
  );

  /**
   * Mark a notification as read
   */
  const markAsRead = useCallback(async (notificationId) => {
    try {
      await notificationsService.markRead(notificationId);

      // Update local state
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );

      // Update count
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
      throw err;
    }
  }, []);

  /**
   * Mark all notifications as read
   */
  const markAllAsRead = useCallback(async () => {
    try {
      await notificationsService.markAllRead();

      // Update local state
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
      throw err;
    }
  }, []);

  /**
   * Delete a notification
   */
  const deleteNotification = useCallback(async (notificationId) => {
    try {
      await notificationsService.delete(notificationId);

      // Update local state
      setNotifications((prev) => {
        const notification = prev.find((n) => n.id === notificationId);
        if (notification && !notification.read) {
          setUnreadCount((count) => Math.max(0, count - 1));
        }
        return prev.filter((n) => n.id !== notificationId);
      });
    } catch (err) {
      console.error('Failed to delete notification:', err);
      throw err;
    }
  }, []);

  /**
   * Refresh notifications and count
   */
  const refresh = useCallback(async () => {
    await Promise.all([fetchUnreadCount(), fetchNotifications()]);
  }, [fetchUnreadCount, fetchNotifications]);

  /**
   * Start polling for notifications (fallback)
   */
  const startPolling = useCallback(() => {
    if (pollRef.current) return;

    // Poll every 30 seconds
    pollRef.current = setInterval(() => {
      fetchUnreadCount();
    }, 30000);
  }, [fetchUnreadCount]);

  /**
   * Stop polling
   */
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  /**
   * Handle incoming WebSocket notification
   */
  const handleRealtimeNotification = useCallback(
    (message) => {
      if (message?.type === 'notification' && message?.data) {
        const notification = message.data;
        const eventType = String(
          notification?.meta?.event_type ||
            notification?.event_type ||
            notification?.eventType ||
            ''
        ).toLowerCase();
        if (
          isAdmin &&
          (!eventType || !ADMIN_NOTIFICATION_EVENT_TYPES.has(eventType))
        ) {
          return;
        }

        // Format notification
        const formatted = {
          id: notification.id || `${Date.now()}`,
          title: notification.title || 'Notification',
          message: notification.message || '',
          createdAt: notification.createdAt || new Date().toISOString(),
          read: false,
          type: notification.type || 'info',
        };

        // Add to list
        setNotifications((prev) => [formatted, ...prev].slice(0, 100));

        // Increment unread count
        setUnreadCount((prev) => prev + 1);
      } else if (message?.type === 'notification_read') {
        // Handle notification marked as read from another tab/device
        const { notificationId } = message.data || {};
        if (notificationId) {
          setNotifications((prev) =>
            prev.map((n) =>
              n.id === notificationId ? { ...n, read: true } : n
            )
          );
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
      } else if (message?.type === 'notification_deleted') {
        // Handle notification deleted from another tab/device
        const { notificationId } = message.data || {};
        if (notificationId) {
          setNotifications((prev) => {
            const notification = prev.find((n) => n.id === notificationId);
            if (notification && !notification.read) {
              setUnreadCount((count) => Math.max(0, count - 1));
            }
            return prev.filter((n) => n.id !== notificationId);
          });
        }
      }
    },
    [isAdmin]
  );

  /**
   * Setup real-time WebSocket connection
   */
  useEffect(() => {
    // Check if WebSocket is enabled
    const wsUrl = import.meta?.env?.VITE_WS_URL;
    const enableRealtime = Boolean(wsUrl);

    if (enableRealtime) {
      // Create WebSocket connection
      realtimeRef.current = createRealtime({
        path: '/notifications',
        onMessage: handleRealtimeNotification,
        onStatusChange: (status) => {
          if (status === 'open') {
            // Connected, stop polling
            stopPolling();
          } else if (['reconnecting', 'error', 'closed'].includes(status)) {
            // Connection lost, start polling fallback
            startPolling();
          }
        },
      });

      // Start polling as fallback
      startPolling();
    } else {
      // No WebSocket, use polling only
      startPolling();
    }

    // Cleanup
    return () => {
      stopPolling();
      if (realtimeRef.current?.close) {
        realtimeRef.current.close();
      }
    };
  }, [handleRealtimeNotification, startPolling, stopPolling]);

  /**
   * Initial data fetch
   */
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    // State
    unreadCount,
    notifications,
    loading,
    error,

    // Actions
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refresh,
    fetchNotifications,
    fetchUnreadCount,
  };
}
