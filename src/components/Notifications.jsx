import React, { useEffect, useRef, useState } from 'react';
import FeaturePanelCard from '@/components/shared/FeaturePanelCard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, CheckCircle, XCircle, RefreshCw, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { createRealtime } from '@/lib/realtime';
import { notificationsService } from '@/api/services/notificationsService';
import { subscribePush, unsubscribePush } from '@/lib/push';
import { useAuth } from '@/components/AuthContext';
const Notifications = () => {
  const { hasAnyRole } = useAuth();
  const isAdmin = hasAnyRole(['admin']);
  const scope = isAdmin ? 'admin' : undefined;
  const [notifications, setNotifications] = useState([]);
  const [settings, setSettings] = useState({
    emailEnabled: true,
    pushEnabled: false,
    lowStock: true,
    order: true,
    payment: true,
  });

  // Helpers
  const fmtRelative = (iso) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diff = Math.max(0, (now - d) / 1000);
      if (diff < 60) return `${Math.floor(diff)}s ago`;
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
      return d.toLocaleDateString();
    } catch {
      return iso || '';
    }
  };

  const refreshList = async () => {
    try {
      const res = await notificationsService.getRecent({
        limit: 100,
        scope,
      });
      const list = (res?.data || []).map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        createdAt: n.createdAt,
        time: fmtRelative(n.createdAt),
        read: Boolean(n.read || n.isRead),
        type:
          n.type === 'low_stock'
            ? 'warning'
            : n.type === 'new_order'
              ? 'info'
              : n.type === 'payment'
                ? 'success'
                : n.type || 'info',
      }));
      setNotifications(list);
    } catch {
      // leave prior state
    }
  };

  const loadSettings = async () => {
    try {
      const data = await notificationsService.getSettings();
      setSettings({
        emailEnabled: Boolean(data.emailEnabled),
        pushEnabled: Boolean(data.pushEnabled),
        lowStock: Boolean(data.lowStock),
        order: Boolean(data.order),
        payment: Boolean(data.payment),
      });
    } catch {}
  };

  useEffect(() => {
    refreshList();
    loadSettings();
  }, []);

  // Realtime notifications with fallback
  const pollRef = useRef(null);
  useEffect(() => {
    const enableRealtime = Boolean(import.meta?.env?.VITE_WS_URL);
    const startPolling = () => {
      if (pollRef.current) return;
      // Placeholder: in real API, fetch latest notifications here
      pollRef.current = setInterval(() => {
        // no-op polling fallback
      }, 15000);
    };
    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    let rt;
    if (enableRealtime) {
      rt = createRealtime({
        path: '/notifications',
        onMessage: (msg) => {
          if (msg?.type === 'notification' && msg?.data) {
            const n = msg.data;
            const norm = {
              id: n.id || `${Date.now()}`,
              title: n.title || 'Notification',
              message: n.message || '',
              createdAt: n.createdAt || new Date().toISOString(),
              time: fmtRelative(n.createdAt || new Date().toISOString()),
              read: false,
              type:
                n.type === 'low_stock'
                  ? 'warning'
                  : n.type === 'new_order'
                    ? 'info'
                    : n.type === 'payment'
                      ? 'success'
                      : n.type || 'info',
            };
            setNotifications((prev) => [norm, ...prev].slice(0, 100));
          }
        },
        onStatusChange: (status) => {
          if (status === 'open') stopPolling();
          if (
            status === 'reconnecting' ||
            status === 'error' ||
            status === 'closed'
          )
            startPolling();
        },
      });
      startPolling();
    } else {
      startPolling();
    }

    return () => {
      stopPolling();
      rt?.close?.();
    };
  }, []);
  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };
  const markAsRead = async (id) => {
    try {
      await notificationsService.markRead?.(id);
    } catch {}
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };
  const deleteNotification = async (id) => {
    try {
      await notificationsService.delete?.(id);
    } catch {}
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };
  const removeAllNotifications = () => {
    setNotifications([]);
  };
  const handleSettingChange = async (key) => {
    // Special handling for push: request permission before enabling
    if (key === 'pushEnabled') {
      const next = !settings.pushEnabled;
      if (
        next &&
        typeof Notification !== 'undefined' &&
        Notification?.permission !== 'granted'
      ) {
        try {
          const perm = await Notification.requestPermission();
          if (perm !== 'granted') {
            // Do not enable if permission denied
            return;
          }
        } catch {}
      }
      // Register or unregister push subscription
      try {
        if (next) {
          await subscribePush();
        } else {
          await unsubscribePush();
        }
      } catch {}
    }
    const nextState = { ...settings, [key]: !settings[key] };
    setSettings(nextState);
    try {
      await notificationsService.updateSettings(nextState);
    } catch {}
  };
  const unreadCount = notifications.filter((n) => !n.read).length;

  const renderSettingsControls = () => (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label>Email Notifications</Label>
          <p className="text-xs text-muted-foreground">
            Receive alerts via email
          </p>
        </div>
        <Switch
          checked={settings.emailEnabled}
          onCheckedChange={() => handleSettingChange('emailEnabled')}
        />
      </div>
      <Separator />

      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label>Push Notifications</Label>
          <p className="text-xs text-muted-foreground">Browser notifications</p>
        </div>
        <Switch
          checked={settings.pushEnabled}
          onCheckedChange={() => handleSettingChange('pushEnabled')}
        />
      </div>
      <Separator />

      {!isAdmin && (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label>Low Stock Alerts</Label>
              <p className="text-xs text-muted-foreground">
                When inventory is low
              </p>
            </div>
            <Switch
              checked={settings.lowStock}
              onCheckedChange={() => handleSettingChange('lowStock')}
            />
          </div>
          <Separator />

          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label>Order Alerts</Label>
              <p className="text-xs text-muted-foreground">
                New and updated orders
              </p>
            </div>
            <Switch
              checked={settings.order}
              onCheckedChange={() => handleSettingChange('order')}
            />
          </div>
          <Separator />

          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label>Payment Alerts</Label>
              <p className="text-xs text-muted-foreground">
                Payment confirmations
              </p>
            </div>
            <Switch
              checked={settings.payment}
              onCheckedChange={() => handleSettingChange('payment')}
            />
          </div>
        </>
      )}
    </>
  );

  return (
    <Tabs defaultValue="notifications" className="w-full">
      <TabsList>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>

      <TabsContent value="notifications" className="mt-6">
        <div className="space-y-4">
          <FeaturePanelCard
            title="Notification Center"
            titleStyle="accent"
            titleIcon={Bell}
            titleAccentClassName="px-3 py-1 text-xs md:text-sm"
            titleClassName="text-xs md:text-sm"
            description="System alerts and messages"
            badgeText={unreadCount > 0 ? `${unreadCount} unread` : null}
            badgeClassName="text-[10px] md:text-xs"
            headerActions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={markAllAsRead}
                  disabled={unreadCount === 0}
                >
                  Mark all as read
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={removeAllNotifications}
                  disabled={notifications.length === 0}
                >
                  Remove all
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1"
                  onClick={refreshList}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            }
            contentClassName="space-y-5"
          >
            {notifications.length > 0 ? (
              <div className="space-y-4">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`flex items-start justify-between gap-4 rounded-lg border border-border/40 p-3 transition hover:border-border/60 ${notification.read ? 'bg-background' : 'bg-primary/5'}`}
                  >
                    <div className="flex items-start gap-4">
                      <div className="mt-1">
                        {notification.type === 'warning' && (
                          <Bell className="h-5 w-5 text-orange-500" />
                        )}
                        {notification.type === 'info' && (
                          <Bell className="h-5 w-5 text-blue-500" />
                        )}
                        {notification.type === 'success' && (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        )}
                        {notification.type === 'error' && (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <h4
                          className={`font-medium leading-snug ${notification.read ? '' : 'font-semibold text-foreground'}`}
                        >
                          {notification.title}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {notification.message}
                        </p>
                        <span className="block text-xs text-muted-foreground/80">
                          {notification.time}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {!notification.read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => markAsRead(notification.id)}
                        >
                          Mark as read
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Delete notification"
                        onClick={() => deleteNotification(notification.id)}
                      >
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 py-8 text-center">
                <Bell className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">
                  No notifications to display
                </p>
              </div>
            )}
          </FeaturePanelCard>
        </div>
      </TabsContent>

      <TabsContent value="settings" className="mt-6">
        <FeaturePanelCard
          title="Notification Settings"
          titleStyle="accent"
          titleIcon={Settings}
          titleAccentClassName="px-3 py-1 text-xs md:text-sm"
          titleClassName="text-xs md:text-sm"
          description="Configure your notification preferences"
          contentClassName="space-y-4"
        >
          {renderSettingsControls()}
        </FeaturePanelCard>
      </TabsContent>
    </Tabs>
  );
};
export default Notifications;
